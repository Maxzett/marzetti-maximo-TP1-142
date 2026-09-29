import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PeliculasGestionadas } from '../../core/models/gestion';
import { Pelicula } from '../../core/models/pelicula';
import { Gestion } from '../../core/services/gestion';
import { hoyIso, sumarDias } from '../../shared/selector-fecha/fechas';
import { AdminPelicula } from './admin-pelicula';

const ACCION = { id: 'g1', nombre: 'Acción', slug: 'accion' };
const DRAMA = { id: 'g2', nombre: 'Drama', slug: 'drama' };
const POSTER_VIEJO = 'https://x.supabase.co/storage/v1/object/public/posters/viejo.png';
const POSTER_NUEVO = 'https://x.supabase.co/storage/v1/object/public/posters/nuevo.png';

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
  en_cartelera: true,
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
  en_cartelera: false,
};

const DATOS: PeliculasGestionadas = {
  peliculas: [EN_CARTELERA, EN_PREVENTA],
  generos: [ACCION, DRAMA],
};

describe('AdminPelicula', () => {
  let fixture: ComponentFixture<AdminPelicula>;
  let servicio: Record<string, ReturnType<typeof vi.fn>>;
  let navegar: ReturnType<
    typeof vi.fn<(comandos: readonly unknown[], extras?: unknown) => Promise<boolean>>
  >;

  async function estabilizar() {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function crear(
    id: string,
    { resultado = { id: 'p-nueva' } as object, subida = { url: POSTER_NUEVO } as object } = {},
  ) {
    servicio = {
      cargarPeliculas: vi.fn(async () => DATOS),
      guardarPelicula: vi.fn(async () => resultado),
      subirPoster: vi.fn(async () => subida),
      borrarPoster: vi.fn(async () => undefined),
    };

    // jsdom no crea URLs de blob
    URL.createObjectURL = vi.fn(() => 'blob:vista');
    URL.revokeObjectURL = vi.fn();

    await TestBed.configureTestingModule({
      imports: [AdminPelicula],
      providers: [provideRouter([]), { provide: Gestion, useValue: servicio }],
    }).compileComponents();

    navegar = vi.fn(async () => true);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navegar);

    fixture = TestBed.createComponent(AdminPelicula);
    fixture.componentRef.setInput('id', id);
    await estabilizar();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const instancia = () =>
    fixture.componentInstance as unknown as Record<string, WritableSignal<unknown>> & {
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

  it('en /nueva el formulario arranca vacío y dice que es un alta', async () => {
    await crear('nueva');

    expect(raiz().querySelector('h1')?.textContent).toContain('Nueva película');
    expect(instancia()['titulo']()).toBe('');
    expect(instancia()['peliculaId']()).toBeNull();
  });

  it('al editar, carga el formulario con los datos de la película', async () => {
    await crear('p2');

    expect(raiz().querySelector('h1')?.textContent).toContain('Modificar película');
    expect(instancia()['titulo']()).toBe('Cielo de papel');
    expect(instancia()['preventa']()).toBe('3500');
    expect(instancia()['generos']()).toEqual(new Set(['g1']));
  });

  it('un id que no existe no muestra un formulario vacío que crearía otra película', async () => {
    await crear('no-existe');

    expect(raiz().textContent).toContain('No encontramos esa película');
    expect(raiz().querySelector('form')).toBeNull();
  });

  it('la vista previa sigue lo que se escribe', async () => {
    await crear('nueva');
    instancia()['titulo'].set('Faro');
    instancia()['duracion'].set('104');
    instancia()['generos'].set(new Set(['g2']));
    fixture.detectChanges();

    const previa = raiz().querySelector('.previa')?.textContent?.replace(/\s+/g, ' ');
    expect(previa).toContain('Faro');
    expect(previa).toContain('1 h 44 min');
    expect(previa).toContain('Drama');
    expect(previa).toContain('En cartelera mientras tenga funciones');
  });

  it('la vista previa dice cuándo abre la preventa si todavía no abrió', async () => {
    await crear('nueva');
    const estreno = sumarDias(hoyIso(), 20);
    instancia()['estreno'].set(estreno);
    instancia()['preventa'].set('3000');
    fixture.detectChanges();

    const estado = raiz().querySelector('.previa__estado')?.textContent;
    expect(estado).toContain('Próximamente');
    expect(estado).toContain('la preventa');
  });

  it('valida antes de ir a la red: preventa sin estreno y sin géneros', async () => {
    await crear('nueva');
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

  it('un alta guardada pasa a ser una edición y ofrece programar sus funciones', async () => {
    await crear('nueva');
    const estreno = sumarDias(hoyIso(), 10);
    instancia()['titulo'].set('Nueva');
    instancia()['duracion'].set('100');
    instancia()['edad'].set('18');
    instancia()['estreno'].set(estreno);
    instancia()['generos'].set(new Set(['g1', 'g2']));

    await instancia().guardar();
    await estabilizar();

    expect(servicio['guardarPelicula']).toHaveBeenCalledWith(
      expect.objectContaining({
        id: null,
        titulo: 'Nueva',
        duracion_minutos: 100,
        restriccion_edad: 18,
        fecha_estreno: estreno,
        precio_preventa: null,
        generos: ['g1', 'g2'],
      }),
    );
    expect(servicio['subirPoster']).not.toHaveBeenCalled();
    // La URL pasa de /nueva a /:id, sin dejar /nueva en el historial
    expect(navegar).toHaveBeenCalledWith(['/admin/peliculas', 'p-nueva'], { replaceUrl: true });
    expect(instancia()['peliculaId']()).toBe('p-nueva');
    expect(raiz().textContent).toContain('Guardamos Nueva.');

    const programar = Array.from(raiz().querySelectorAll<HTMLAnchorElement>('a')).find((a) =>
      a.textContent?.includes('Programar funciones'),
    );
    const url = new URL(programar!.href);
    expect(url.pathname).toBe('/admin/funciones');
    expect(url.searchParams.get('pelicula')).toBe('p-nueva');
    expect(url.searchParams.get('desde')).toBe(estreno);
    expect(url.searchParams.get('hasta')).toBe(sumarDias(estreno, 27));
  });

  it('cuando la ruta pasa al id recién creado no vuelve a cargar ni pierde el aviso', async () => {
    await crear('nueva');
    instancia()['titulo'].set('Nueva');
    instancia()['duracion'].set('100');
    instancia()['generos'].set(new Set(['g1']));
    await instancia().guardar();

    fixture.componentRef.setInput('id', 'p-nueva');
    await estabilizar();

    expect(servicio['cargarPeliculas']).toHaveBeenCalledOnce();
    expect(raiz().textContent).toContain('Guardamos Nueva.');
  });

  it('una edición no cambia la URL', async () => {
    await crear('p1');

    await instancia().guardar();

    expect(servicio['guardarPelicula']).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    expect(navegar).not.toHaveBeenCalled();
  });

  it('sube el póster nuevo al guardar y borra el reemplazado', async () => {
    await crear('p1', { resultado: { id: 'p1' } });
    elegir(new File(['x'], 'p.png', { type: 'image/png' }));

    await instancia().guardar();

    expect(servicio['subirPoster']).toHaveBeenCalledOnce();
    expect(servicio['guardarPelicula']).toHaveBeenCalledWith(
      expect.objectContaining({ poster_url: POSTER_NUEVO }),
    );
    expect(servicio['borrarPoster']).toHaveBeenCalledWith(POSTER_VIEJO);
  });

  it('si la base rechaza la película, borra el póster recién subido y muestra el motivo', async () => {
    await crear('p1', {
      resultado: {
        error: 'La película tiene funciones programadas: no se puede cambiar la duración',
      },
    });
    elegir(new File(['x'], 'p.png', { type: 'image/png' }));

    await instancia().guardar();

    expect(servicio['borrarPoster']).toHaveBeenCalledWith(POSTER_NUEVO);
    expect(servicio['borrarPoster']).not.toHaveBeenCalledWith(POSTER_VIEJO);
    expect(instancia()['error']()).toContain('funciones programadas');
    expect(instancia()['guardada']()).toBe('');
  });

  it('si el póster no se puede subir no guarda la película', async () => {
    await crear('p1', { subida: { error: 'El póster puede pesar hasta 2 MB.' } });
    elegir(new File(['x'], 'p.png', { type: 'image/png' }));

    await instancia().guardar();

    expect(servicio['guardarPelicula']).not.toHaveBeenCalled();
    expect(instancia()['error']()).toContain('2 MB');
  });

  it('quitar el póster guarda sin imagen y borra el anterior', async () => {
    await crear('p1', { resultado: { id: 'p1' } });
    instancia().quitarPoster();

    await instancia().guardar();

    expect(servicio['guardarPelicula']).toHaveBeenCalledWith(
      expect.objectContaining({ poster_url: null }),
    );
    expect(servicio['borrarPoster']).toHaveBeenCalledWith(POSTER_VIEJO);
  });

  it('guardar dos veces seguidas no borra el póster que se acaba de subir', async () => {
    await crear('p1', { resultado: { id: 'p1' } });
    elegir(new File(['x'], 'p.png', { type: 'image/png' }));
    await instancia().guardar();
    servicio['borrarPoster'].mockClear();

    await instancia().guardar();

    expect(servicio['borrarPoster']).not.toHaveBeenCalled();
    expect(servicio['guardarPelicula']).toHaveBeenLastCalledWith(
      expect.objectContaining({ poster_url: POSTER_NUEVO }),
    );
  });
});
