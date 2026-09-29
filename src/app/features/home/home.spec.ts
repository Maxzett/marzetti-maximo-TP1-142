import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Genero, Pelicula, Puntaje, VentaPelicula } from '../../core/models/pelicula';
import { Funcion } from '../../core/models/sala';
import { Alertas } from '../../core/services/alertas';
import { Auth } from '../../core/services/auth';
import { Catalogo } from '../../core/services/catalogo';
import { Funciones } from '../../core/services/funciones';
import { Home } from './home';

const ACCION: Genero = { id: 'g1', nombre: 'Acción', slug: 'accion' };
const COMEDIA: Genero = { id: 'g2', nombre: 'Comedia', slug: 'comedia' };
const TERROR: Genero = { id: 'g3', nombre: 'Terror', slug: 'terror' };

function pelicula(titulo: string, generos: Genero[] = [], destacada = false): Pelicula {
  return {
    id: titulo.toLowerCase().replaceAll(' ', '-'),
    titulo,
    sinopsis: '',
    poster_url: null,
    duracion_minutos: 100,
    restriccion_edad: 0,
    fecha_estreno: null,
    destacada,
    precio_preventa: null,
    en_cartelera: true,
    generos,
  };
}

const CARTELERA = [
  pelicula('Mar de cenizas', [ACCION]),
  pelicula('Fuego cruzado', [ACCION, COMEDIA]),
  pelicula('Tres pasos atrás', [COMEDIA]),
  pelicula('Órbita', [TERROR]),
];

type FuncionDeHoy = Pick<Funcion, 'pelicula_id' | 'inicio'>;

interface Datos {
  cartelera?: Pelicula[] | null;
  ventas?: VentaPelicula[];
  puntajes?: Puntaje[];
  proximas?: Pelicula[] | null;
  deHoy?: FuncionDeHoy[] | null;
}

describe('Home', () => {
  let harness: RouterTestingHarness;
  let catalogo: {
    cargarCartelera: ReturnType<typeof vi.fn>;
    masVendidas: ReturnType<typeof vi.fn>;
    cargarPuntajes: ReturnType<typeof vi.fn>;
    cargarProximas: ReturnType<typeof vi.fn>;
  };
  let funciones: { cargarDeHoy: ReturnType<typeof vi.fn> };

  async function abrir(url = '/', datos: Datos = {}) {
    const cartelera = datos.cartelera === undefined ? CARTELERA : datos.cartelera;

    catalogo = {
      cargarCartelera: vi.fn(async () => cartelera),
      masVendidas: vi.fn(async () => datos.ventas ?? []),
      cargarPuntajes: vi.fn(
        async () =>
          new Map((datos.puntajes ?? []).map((puntaje) => [puntaje.pelicula_id, puntaje])),
      ),
      cargarProximas: vi.fn(async () => (datos.proximas === undefined ? [] : datos.proximas)),
    };
    funciones = {
      cargarDeHoy: vi.fn(async () => (datos.deHoy === undefined ? [] : datos.deHoy)),
    };

    await TestBed.configureTestingModule({
      providers: [
        // withComponentInputBinding es lo que entrega ?q= y ?genero= como input()
        provideRouter([{ path: '', component: Home }], withComponentInputBinding()),
        { provide: Catalogo, useValue: catalogo },
        { provide: Funciones, useValue: funciones },
        // Lo que necesita el botón de aviso de la franja de estrenos
        { provide: Auth, useValue: { haySesion: signal(false) } },
        { provide: Alertas, useValue: { peliculasConAlerta: signal(new Set<string>()) } },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, Home);
    await harness.fixture.whenStable();
  }

  const raiz = () => harness.routeNativeElement as HTMLElement;
  const router = () => TestBed.inject(Router);
  const buscador = () => raiz().querySelector<HTMLInputElement>('input[type="search"]')!;
  const chips = () => Array.from(raiz().querySelectorAll<HTMLButtonElement>('app-chip button'));
  const chip = (nombre: string) => chips().find((c) => c.textContent?.includes(nombre))!;
  const titulos = () =>
    Array.from(raiz().querySelectorAll('.grilla app-ficha-pelicula h3')).map((h) =>
      h.textContent?.trim(),
    );
  const titulosDelTop = () =>
    Array.from(raiz().querySelectorAll('app-podio h3')).map((h) => h.textContent?.trim());
  const resumen = () => raiz().querySelector('.resumen')?.textContent?.trim();

  async function escribir(texto: string) {
    buscador().value = texto;
    buscador().dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
  }

  async function alternar(nombre: string) {
    chip(nombre).click();
    await harness.fixture.whenStable();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('el top de ventas (RF-04)', () => {
    const VENTAS: VentaPelicula[] = [
      { pelicula_id: 'tres-pasos-atrás', entradas: 1284 },
      { pelicula_id: 'mar-de-cenizas', entradas: 1031 },
      { pelicula_id: 'fuego-cruzado', entradas: 902 },
    ];

    it('muestra las películas en el orden que las devuelve la base', async () => {
      await abrir('/', { ventas: VENTAS });

      expect(titulosDelTop()).toEqual(['Tres pasos atrás', 'Mar de cenizas', 'Fuego cruzado']);
    });

    it('numera los puestos en una lista ordenada', async () => {
      await abrir('/', { ventas: VENTAS });

      const puestos = Array.from(raiz().querySelectorAll('ol.podio .insignia__numero')).map((p) =>
        p.textContent?.trim(),
      );
      expect(puestos).toEqual(['Puesto 1', 'Puesto 2', 'Puesto 3']);
    });

    it('pide 3 a la base', async () => {
      await abrir('/', { ventas: VENTAS });

      expect(catalogo.masVendidas).toHaveBeenCalledWith(3);
    });

    it('va antes que el resto de la cartelera, en el documento', async () => {
      await abrir('/', { ventas: VENTAS });

      const encabezados = Array.from(raiz().querySelectorAll('h2')).map((h) => h.textContent);
      expect(encabezados).toEqual(['Las 3 más vendidas', 'En cartelera']);
    });

    // La cantidad de entradas ordena el ranking, pero es un dato interno del cine
    it('no muestra cuántas entradas se vendieron', async () => {
      await abrir('/', { ventas: VENTAS });

      expect(raiz().querySelector('app-podio')?.textContent).not.toMatch(
        /1.?284|1.?031|902|entradas/,
      );
    });

    // Cerca de la medianoche la base y el navegador pueden discrepar en qué día es hoy
    it('descarta una fila del ranking cuya película no está en la cartelera y renumera', async () => {
      await abrir('/', {
        ventas: [
          { pelicula_id: 'fantasma', entradas: 99 },
          { pelicula_id: 'mar-de-cenizas', entradas: 5 },
        ],
      });

      expect(titulosDelTop()).toEqual(['Mar de cenizas']);
      expect(raiz().querySelector('.entrada')).not.toBeNull();
    });

    it('sin ventas en el ranking no hay podio', async () => {
      await abrir('/');

      expect(raiz().querySelector('app-podio')).toBeNull();
    });

    describe('las funciones de hoy', () => {
      it('las pide solo para las películas del top', async () => {
        await abrir('/', { ventas: VENTAS });

        expect(funciones.cargarDeHoy).toHaveBeenCalledWith([
          'tres-pasos-atrás',
          'mar-de-cenizas',
          'fuego-cruzado',
        ]);
      });

      it('el talón lista los horarios del primero, sin repetir dos salas a la misma hora', async () => {
        await abrir('/', {
          ventas: VENTAS,
          deHoy: [
            { pelicula_id: 'tres-pasos-atrás', inicio: '2026-09-29T21:40:00Z' },
            { pelicula_id: 'tres-pasos-atrás', inicio: '2026-09-29T21:40:00Z' },
            { pelicula_id: 'tres-pasos-atrás', inicio: '2026-09-30T00:10:00Z' },
            { pelicula_id: 'mar-de-cenizas', inicio: '2026-09-29T22:20:00Z' },
          ],
        });

        const horas = Array.from(raiz().querySelectorAll('.talon__horas li')).map(
          (li) => li.textContent,
        );
        expect(horas).toEqual(['18:40', '21:10']);
        expect(raiz().querySelector('.ficha__hoy')?.textContent).toContain('Hoy 19:20');
      });

      it('sin funciones hoy lo dice', async () => {
        await abrir('/', { ventas: VENTAS, deHoy: [] });

        expect(raiz().querySelector('.talon')?.textContent).toContain('No quedan funciones hoy');
      });

      // Si la consulta falla no se sabe si hay funciones: no se afirma que no las hay
      it('si la consulta falla, manda a la ficha', async () => {
        await abrir('/', { ventas: VENTAS, deHoy: null });

        expect(raiz().querySelector('.talon')?.textContent).toContain('Horarios en la ficha');
        expect(raiz().querySelector('.ficha__hoy')).toBeNull();
      });
    });

    // Un enlace por puesto: el "Comprar" del talón es visual
    it('cada puesto tiene un solo enlace, a la ficha de la película', async () => {
      await abrir('/', { ventas: VENTAS });

      const enlaces = Array.from(raiz().querySelectorAll('app-podio a'));
      expect(enlaces.map((a) => decodeURI(a.getAttribute('href') ?? ''))).toEqual([
        '/peliculas/tres-pasos-atrás',
        '/peliculas/mar-de-cenizas',
        '/peliculas/fuego-cruzado',
      ]);
      expect(raiz().querySelector('.talon__comprar')?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('la grilla y las destacadas (RF-07)', () => {
    it('lista toda la cartelera y dice cuántas son', async () => {
      await abrir();

      expect(titulos()).toEqual(['Mar de cenizas', 'Fuego cruzado', 'Tres pasos atrás', 'Órbita']);
      expect(resumen()).toBe('4 películas en cartelera');
    });

    it('pone las destacadas primero, sin desordenar el resto', async () => {
      await abrir('/', {
        cartelera: [pelicula('A'), pelicula('B', [], true), pelicula('C'), pelicula('D', [], true)],
      });

      expect(titulos()).toEqual(['B', 'D', 'A', 'C']);
      expect(raiz().querySelectorAll('.grilla .destacada')).toHaveLength(2);
    });

    it('muestra el promedio de cada película que lo tiene', async () => {
      await abrir('/', { puntajes: [{ pelicula_id: 'órbita', promedio: 4.5, cantidad: 6 }] });

      expect(raiz().textContent).toContain('4,5');
    });

    it('a las que no tienen reseñas les dice "Sin reseñas"', async () => {
      await abrir();

      expect(raiz().textContent).toContain('Sin reseñas');
    });
  });

  describe('sin filtros', () => {
    it('ofrece un chip por cada género que tiene películas, en orden alfabético', async () => {
      await abrir();

      expect(chips().map((c) => c.textContent?.trim())).toEqual(['Acción', 'Comedia', 'Terror']);
    });

    it('no ofrece un género que ninguna película en cartelera tiene', async () => {
      await abrir('/', { cartelera: [pelicula('Mar de cenizas', [ACCION])] });

      expect(chips().map((c) => c.textContent?.trim())).toEqual(['Acción']);
    });

    it('con una sola película usa el singular', async () => {
      await abrir('/', { cartelera: [pelicula('Mar de cenizas', [ACCION])] });

      expect(resumen()).toBe('1 película en cartelera');
    });

    it('no ofrece limpiar: no hay nada que limpiar', async () => {
      await abrir();

      expect(raiz().querySelector('.limpiar')).toBeNull();
    });
  });

  describe('el buscador (RF-05)', () => {
    it('filtra por el nombre mientras se escribe, sin tildes ni mayúsculas', async () => {
      await abrir();

      await escribir('ORBITA');

      expect(titulos()).toEqual(['Órbita']);
      expect(resumen()).toBe('1 de 4 películas');
    });

    it('escribe la búsqueda en la URL', async () => {
      await abrir();

      await escribir('mar');

      expect(router().url).toBe('/?q=mar');
    });

    it('reemplaza la entrada del historial en vez de sumar una por tecla', async () => {
      await abrir();
      const antes = history.length;

      await escribir('m');
      await escribir('ma');
      await escribir('mar');

      expect(history.length).toBe(antes);
    });

    it('al borrar el texto saca el parámetro de la URL', async () => {
      await abrir('/?q=mar');

      await escribir('');

      expect(router().url).toBe('/');
    });

    it('trae el texto de la URL al abrir la pantalla', async () => {
      await abrir('/?q=fuego');

      expect(buscador().value).toBe('fuego');
      expect(titulos()).toEqual(['Fuego cruzado']);
    });
  });

  describe('el filtro por género (RF-06)', () => {
    it('elegir un género deja las películas que lo tienen y lo marca activo', async () => {
      await abrir();

      await alternar('Acción');

      expect(titulos()).toEqual(['Mar de cenizas', 'Fuego cruzado']);
      expect(chip('Acción').getAttribute('aria-pressed')).toBe('true');
      expect(chip('Comedia').getAttribute('aria-pressed')).toBe('false');
    });

    // La decisión de diseño: AND. Con OR serían tres películas, no una
    it('con dos géneros deja solo las que tienen los dos', async () => {
      await abrir();

      await alternar('Acción');
      await alternar('Comedia');

      expect(titulos()).toEqual(['Fuego cruzado']);
    });

    it('el texto de ayuda dice que se combinan', async () => {
      await abrir();

      expect(raiz().querySelector('legend')?.textContent).toContain('todos los que elijas');
    });

    it('escribe los géneros en la URL, separados por coma', async () => {
      await abrir();

      await alternar('Acción');
      expect(router().url).toBe('/?genero=accion');

      await alternar('Comedia');
      expect(router().url).toBe('/?genero=accion,comedia');
    });

    it('desmarcar un género lo saca de la URL y de los resultados', async () => {
      await abrir('/?genero=accion,comedia');

      await alternar('Comedia');

      expect(router().url).toBe('/?genero=accion');
      expect(titulos()).toEqual(['Mar de cenizas', 'Fuego cruzado']);
    });

    it('trae los géneros de la URL al abrir la pantalla', async () => {
      await abrir('/?genero=accion,comedia');

      expect(chip('Acción').getAttribute('aria-pressed')).toBe('true');
      expect(chip('Comedia').getAttribute('aria-pressed')).toBe('true');
      expect(titulos()).toEqual(['Fuego cruzado']);
    });
  });

  describe('los dos filtros combinados', () => {
    it('el texto y el género se aplican a la vez', async () => {
      await abrir();

      await alternar('Acción');
      await escribir('fuego');

      expect(titulos()).toEqual(['Fuego cruzado']);
      expect(router().url).toBe('/?q=fuego&genero=accion');
    });

    it('una URL con ambos filtros los restaura juntos', async () => {
      await abrir('/?q=mar&genero=accion');

      expect(buscador().value).toBe('mar');
      expect(titulos()).toEqual(['Mar de cenizas']);
    });

    it('"Limpiar filtros" del panel borra todo y limpia la URL', async () => {
      await abrir('/?q=mar&genero=accion');

      raiz().querySelector<HTMLButtonElement>('.limpiar')?.click();
      await harness.fixture.whenStable();

      expect(buscador().value).toBe('');
      expect(titulos()).toHaveLength(4);
      expect(router().url).toBe('/');
    });
  });

  describe('sin resultados', () => {
    it('avisa y ofrece limpiar los filtros', async () => {
      await abrir();

      await escribir('zzz');

      expect(raiz().textContent).toContain('Ninguna película coincide');
      expect(resumen()).toBe('No hay películas que coincidan.');
      expect(raiz().querySelector('.grilla')).toBeNull();
    });

    it('"Limpiar filtros" del aviso borra el texto y los géneros, y limpia la URL', async () => {
      await abrir('/?q=zzz&genero=accion');

      raiz().querySelector<HTMLButtonElement>('app-mensaje button')?.click();
      await harness.fixture.whenStable();

      expect(buscador().value).toBe('');
      expect(chip('Acción').getAttribute('aria-pressed')).toBe('false');
      expect(titulos()).toHaveLength(4);
      expect(router().url).toBe('/');
    });

    it('con una cartelera vacía lo dice, en vez de dejar la pantalla en blanco', async () => {
      await abrir('/', { cartelera: [] });

      expect(raiz().textContent).toContain('Todavía no hay películas en cartelera');
    });
  });

  describe('la URL manda cuando el cambio viene de afuera', () => {
    // El enlace "Cartelera" del header lleva a / a secas
    it('volver a / sin parámetros reinicia los filtros', async () => {
      await abrir('/?q=mar&genero=accion');
      expect(titulos()).toEqual(['Mar de cenizas']);

      await harness.navigateByUrl('/');
      await harness.fixture.whenStable();

      expect(buscador().value).toBe('');
      expect(titulos()).toHaveLength(4);
    });
  });

  describe('Próximamente (RF-08)', () => {
    const futura = (titulo: string): Pelicula => ({
      ...pelicula(titulo),
      fecha_estreno: '2999-01-07',
    });

    it('muestra los cuatro estrenos más cercanos y enlaza a la sección', async () => {
      await abrir('/', {
        proximas: [futura('X'), futura('Y'), futura('Z'), futura('W'), futura('V')],
      });

      const estrenos = Array.from(raiz().querySelectorAll('app-estrenos h3')).map((h) =>
        h.textContent?.trim(),
      );
      expect(estrenos).toEqual(['X', 'Y', 'Z', 'W']);
      expect(raiz().querySelector('a[href="/proximamente"]')).not.toBeNull();
    });

    it('si Próximamente falla, la portada sigue sin esa franja', async () => {
      await abrir('/', { proximas: null });

      expect(raiz().querySelector('#titulo-proximas')).toBeNull();
      expect(titulos()).toHaveLength(4);
    });
  });

  describe('estados', () => {
    it('tiene un h1 que nombra la pantalla', async () => {
      await abrir();

      expect(raiz().querySelector('h1')?.textContent).toContain('Cartelera');
    });

    it('muestra un spinner mientras carga', async () => {
      await TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: '', component: Home }], withComponentInputBinding()),
          {
            provide: Catalogo,
            useValue: {
              cargarCartelera: vi.fn(() => new Promise<Pelicula[]>(() => {})),
              masVendidas: vi.fn(async () => []),
              cargarPuntajes: vi.fn(async () => new Map()),
              cargarProximas: vi.fn(async () => []),
            },
          },
          { provide: Funciones, useValue: { cargarDeHoy: vi.fn(async () => []) } },
        ],
      }).compileComponents();

      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/', Home);
      harness.detectChanges();

      expect(raiz().querySelector('app-spinner')).not.toBeNull();
    });

    it('avisa cuando la base falla y deja reintentar', async () => {
      await abrir('/', { cartelera: null });

      expect(raiz().querySelector('app-mensaje')?.textContent).toContain(
        'No pudimos cargar la cartelera',
      );

      catalogo.cargarCartelera.mockResolvedValue(CARTELERA);
      raiz().querySelector<HTMLButtonElement>('app-mensaje button')?.click();
      await harness.fixture.whenStable();

      expect(catalogo.cargarCartelera).toHaveBeenCalledTimes(2);
      expect(raiz().querySelector('app-mensaje')).toBeNull();
      expect(titulos()).toHaveLength(4);
    });
  });
});
