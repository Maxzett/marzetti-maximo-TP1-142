import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Genero, Pelicula } from '../../core/models/pelicula';
import { Catalogo } from '../../core/services/catalogo';
import { Peliculas } from './peliculas';

const ACCION: Genero = { id: 'g1', nombre: 'Acción', slug: 'accion' };
const COMEDIA: Genero = { id: 'g2', nombre: 'Comedia', slug: 'comedia' };
const TERROR: Genero = { id: 'g3', nombre: 'Terror', slug: 'terror' };

function pelicula(titulo: string, generos: Genero[]): Pelicula {
  return {
    id: titulo.toLowerCase().replaceAll(' ', '-'),
    titulo,
    sinopsis: '',
    poster_url: null,
    duracion_minutos: 100,
    restriccion_edad: 0,
    fecha_estreno: null,
    destacada: false,
    precio_preventa: null,
    generos,
  };
}

const CARTELERA = [
  pelicula('Mar de cenizas', [ACCION]),
  pelicula('Fuego cruzado', [ACCION, COMEDIA]),
  pelicula('Tres pasos atrás', [COMEDIA]),
  pelicula('Órbita', [TERROR]),
];

describe('Peliculas', () => {
  let harness: RouterTestingHarness;

  async function abrir(url: string, cartelera: Pelicula[] | null = CARTELERA) {
    await TestBed.configureTestingModule({
      providers: [
        // withComponentInputBinding es lo que entrega ?q= y ?genero= como input()
        provideRouter([{ path: 'peliculas', component: Peliculas }], withComponentInputBinding()),
        {
          provide: Catalogo,
          useValue: {
            cargarCartelera: vi.fn(async () => cartelera),
            cargarPuntajes: vi.fn(async () => new Map()),
          },
        },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    const componente = await harness.navigateByUrl(url, Peliculas);
    await harness.fixture.whenStable();
    return componente;
  }

  const raiz = () => harness.routeNativeElement as HTMLElement;
  const router = () => TestBed.inject(Router);
  const buscador = () => raiz().querySelector<HTMLInputElement>('input[type="search"]')!;
  const chips = () => Array.from(raiz().querySelectorAll<HTMLButtonElement>('app-chip button'));
  const chip = (nombre: string) => chips().find((c) => c.textContent?.includes(nombre))!;
  const titulos = () =>
    Array.from(raiz().querySelectorAll('app-ficha-pelicula h3')).map((h) => h.textContent?.trim());
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

  describe('sin filtros', () => {
    it('lista todo el catálogo y dice cuántas son', async () => {
      await abrir('/peliculas');

      expect(titulos()).toEqual(['Mar de cenizas', 'Fuego cruzado', 'Tres pasos atrás', 'Órbita']);
      expect(resumen()).toBe('4 películas');
    });

    it('ofrece un chip por cada género que tiene películas, en orden alfabético', async () => {
      await abrir('/peliculas');

      expect(chips().map((c) => c.textContent?.trim())).toEqual(['Acción', 'Comedia', 'Terror']);
    });

    it('no ofrece un género que ninguna película en cartelera tiene', async () => {
      await abrir('/peliculas', [pelicula('Mar de cenizas', [ACCION])]);

      expect(chips().map((c) => c.textContent?.trim())).toEqual(['Acción']);
    });

    it('con una sola película usa el singular', async () => {
      await abrir('/peliculas', [pelicula('Mar de cenizas', [ACCION])]);

      expect(resumen()).toBe('1 película');
    });
  });

  describe('el buscador (RF-05)', () => {
    it('filtra por el nombre mientras se escribe, sin tildes ni mayúsculas', async () => {
      await abrir('/peliculas');

      await escribir('ORBITA');

      expect(titulos()).toEqual(['Órbita']);
      expect(resumen()).toBe('1 película');
    });

    it('escribe la búsqueda en la URL', async () => {
      await abrir('/peliculas');

      await escribir('mar');

      expect(router().url).toBe('/peliculas?q=mar');
    });

    it('reemplaza la entrada del historial en vez de sumar una por tecla', async () => {
      await abrir('/peliculas');
      const antes = history.length;

      await escribir('m');
      await escribir('ma');
      await escribir('mar');

      expect(history.length).toBe(antes);
    });

    it('al borrar el texto saca el parámetro de la URL', async () => {
      await abrir('/peliculas?q=mar');

      await escribir('');

      expect(router().url).toBe('/peliculas');
    });

    it('trae el texto de la URL al abrir la pantalla', async () => {
      await abrir('/peliculas?q=fuego');

      expect(buscador().value).toBe('fuego');
      expect(titulos()).toEqual(['Fuego cruzado']);
    });
  });

  describe('el filtro por género (RF-06)', () => {
    it('elegir un género deja las películas que lo tienen y lo marca activo', async () => {
      await abrir('/peliculas');

      await alternar('Acción');

      expect(titulos()).toEqual(['Mar de cenizas', 'Fuego cruzado']);
      expect(chip('Acción').getAttribute('aria-pressed')).toBe('true');
      expect(chip('Comedia').getAttribute('aria-pressed')).toBe('false');
    });

    // La decisión de diseño: AND. Con OR serían tres películas, no una
    it('con dos géneros deja solo las que tienen los dos', async () => {
      await abrir('/peliculas');

      await alternar('Acción');
      await alternar('Comedia');

      expect(titulos()).toEqual(['Fuego cruzado']);
    });

    it('avisa que los géneros se combinan, cuando hay más de uno elegido', async () => {
      await abrir('/peliculas');
      expect(raiz().querySelector('.nota')).toBeNull();

      await alternar('Acción');
      expect(raiz().querySelector('.nota')).toBeNull();

      await alternar('Comedia');
      expect(raiz().querySelector('.nota')?.textContent).toContain('todos los géneros');
    });

    it('escribe los géneros en la URL, separados por coma', async () => {
      await abrir('/peliculas');

      await alternar('Acción');
      expect(router().url).toBe('/peliculas?genero=accion');

      await alternar('Comedia');
      expect(router().url).toBe('/peliculas?genero=accion,comedia');
    });

    it('desmarcar un género lo saca de la URL y de los resultados', async () => {
      await abrir('/peliculas?genero=accion,comedia');

      await alternar('Comedia');

      expect(router().url).toBe('/peliculas?genero=accion');
      expect(titulos()).toEqual(['Mar de cenizas', 'Fuego cruzado']);
    });

    it('trae los géneros de la URL al abrir la pantalla', async () => {
      await abrir('/peliculas?genero=accion,comedia');

      expect(chip('Acción').getAttribute('aria-pressed')).toBe('true');
      expect(chip('Comedia').getAttribute('aria-pressed')).toBe('true');
      expect(titulos()).toEqual(['Fuego cruzado']);
    });
  });

  describe('los dos filtros combinados', () => {
    it('el texto y el género se aplican a la vez', async () => {
      await abrir('/peliculas');

      await alternar('Acción');
      await escribir('fuego');

      expect(titulos()).toEqual(['Fuego cruzado']);
      expect(router().url).toBe('/peliculas?q=fuego&genero=accion');
    });

    it('una URL con ambos filtros los restaura juntos', async () => {
      await abrir('/peliculas?q=mar&genero=accion');

      expect(buscador().value).toBe('mar');
      expect(titulos()).toEqual(['Mar de cenizas']);
    });
  });

  describe('sin resultados', () => {
    it('avisa y ofrece limpiar los filtros', async () => {
      await abrir('/peliculas');

      await escribir('zzz');

      expect(raiz().textContent).toContain('Ninguna película coincide');
      expect(resumen()).toBe('No hay películas que coincidan.');
      expect(raiz().querySelector('app-ficha-pelicula')).toBeNull();
    });

    it('"Limpiar filtros" borra el texto y los géneros, y limpia la URL', async () => {
      await abrir('/peliculas?q=zzz&genero=accion');

      raiz().querySelector<HTMLButtonElement>('app-mensaje button')?.click();
      await harness.fixture.whenStable();

      expect(buscador().value).toBe('');
      expect(chip('Acción').getAttribute('aria-pressed')).toBe('false');
      expect(titulos()).toHaveLength(4);
      expect(router().url).toBe('/peliculas');
    });

    it('un catálogo vacío sin filtros no muestra "limpiar filtros": no hay nada que limpiar', async () => {
      await abrir('/peliculas', []);

      expect(raiz().querySelector('app-mensaje')).toBeNull();
      expect(resumen()).toBe('No hay películas que coincidan.');
    });
  });

  describe('la URL manda cuando el cambio viene de afuera', () => {
    // El enlace "Películas" del header lleva a /peliculas a secas
    it('volver a /peliculas sin parámetros reinicia los filtros', async () => {
      await abrir('/peliculas?q=mar&genero=accion');
      expect(titulos()).toEqual(['Mar de cenizas']);

      await harness.navigateByUrl('/peliculas');
      await harness.fixture.whenStable();

      expect(buscador().value).toBe('');
      expect(titulos()).toHaveLength(4);
    });
  });

  describe('estados de carga', () => {
    it('avisa cuando la base falla', async () => {
      await abrir('/peliculas', null);

      expect(raiz().querySelector('app-mensaje')?.textContent).toContain(
        'No pudimos cargar las películas',
      );
      expect(raiz().querySelector('app-ficha-pelicula')).toBeNull();
    });
  });
});
