import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Pelicula, Puntaje, VentaPelicula } from '../../core/models/pelicula';
import { Catalogo } from '../../core/services/catalogo';
import { Home } from './home';

function pelicula(id: string, destacada = false): Pelicula {
  return {
    id,
    titulo: `Película ${id}`,
    sinopsis: '',
    poster_url: null,
    duracion_minutos: 100,
    restriccion_edad: 0,
    fecha_estreno: null,
    destacada,
    precio_preventa: null,
    generos: [],
  };
}

interface Datos {
  cartelera: Pelicula[] | null;
  ventas?: VentaPelicula[];
  puntajes?: Puntaje[];
}

describe('Home', () => {
  let fixture: ComponentFixture<Home>;
  let catalogo: {
    cargarCartelera: ReturnType<typeof vi.fn>;
    masVendidas: ReturnType<typeof vi.fn>;
    cargarPuntajes: ReturnType<typeof vi.fn>;
  };

  async function crear(datos: Datos) {
    catalogo = {
      cargarCartelera: vi.fn(async () => datos.cartelera),
      masVendidas: vi.fn(async () => datos.ventas ?? []),
      cargarPuntajes: vi.fn(
        async () =>
          new Map((datos.puntajes ?? []).map((puntaje) => [puntaje.pelicula_id, puntaje])),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([]), { provide: Catalogo, useValue: catalogo }],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const titulosDe = (seccion: string) =>
    Array.from(raiz().querySelectorAll(`[aria-labelledby="${seccion}"] h3`)).map((h) =>
      h.textContent?.trim(),
    );

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('el top de ventas (RF-04)', () => {
    const CARTELERA = [pelicula('a'), pelicula('b'), pelicula('c'), pelicula('d', true)];
    const VENTAS: VentaPelicula[] = [
      { pelicula_id: 'c', entradas: 40 },
      { pelicula_id: 'a', entradas: 25 },
      { pelicula_id: 'b', entradas: 10 },
    ];

    it('muestra las películas en el orden que las devuelve la base', async () => {
      await crear({ cartelera: CARTELERA, ventas: VENTAS });

      expect(titulosDe('titulo-top')).toEqual(['Película c', 'Película a', 'Película b']);
    });

    it('numera los puestos 1, 2 y 3', async () => {
      await crear({ cartelera: CARTELERA, ventas: VENTAS });

      const puestos = Array.from(raiz().querySelectorAll('.puesto')).map((p) => p.textContent);
      expect(puestos.map((p) => p?.trim())).toEqual(['N.º 1', 'N.º 2', 'N.º 3']);
    });

    it('pide 3 a la base', async () => {
      await crear({ cartelera: CARTELERA, ventas: VENTAS });

      expect(catalogo.masVendidas).toHaveBeenCalledWith(3);
    });

    it('va antes que el resto de la cartelera, en el documento', async () => {
      await crear({ cartelera: CARTELERA, ventas: VENTAS });

      const encabezados = Array.from(raiz().querySelectorAll('h2')).map((h) => h.textContent);
      expect(encabezados).toEqual(['Las 3 más vendidas', 'En cartelera']);
    });

    // Hasta la F6 no hay compras: todas empatan en 0 y la portada no debe afirmar lo contrario
    it('no dice cuántas entradas se vendieron cuando son cero', async () => {
      await crear({
        cartelera: CARTELERA,
        ventas: VENTAS.map((venta) => ({ ...venta, entradas: 0 })),
      });

      // El título de la sección también dice "vendidas": se mira la línea de cada ficha
      expect(raiz().querySelector('.ventas')).toBeNull();
    });

    it('dice cuántas entradas se vendieron cuando hay ventas', async () => {
      await crear({ cartelera: CARTELERA, ventas: VENTAS });

      expect(raiz().textContent).toContain('40 entradas vendidas');
    });

    // Cerca de la medianoche la base y el navegador pueden discrepar en qué día es hoy
    it('descarta una fila del ranking cuya película no está en la cartelera y renumera', async () => {
      await crear({
        cartelera: CARTELERA,
        ventas: [
          { pelicula_id: 'fantasma', entradas: 99 },
          { pelicula_id: 'a', entradas: 5 },
        ],
      });

      expect(titulosDe('titulo-top')).toEqual(['Película a']);
      expect(raiz().querySelector('.puesto')?.textContent).toContain('N.º 1');
    });
  });

  describe('las destacadas (RF-07)', () => {
    it('muestra las destacadas que no están en el top', async () => {
      await crear({
        cartelera: [pelicula('a', true), pelicula('b', true), pelicula('c')],
        ventas: [{ pelicula_id: 'a', entradas: 1 }],
      });

      expect(titulosDe('titulo-destacadas')).toEqual(['Película b']);
    });

    it('no repite una película que ya está en el top', async () => {
      await crear({
        cartelera: [pelicula('a', true)],
        ventas: [{ pelicula_id: 'a', entradas: 1 }],
      });

      expect(raiz().querySelector('[aria-labelledby="titulo-destacadas"]')).toBeNull();
    });

    it('no muestra las que el administrador no destacó', async () => {
      await crear({
        cartelera: [pelicula('a'), pelicula('b')],
        ventas: [{ pelicula_id: 'a', entradas: 1 }],
      });

      expect(raiz().textContent).not.toContain('Película b');
    });
  });

  describe('puntajes', () => {
    it('muestra el promedio de cada película que lo tiene', async () => {
      await crear({
        cartelera: [pelicula('a')],
        ventas: [{ pelicula_id: 'a', entradas: 1 }],
        puntajes: [{ pelicula_id: 'a', promedio: 4.5, cantidad: 6 }],
      });

      expect(raiz().textContent).toContain('4,5');
    });

    it('a las que no tienen reseñas les dice "Sin reseñas"', async () => {
      await crear({ cartelera: [pelicula('a')], ventas: [{ pelicula_id: 'a', entradas: 1 }] });

      expect(raiz().textContent).toContain('Sin reseñas');
    });
  });

  describe('estados', () => {
    it('muestra un spinner mientras carga', async () => {
      catalogo = {
        cargarCartelera: vi.fn(() => new Promise<Pelicula[]>(() => {})),
        masVendidas: vi.fn(async () => []),
        cargarPuntajes: vi.fn(async () => new Map()),
      };
      await TestBed.configureTestingModule({
        imports: [Home],
        providers: [provideRouter([]), { provide: Catalogo, useValue: catalogo }],
      }).compileComponents();

      fixture = TestBed.createComponent(Home);
      fixture.detectChanges();

      expect(raiz().querySelector('app-spinner')).not.toBeNull();
    });

    it('avisa cuando la base falla y deja reintentar', async () => {
      await crear({ cartelera: null });

      expect(raiz().querySelector('app-mensaje')?.textContent).toContain(
        'No pudimos cargar la cartelera',
      );

      catalogo.cargarCartelera.mockResolvedValue([pelicula('a')]);
      catalogo.masVendidas.mockResolvedValue([{ pelicula_id: 'a', entradas: 1 }]);
      raiz().querySelector<HTMLButtonElement>('button')?.click();
      await fixture.whenStable();

      expect(catalogo.cargarCartelera).toHaveBeenCalledTimes(2);
      expect(raiz().querySelector('app-mensaje')).toBeNull();
      expect(titulosDe('titulo-top')).toEqual(['Película a']);
    });

    it('con una cartelera vacía lo dice, en vez de dejar la pantalla en blanco', async () => {
      await crear({ cartelera: [] });

      expect(raiz().textContent).toContain('Todavía no hay películas en cartelera');
    });

    it('lleva al catálogo completo', async () => {
      await crear({ cartelera: [pelicula('a')], ventas: [{ pelicula_id: 'a', entradas: 1 }] });

      const enlace = raiz().querySelector<HTMLAnchorElement>('a.boton');
      expect(enlace?.getAttribute('href')).toBe('/peliculas');
    });
  });
});
