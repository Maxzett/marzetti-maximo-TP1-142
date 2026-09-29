import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PeliculasGestionadas } from '../../core/models/gestion';
import { Pelicula } from '../../core/models/pelicula';
import { Gestion } from '../../core/services/gestion';
import { hoyIso, sumarDias } from '../../shared/selector-fecha/fechas';
import { AdminPeliculas } from './admin-peliculas';

const ACCION = { id: 'g1', nombre: 'Acción', slug: 'accion' };

const EN_CARTELERA: Pelicula = {
  id: 'p1',
  titulo: 'Mar de cenizas',
  sinopsis: 'Una piloto.',
  poster_url: null,
  duracion_minutos: 131,
  restriccion_edad: 13,
  fecha_estreno: null,
  destacada: true,
  precio_preventa: null,
  en_cartelera: true,
  generos: [ACCION],
};

const EN_PREVENTA: Pelicula = {
  ...EN_CARTELERA,
  id: 'p2',
  titulo: 'Cielo de papel',
  destacada: false,
  fecha_estreno: sumarDias(hoyIso(), 3),
  precio_preventa: 3500,
  en_cartelera: false,
};

/** Estrenada pero sin funciones por delante: ya salió de cartel (en_cartelera, 0028) */
const SIN_FUNCIONES: Pelicula = {
  ...EN_CARTELERA,
  id: 'p3',
  titulo: 'Sombras en el altiplano',
  destacada: false,
  fecha_estreno: sumarDias(hoyIso(), -90),
  en_cartelera: false,
};

const DATOS: PeliculasGestionadas = {
  peliculas: [EN_CARTELERA, EN_PREVENTA, SIN_FUNCIONES],
  generos: [ACCION],
};

describe('AdminPeliculas', () => {
  let fixture: ComponentFixture<AdminPeliculas>;

  async function crear(datos: PeliculasGestionadas | null = DATOS) {
    await TestBed.configureTestingModule({
      imports: [AdminPeliculas],
      providers: [
        provideRouter([]),
        { provide: Gestion, useValue: { cargarPeliculas: vi.fn(async () => datos) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPeliculas);
    await fixture.whenStable();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const filas = () =>
    Array.from(raiz().querySelectorAll('tbody tr')).map((f) => f.textContent?.replace(/\s+/g, ' '));

  afterEach(() => TestBed.resetTestingModule());

  it('lista las películas con su estado escrito', async () => {
    await crear();

    expect(filas()[0]).toContain('Mar de cenizas');
    expect(filas()[0]).toContain('Destacada en la portada');
    expect(filas()[0]).toContain('En cartelera');
    expect(filas()[1]).toContain('En preventa');
    expect(filas()[1]?.replace(/\s/g, ' ')).toContain('3.500');
  });

  it('una película estrenada sin funciones por delante dice "Sin funciones", no "En cartelera"', async () => {
    await crear();

    expect(filas()[2]).toContain('Sin funciones');
    expect(filas()[2]).not.toContain('En cartelera');
  });

  it('el alta y la edición son enlaces a la página de la película', async () => {
    await crear();
    const enlaces = Array.from(raiz().querySelectorAll<HTMLAnchorElement>('a'));

    expect(
      enlaces.find((a) => a.textContent?.includes('Nueva película'))?.getAttribute('href'),
    ).toBe('/admin/peliculas/nueva');
    expect(enlaces.find((a) => a.textContent?.includes('Editar'))?.getAttribute('href')).toBe(
      '/admin/peliculas/p1',
    );
  });

  it('"Funciones" abre la programación con la película y cuatro semanas desde su estreno', async () => {
    await crear();
    const funciones = Array.from(raiz().querySelectorAll<HTMLAnchorElement>('a')).filter((a) =>
      a.textContent?.includes('Funciones'),
    );

    // En preventa: desde el estreno, que es futuro
    const estreno = EN_PREVENTA.fecha_estreno!;
    const url = new URL(funciones[1].href);
    expect(url.pathname).toBe('/admin/funciones');
    expect(url.searchParams.get('pelicula')).toBe('p2');
    expect(url.searchParams.get('desde')).toBe(estreno);
    expect(url.searchParams.get('hasta')).toBe(sumarDias(estreno, 27));

    // Ya estrenada: desde hoy
    expect(new URL(funciones[0].href).searchParams.get('desde')).toBe(hoyIso());
  });

  it('si no se pueden leer las películas lo dice', async () => {
    await crear(null);

    expect(raiz().textContent).toContain('No pudimos cargar las películas');
  });
});
