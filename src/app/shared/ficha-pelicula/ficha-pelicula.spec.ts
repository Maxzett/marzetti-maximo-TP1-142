import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Pelicula, Puntaje } from '../../core/models/pelicula';
import { FichaPelicula } from './ficha-pelicula';

const PELICULA: Pelicula = {
  id: 'abc-123',
  titulo: 'Mar de cenizas',
  sinopsis: '',
  poster_url: null,
  duracion_minutos: 131,
  restriccion_edad: 13,
  fecha_estreno: null,
  destacada: true,
  precio_preventa: null,
  generos: [
    { id: 'g1', nombre: 'Acción', slug: 'accion' },
    { id: 'g2', nombre: 'Ciencia ficción', slug: 'ciencia-ficcion' },
  ],
};

describe('FichaPelicula', () => {
  let fixture: ComponentFixture<FichaPelicula>;

  async function crear(entradas: Record<string, unknown> = {}, pelicula: Pelicula = PELICULA) {
    await TestBed.configureTestingModule({
      imports: [FichaPelicula],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FichaPelicula);
    fixture.componentRef.setInput('pelicula', pelicula);
    for (const [nombre, valor] of Object.entries(entradas)) {
      fixture.componentRef.setInput(nombre, valor);
    }
    await fixture.whenStable();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;

  afterEach(() => TestBed.resetTestingModule());

  it('muestra el título, los géneros y la duración en horas', async () => {
    await crear();
    const texto = raiz().textContent ?? '';

    expect(texto).toContain('Mar de cenizas');
    expect(raiz().querySelector('.datos')?.textContent).toBe(
      'Acción · Ciencia ficción · 2 h 11 min',
    );
  });

  it('el título es un enlace al detalle de la película', async () => {
    await crear();

    expect(raiz().querySelector('h3 a')?.getAttribute('href')).toBe('/peliculas/abc-123');
  });

  // Un enlace que envolviera todo haría que el lector leyera póster y estrellas como su nombre
  it('hay un solo enlace en toda la ficha', async () => {
    await crear();

    expect(raiz().querySelectorAll('a')).toHaveLength(1);
  });

  it('el póster es decorativo: el título ya está escrito en el enlace', async () => {
    await crear();

    const poster = raiz().querySelector('.tipografico');
    expect(poster?.getAttribute('aria-hidden')).toBe('true');
  });

  it('lleva el sello de su restricción de edad', async () => {
    await crear();

    expect(raiz().querySelector('app-sello-edad .sello--13')).not.toBeNull();
  });

  describe('destacada (RF-07)', () => {
    it('si el administrador la destacó, lo dice con texto', async () => {
      await crear();

      expect(raiz().querySelector('.destacada')?.textContent).toBe('Destacada');
    });

    it('si no, no hay rótulo', async () => {
      await crear({}, { ...PELICULA, destacada: false });

      expect(raiz().querySelector('.destacada')).toBeNull();
    });
  });

  describe('puntaje', () => {
    it('sin puntaje dice "Sin reseñas"', async () => {
      await crear();

      expect(raiz().textContent).toContain('Sin reseñas');
    });

    it('con puntaje muestra el promedio, sin la cantidad', async () => {
      const puntaje: Puntaje = { pelicula_id: 'abc-123', promedio: 4.5, cantidad: 8 };
      await crear({ puntaje });

      expect(raiz().textContent).toContain('4,5');
      expect(raiz().textContent).not.toContain('(8)');
    });
  });

  // El top de ventas vive en el podio de la portada: la ficha no muestra cifras de venta
  it('no dice nada de ventas ni de puestos', async () => {
    await crear();

    expect(raiz().textContent).not.toMatch(/vendid|N.º/);
  });
});
