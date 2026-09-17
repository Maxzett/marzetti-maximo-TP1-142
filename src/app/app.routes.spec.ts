import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { NotFound } from './features/not-found/not-found';

describe('routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('muestra la página 404 de la app para una ruta desconocida', async () => {
    const harness = await RouterTestingHarness.create();
    const componente = await harness.navigateByUrl('/esta/ruta/no/existe', NotFound);
    expect(componente).toBeInstanceOf(NotFound);
  });
});
