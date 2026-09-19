import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { Auth } from './core/services/auth';
import { NotFound } from './features/not-found/not-found';

/**
 * Doble de Auth: los guards solo consultan haySesion() y rol(). Los dos últimos
 * miembros son para la pantalla de perfil, que el router llega a instanciar cuando
 * el guard la deja pasar.
 */
function configurar(haySesion: boolean): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
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
});
