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

  it('muestra el título, la duración y los géneros', async () => {
    await crear();
    const texto = raiz().textContent ?? '';

    expect(texto).toContain('Mar de cenizas');
    expect(texto).toContain('131 min');
    expect(texto).toContain('Acción');
    expect(texto).toContain('Ciencia ficción');
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

  describe('restricción de edad', () => {
    it('escribe la edad y la dice completa para el lector de pantalla', async () => {
      await crear();

      expect(raiz().querySelector('.edad')?.textContent).toContain('+13');
      expect(raiz().querySelector('.edad .solo-lectores')?.textContent).toBe('Mayores de 13 años');
    });

    it('sin restricción dice ATP', async () => {
      await crear({}, { ...PELICULA, restriccion_edad: 0 });

      expect(raiz().querySelector('.edad')?.textContent).toContain('ATP');
      expect(raiz().querySelector('.edad--mayores')).toBeNull();
    });

    it('+18 lleva la variante roja, además del texto', async () => {
      await crear({}, { ...PELICULA, restriccion_edad: 18 });

      expect(raiz().querySelector('.edad--mayores')?.textContent).toContain('+18');
    });
  });

  describe('puntaje', () => {
    it('sin puntaje dice "Sin reseñas"', async () => {
      await crear();

      expect(raiz().textContent).toContain('Sin reseñas');
    });

    it('con puntaje muestra el promedio y la cantidad', async () => {
      const puntaje: Puntaje = { pelicula_id: 'abc-123', promedio: 4.5, cantidad: 8 };
      await crear({ puntaje });

      expect(raiz().textContent).toContain('4,5');
      expect(raiz().textContent).toContain('(8)');
    });
  });

  describe('ranking', () => {
    it('sin puesto no muestra ninguna posición', async () => {
      await crear();

      expect(raiz().querySelector('.puesto')).toBeNull();
    });

    it('con puesto lo muestra y destaca la tarjeta', async () => {
      await crear({ puesto: 2 });

      expect(raiz().querySelector('.puesto')?.textContent).toContain('N.º 2');
      expect(raiz().querySelector('.tarjeta--destacada')).not.toBeNull();
    });

    // El top tiene películas con 0 ventas hasta la F6: no se afirma algo que no pasó
    it('con cero entradas no dice nada de ventas', async () => {
      await crear({ entradas: 0 });

      expect(raiz().querySelector('.ventas')).toBeNull();
    });

    it('con entradas vendidas las muestra, en plural', async () => {
      await crear({ entradas: 12 });

      expect(raiz().querySelector('.ventas')?.textContent).toContain('12 entradas vendidas');
    });

    it('con una sola entrada usa el singular', async () => {
      await crear({ entradas: 1 });

      expect(raiz().querySelector('.ventas')?.textContent).toContain('1 entrada vendida');
    });
  });
});
