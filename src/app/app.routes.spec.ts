import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { Auth } from './core/services/auth';
import { Catalogo } from './core/services/catalogo';
import { Resenas } from './core/services/resenas';
import { NotFound } from './features/not-found/not-found';
import { PeliculaDetalle } from './features/pelicula-detalle/pelicula-detalle';
import { Peliculas } from './features/peliculas/peliculas';

/**
 * Doble de Auth: los guards solo consultan haySesion() y rol(). Los dos últimos
 * miembros son para la pantalla de perfil, que el router llega a instanciar cuando
 * el guard la deja pasar.
 *
 * El catálogo y las reseñas también van con doble: las pantallas del catálogo piden sus
 * datos apenas se crean, y un test de rutas no tiene que salir a la red.
 */
const catalogo = {
  cargarCartelera: vi.fn(async () => []),
  cargarPelicula: vi.fn(async () => null),
  cargarPuntajes: vi.fn(async () => new Map()),
  masVendidas: vi.fn(async () => []),
};

function configurar(haySesion: boolean): void {
  TestBed.configureTestingModule({
    providers: [
      // withComponentInputBinding igual que app.config: sin él, el :id no llega como input()
      provideRouter(routes, withComponentInputBinding()),
      { provide: Catalogo, useValue: catalogo },
      { provide: Resenas, useValue: { deLaPelicula: async () => [] } },
      {
        provide: Auth,
        useValue: {
          haySesion: () => haySesion,
          rol: () => null,
          perfil: () => null,
          cargarDatosSensibles: async () => null,
        },
      },
    ],
  });
}

describe('routes', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('muestra la página 404 de la app para una ruta desconocida', async () => {
    configurar(false);

    const harness = await RouterTestingHarness.create();
    const componente = await harness.navigateByUrl('/esta/ruta/no/existe', NotFound);

    expect(componente).toBeInstanceOf(NotFound);
  });

  // El botón "Ingresar" del header caía en el 404 desde la F1
  it('/ingresar ya no cae en el 404', async () => {
    configurar(false);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ingresar');

    expect(TestBed.inject(Router).url).toBe('/ingresar');
  });

  it('manda a /ingresar a quien abre /perfil sin sesión, recordando el destino', async () => {
    configurar(false);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/perfil');

    expect(TestBed.inject(Router).url).toBe('/ingresar?volverA=%2Fperfil');
  });

  it('deja entrar a /perfil con la sesión abierta', async () => {
    configurar(true);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/perfil');

    expect(TestBed.inject(Router).url).toBe('/perfil');
  });

  it('saca de /registrarme a quien ya tiene sesión', async () => {
    configurar(true);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/registrarme');

    expect(TestBed.inject(Router).url).toBe('/perfil');
  });

  // El catálogo es público: la compra anónima (RF-26) también lo recorre
  describe('el catálogo', () => {
    afterEach(() => vi.clearAllMocks());

    it('/peliculas se abre sin sesión', async () => {
      configurar(false);

      const harness = await RouterTestingHarness.create();
      const componente = await harness.navigateByUrl('/peliculas', Peliculas);

      expect(componente).toBeInstanceOf(Peliculas);
      expect(TestBed.inject(Router).url).toBe('/peliculas');
    });

    it('/peliculas/:id se abre sin sesión y recibe el id como input()', async () => {
      configurar(false);

      const harness = await RouterTestingHarness.create();
      const componente = await harness.navigateByUrl('/peliculas/abc-123', PeliculaDetalle);
      await harness.fixture.whenStable();

      expect(componente).toBeInstanceOf(PeliculaDetalle);
      expect(catalogo.cargarPelicula).toHaveBeenCalledWith('abc-123');
    });

    it('/peliculas/:id también se abre con sesión', async () => {
      configurar(true);

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/peliculas/abc-123', PeliculaDetalle);

      expect(TestBed.inject(Router).url).toBe('/peliculas/abc-123');
    });
  });
});
