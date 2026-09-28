import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PeliculaVista } from '../../core/models/pelicula';
import { Cuenta } from '../../core/services/cuenta';
import { MisPeliculas } from './mis-peliculas';

const CALIFICADA: PeliculaVista = {
  pelicula_id: 'p1',
  titulo: 'Mar de cenizas',
  poster_url: null,
  vista_el: '2026-09-25T21:00:00Z',
  estrellas: 4,
};

const SIN_CALIFICAR: PeliculaVista = {
  pelicula_id: 'p2',
  titulo: 'Ecos de medianoche',
  poster_url: null,
  vista_el: '2026-09-20T23:30:00Z',
  estrellas: null,
};

async function montar(vistas: PeliculaVista[] | null) {
  const cuenta = { misPeliculas: vi.fn(async () => vistas) };

  await TestBed.configureTestingModule({
    imports: [MisPeliculas],
    providers: [provideRouter([]), { provide: Cuenta, useValue: cuenta }],
  }).compileComponents();

  const fixture = TestBed.createComponent(MisPeliculas);
  await fixture.whenStable();
  return { raiz: fixture.nativeElement as HTMLElement, cuenta };
}

describe('MisPeliculas', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('muestra póster, título, fecha en hora del cine y la calificación propia', async () => {
    const { raiz } = await montar([CALIFICADA]);
    const tarjeta = raiz.querySelector('.vista') as HTMLElement;

    expect(tarjeta.querySelector('app-poster')).not.toBeNull();
    expect(tarjeta.textContent).toContain('Mar de cenizas');
    // 21:00 UTC son las 18:00 en Buenos Aires
    expect(tarjeta.textContent).toContain('18:00');
    expect(tarjeta.querySelector('app-estrellas')).not.toBeNull();
  });

  it('si no la calificó, invita a hacerlo en la ficha', async () => {
    const { raiz } = await montar([SIN_CALIFICAR]);
    const enlace = raiz.querySelector('.calificar') as HTMLAnchorElement;

    expect(enlace.textContent).toContain('Calificala');
    expect(enlace.getAttribute('href')).toBe('/peliculas/p2#titulo-resenas');
  });

  it('sin películas vistas explica cuándo aparecen', async () => {
    const { raiz } = await montar([]);

    expect(raiz.textContent).toContain('valida tu entrada');
  });

  it('si la base falla, lo dice y deja reintentar', async () => {
    const { raiz } = await montar(null);

    expect(raiz.textContent).toContain('No pudimos cargar');
    expect(raiz.querySelector('button')?.textContent).toContain('Reintentar');
  });
});
