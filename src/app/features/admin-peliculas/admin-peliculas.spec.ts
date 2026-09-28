import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PeliculasGestionadas } from '../../core/models/gestion';
import { Pelicula } from '../../core/models/pelicula';
import { Gestion } from '../../core/services/gestion';
import { hoyIso, sumarDias } from '../../shared/selector-fecha/fechas';
import { AdminPeliculas } from './admin-peliculas';

const ACCION = { id: 'g1', nombre: 'Acción', slug: 'accion' };
const DRAMA = { id: 'g2', nombre: 'Drama', slug: 'drama' };
const POSTER_VIEJO = 'https://x.supabase.co/storage/v1/object/public/posters/viejo.png';

const EN_CARTELERA: Pelicula = {
  id: 'p1',
  titulo: 'Mar de cenizas',
  sinopsis: 'Una piloto.',
  poster_url: POSTER_VIEJO,
  duracion_minutos: 131,
  restriccion_edad: 13,
  fecha_estreno: null,
  destacada: true,
  precio_preventa: null,
  generos: [ACCION],
};

const EN_PREVENTA: Pelicula = {
  ...EN_CARTELERA,
  id: 'p2',
  titulo: 'Cielo de papel',
  poster_url: null,
  destacada: false,
  fecha_estreno: sumarDias(hoyIso(), 3),
  precio_preventa: 3500,
};

const DATOS: PeliculasGestionadas = {
  peliculas: [EN_CARTELERA, EN_PREVENTA],
  generos: [ACCION, DRAMA],
};

describe('AdminPeliculas', () => {
  let fixture: ComponentFixture<AdminPeliculas>;
  let servicio: Record<string, ReturnType<typeof vi.fn>>;

  async function estabilizar() {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function crear({
    error = null as string | null,
    subida = { url: 'https://x.supabase.co/storage/v1/object/public/posters/nuevo.png' } as object,
  } = {}) {
    servicio = {
      cargarPeliculas: vi.fn(async () => DATOS),
      guardarPelicula: vi.fn(async () => error),
      subirPoster: vi.fn(async () => subida),
      borrarPoster: vi.fn(async () => undefined),
    };

    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    // jsdom no crea URLs de blob
    URL.createObjectURL = vi.fn(() => 'blob:vista');
    URL.revokeObjectURL = vi.fn();

    await TestBed.configureTestingModule({
      imports: [AdminPeliculas],
      providers: [{ provide: Gestion, useValue: servicio }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPeliculas);
    await estabilizar();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const instancia = () =>
    fixture.componentInstance as unknown as Record<string, WritableSignal<unknown>> & {
      abrir(p: Pelicula | null): void;
      guardar(): Promise<void>;
      elegirArchivo(evento: Event): void;
      quitarPoster(): void;
    };

  /** Simula elegir un archivo en el <input type="file"> */
  const elegir = (archivo: File) =>
    instancia().elegirArchivo({ target: { files: [archivo] } } as unknown as Event);

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('lista las películas con su estado escrito', async () => {
    await crear();
    const filas = Array.from(raiz().querySelectorAll('tbody tr')).map((f) =>
      f.textContent?.replace(/\s+/g, ' '),
    );

    expect(filas[0]).toContain('Mar de cenizas');
    expect(filas[0]).toContain('Destacada en la portada');
    expect(filas[0]).toContain('En cartelera');
    expect(filas[1]).toContain('En preventa');
    expect(filas[1]?.replace(/\s/g, ' ')).toContain('3.500');
  });

  it('al editar, carga el formulario con los datos de la película', async () => {
    await crear();
    instancia().abrir(EN_PREVENTA);

    expect(instancia()['titulo']()).toBe('Cielo de papel');
    expect(instancia()['preventa']()).toBe('3500');
    expect(instancia()['generos']()).toEqual(new Set(['g1']));
  });

  it('valida antes de ir a la red: preventa sin estreno y sin géneros', async () => {
    await crear();
    instancia().abrir(null);
    instancia()['titulo'].set('Nueva');
    instancia()['duracion'].set('100');
    instancia()['preventa'].set('3000');
    instancia()['generos'].set(new Set(['g1']));

    await instancia().guardar();
    expect(instancia()['error']()).toContain('fecha de estreno');

    instancia()['preventa'].set('');
    instancia()['generos'].set(new Set());
    await instancia().guardar();
    expect(instancia()['error']()).toContain('al menos un género');
    expect(servicio['guardarPelicula']).not.toHaveBeenCalled();
  });

  it('guarda un alta con los géneros elegidos y sin preventa si el campo está vacío', async () => {
    await crear();
    instancia().abrir(null);
    instancia()['titulo'].set('Nueva');
    instancia()['duracion'].set('100');
    instancia()['edad'].set('18');
    instancia()['generos'].set(new Set(['g1', 'g2']));

    await instancia().guardar();

    expect(servicio['guardarPelicula']).toHaveBeenCalledWith(
      expect.objectContaining({
        id: null,
        titulo: 'Nueva',
        duracion_minutos: 100,
        restriccion_edad: 18,
        fecha_estreno: null,
        precio_preventa: null,
        generos: ['g1', 'g2'],
      }),
    );
    expect(servicio['subirPoster']).not.toHaveBeenCalled();
    expect(instancia()['abierto']()).toBe(false);
  });

  it('sube el póster nuevo al guardar y borra el reemplazado', async () => {
    await crear();
    instancia().abrir(EN_CARTELERA);
    elegir(new File(['x'], 'p.png', { type: 'image/png' }));

    await instancia().guardar();

    expect(servicio['subirPoster']).toHaveBeenCalledOnce();
    expect(servicio['guardarPelicula']).toHaveBeenCalledWith(
      expect.objectContaining({
        poster_url: 'https://x.supabase.co/storage/v1/object/public/posters/nuevo.png',
      }),
    );
    expect(servicio['borrarPoster']).toHaveBeenCalledWith(POSTER_VIEJO);
  });

  it('si la base rechaza la película, borra el póster recién subido y muestra el motivo', async () => {
    await crear({
      error: 'La película tiene funciones programadas: no se puede cambiar la duración',
    });
    instancia().abrir(EN_CARTELERA);
    elegir(new File(['x'], 'p.png', { type: 'image/png' }));

    await instancia().guardar();

    expect(servicio['borrarPoster']).toHaveBeenCalledWith(
      'https://x.supabase.co/storage/v1/object/public/posters/nuevo.png',
    );
    expect(servicio['borrarPoster']).not.toHaveBeenCalledWith(POSTER_VIEJO);
    expect(instancia()['error']()).toContain('funciones programadas');
    expect(instancia()['abierto']()).toBe(true);
  });

  it('si el póster no se puede subir no guarda la película', async () => {
    await crear({ subida: { error: 'El póster puede pesar hasta 2 MB.' } });
    instancia().abrir(EN_CARTELERA);
    elegir(new File(['x'], 'p.png', { type: 'image/png' }));

    await instancia().guardar();

    expect(servicio['guardarPelicula']).not.toHaveBeenCalled();
    expect(instancia()['error']()).toContain('2 MB');
  });

  it('quitar el póster guarda sin imagen y borra el anterior', async () => {
    await crear();
    instancia().abrir(EN_CARTELERA);
    instancia().quitarPoster();

    await instancia().guardar();

    expect(servicio['guardarPelicula']).toHaveBeenCalledWith(
      expect.objectContaining({ poster_url: null }),
    );
    expect(servicio['borrarPoster']).toHaveBeenCalledWith(POSTER_VIEJO);
  });
});
