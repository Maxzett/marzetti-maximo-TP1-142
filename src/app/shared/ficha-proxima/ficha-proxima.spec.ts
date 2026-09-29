import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Pelicula } from '../../core/models/pelicula';
import { FichaProxima } from './ficha-proxima';

const HOY = '2026-09-28';

const PELICULA: Pelicula = {
  id: 'p1',
  titulo: 'Cielo de papel',
  sinopsis: '',
  poster_url: null,
  duracion_minutos: 94,
  restriccion_edad: 0,
  fecha_estreno: '2026-10-15',
  destacada: false,
  precio_preventa: null,
  en_cartelera: false,
  generos: [],
};

async function montar(pelicula: Pelicula) {
  await TestBed.configureTestingModule({
    imports: [FichaProxima],
    providers: [provideRouter([])],
  }).compileComponents();

  const fixture = TestBed.createComponent(FichaProxima);
  fixture.componentRef.setInput('pelicula', pelicula);
  fixture.componentRef.setInput('hoy', HOY);
  await fixture.whenStable();
  const texto = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
  return { fixture, texto };
}

describe('FichaProxima', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('dice el estreno con palabras y enlaza a la ficha', async () => {
    const { fixture, texto } = await montar(PELICULA);

    expect(texto()).toContain('jueves 15 de octubre');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/peliculas/p1');
  });

  it('sin preventa, se vende desde el estreno', async () => {
    const { texto } = await montar(PELICULA);

    expect(texto()).toContain('A la venta desde el estreno');
  });

  it('con preventa que todavía no abrió, dice desde cuándo y a qué precio', async () => {
    const { texto } = await montar({ ...PELICULA, precio_preventa: 3500 });

    expect(texto()).toContain('Preventa desde el jueves 8 de octubre');
    expect(texto()).toContain('3.500');
  });

  it('en preventa lo dice con texto y con la bombilla encendida', async () => {
    const { fixture, texto } = await montar({
      ...PELICULA,
      fecha_estreno: '2026-10-01',
      precio_preventa: 3500,
    });

    expect(texto()).toContain('En preventa');
    expect(fixture.nativeElement.querySelector('.venta--abierta')).not.toBeNull();
  });
});
