import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { RolUsuario } from './core/models/perfil';
import { Auth } from './core/services/auth';
import { Catalogo } from './core/services/catalogo';
import { Funciones } from './core/services/funciones';
import { Gestion } from './core/services/gestion';
import { Reportes } from './core/services/reportes';
import { Resenas } from './core/services/resenas';
import { Salas } from './core/services/salas';
import { Home } from './features/home/home';
import { NotFound } from './features/not-found/not-found';
import { PeliculaDetalle } from './features/pelicula-detalle/pelicula-detalle';

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
  cargarTodas: vi.fn(async () => []),
  cargarProximas: vi.fn(async () => []),
  cargarPelicula: vi.fn(async () => null),
  cargarPuntajes: vi.fn(async () => new Map()),
  masVendidas: vi.fn(async () => []),
};

function configurar(haySesion: boolean, rol: RolUsuario | null = null): void {
  TestBed.configureTestingModule({
    providers: [
      // withComponentInputBinding igual que app.config: sin él, el :id no llega como input()
      provideRouter(routes, withComponentInputBinding()),
      { provide: Catalogo, useValue: catalogo },
      { provide: Resenas, useValue: { deLaPelicula: async () => [] } },
      // El panel de administración pide sus datos al crearse: el test de rutas no sale a la red
      {
        provide: Funciones,
        useValue: {
          cargarProgramacion: vi.fn(async () => []),
          cargarDeHoy: vi.fn(async () => []),
        },
      },
      {
        provide: Reportes,
        useValue: {
          facturacion: vi.fn(async () => []),
          productosMasVendidos: vi.fn(async () => []),
          peliculasMasVistas: vi.fn(async () => []),
          actividad: vi.fn(async () => ({ registros: [], total: 0 })),
        },
      },
      {
        provide: Gestion,
        useValue: {
          cargarCandy: vi.fn(async () => null),
          cargarPromociones: vi.fn(async () => null),
        },
      },
      {
        provide: Salas,
        useValue: { cargarSalas: vi.fn(async () => []), cargarButacas: vi.fn(async () => []) },
      },
      {
        provide: Auth,
        useValue: {
          haySesion: () => haySesion,
          rol: () => rol,
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

    // El buscador pasó a la portada en la revisión R1: un enlace viejo con filtros sigue andando
    it('/peliculas redirige a la portada y conserva los filtros', async () => {
      configurar(false);

      const harness = await RouterTestingHarness.create();
      const componente = await harness.navigateByUrl('/peliculas?q=mar&genero=accion', Home);

      expect(componente).toBeInstanceOf(Home);
      expect(TestBed.inject(Router).url).toBe('/?q=mar&genero=accion');
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
  // El guard es una ayuda de interfaz (RNF-09): lo que impide tocar los datos son las
  // funciones de la base. Acá se prueba la ayuda, que es lo que ve quien navega.
  describe('el panel de administración', () => {
    afterEach(() => vi.clearAllMocks());

    it('manda a /ingresar a quien abre /admin sin sesión', async () => {
      configurar(false);

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/admin');

      expect(TestBed.inject(Router).url).toBe('/ingresar');
    });

    // Volver a entrar no le va a dar un rol que no tiene: va a la portada, no a /ingresar
    it('manda a la portada a un cliente con sesión', async () => {
      configurar(true, 'cliente');

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/admin/funciones');

      expect(TestBed.inject(Router).url).toBe('/');
    });

    it('tampoco deja pasar a un empleado: el panel es del administrador', async () => {
      configurar(true, 'empleado');

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/admin/salas');

      expect(TestBed.inject(Router).url).toBe('/');
    });

    it('/admin lleva a los reportes: es lo primero que se mira al entrar', async () => {
      configurar(true, 'admin');

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/admin');

      expect(TestBed.inject(Router).url).toBe('/admin/reportes');
    });

    it('reportes, candy, promociones y actividad cargan sus pantallas', async () => {
      configurar(true, 'admin');
      const harness = await RouterTestingHarness.create();

      for (const [ruta, selector] of [
        ['reportes', 'app-admin-reportes'],
        ['candy', 'app-admin-candy'],
        ['promociones', 'app-admin-promociones'],
        ['actividad', 'app-admin-actividad'],
      ]) {
        await harness.navigateByUrl(`/admin/${ruta}`);
        await harness.fixture.whenStable();
        expect(harness.fixture.nativeElement.querySelector(selector)).not.toBeNull();
      }
    });

    it('/admin/funciones y /admin/salas cargan sus pantallas', async () => {
      configurar(true, 'admin');

      // El componente enrutado es el marco (Admin); las pantallas van adentro, en su outlet
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/admin/funciones');
      await harness.fixture.whenStable();
      expect(harness.fixture.nativeElement.querySelector('app-admin-funciones')).not.toBeNull();

      await harness.navigateByUrl('/admin/salas');
      await harness.fixture.whenStable();
      expect(harness.fixture.nativeElement.querySelector('app-admin-salas')).not.toBeNull();
    });
  });
});
