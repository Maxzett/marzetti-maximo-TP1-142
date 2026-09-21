import { Genero, Pelicula } from '../models/pelicula';
import { enCartelera, filtrarPeliculas, normalizar } from './filtrar';

const ACCION: Genero = { id: 'g1', nombre: 'Acción', slug: 'accion' };
const COMEDIA: Genero = { id: 'g2', nombre: 'Comedia', slug: 'comedia' };
const TERROR: Genero = { id: 'g3', nombre: 'Terror', slug: 'terror' };

function pelicula(titulo: string, generos: Genero[], extra: Partial<Pelicula> = {}): Pelicula {
  return {
    id: titulo,
    titulo,
    sinopsis: '',
    poster_url: null,
    duracion_minutos: 100,
    restriccion_edad: 0,
    fecha_estreno: null,
    destacada: false,
    precio_preventa: null,
    generos,
    ...extra,
  };
}

const CATALOGO = [
  pelicula('Mar de cenizas', [ACCION]),
  pelicula('Tres pasos atrás', [COMEDIA]),
  pelicula('Fuego cruzado', [ACCION, COMEDIA]),
  pelicula('El faro de los que no vuelven', [TERROR]),
  pelicula('Órbita', [ACCION, TERROR]),
];

const titulos = (lista: Pelicula[]) => lista.map((p) => p.titulo);

describe('normalizar', () => {
  it('pasa a minúsculas y saca las tildes', () => {
    expect(normalizar('ACCIÓN')).toBe('accion');
    expect(normalizar('Órbita')).toBe('orbita');
  });

  it('saca los espacios de los extremos pero conserva los del medio', () => {
    expect(normalizar('  mar de cenizas ')).toBe('mar de cenizas');
  });

  it('trata la ñ como una n: buscar "ano" también encuentra "año"', () => {
    // NFD separa la ñ en n + tilde y la regex se lleva la tilde. Es el costo de que
    // "accion" encuentre "Acción" sin una extensión de base; para un buscador de títulos
    // es preferible encontrar de más que pedirle al usuario que escriba con teclado español.
    expect(normalizar('Año')).toBe('ano');
  });
});

describe('filtrarPeliculas', () => {
  it('sin texto ni géneros devuelve todo el catálogo', () => {
    expect(filtrarPeliculas(CATALOGO, '', [])).toHaveLength(5);
  });

  it('busca por el título ignorando mayúsculas y tildes', () => {
    expect(titulos(filtrarPeliculas(CATALOGO, 'ORBITA', []))).toEqual(['Órbita']);
    expect(titulos(filtrarPeliculas(CATALOGO, 'órbita', []))).toEqual(['Órbita']);
  });

  it('encuentra una parte del título, no solo el principio', () => {
    expect(titulos(filtrarPeliculas(CATALOGO, 'pasos', []))).toEqual(['Tres pasos atrás']);
  });

  it('no busca en los géneros: RF-05 es sobre el nombre', () => {
    // "terror" es un género, y ninguna película lo tiene en el título
    expect(filtrarPeliculas(CATALOGO, 'terror', [])).toEqual([]);
  });

  it('con un género devuelve las que lo tienen', () => {
    expect(titulos(filtrarPeliculas(CATALOGO, '', ['terror']))).toEqual([
      'El faro de los que no vuelven',
      'Órbita',
    ]);
  });

  // La decisión de diseño: AND. Con OR, "accion" + "comedia" devolvería cuatro películas
  it('con varios géneros exige TODOS, no alguno', () => {
    expect(titulos(filtrarPeliculas(CATALOGO, '', ['accion', 'comedia']))).toEqual([
      'Fuego cruzado',
    ]);
  });

  it('combina el texto con los géneros', () => {
    expect(titulos(filtrarPeliculas(CATALOGO, 'or', ['accion']))).toEqual(['Órbita']);
    // Coincide el texto pero no el género
    expect(filtrarPeliculas(CATALOGO, 'faro', ['accion'])).toEqual([]);
  });

  it('un género que ninguna película tiene no devuelve nada', () => {
    expect(filtrarPeliculas(CATALOGO, '', ['documental'])).toEqual([]);
  });

  it('no modifica la lista de entrada', () => {
    const copia = [...CATALOGO];
    filtrarPeliculas(CATALOGO, 'mar', ['accion']);
    expect(CATALOGO).toEqual(copia);
  });
});

describe('enCartelera', () => {
  const HOY = '2026-09-21';

  it('sin fecha de estreno está en cartelera', () => {
    expect(enCartelera({ fecha_estreno: null }, HOY)).toBe(true);
  });

  it('con estreno pasado está en cartelera', () => {
    expect(enCartelera({ fecha_estreno: '2026-08-01' }, HOY)).toBe(true);
  });

  it('el mismo día del estreno ya está en cartelera', () => {
    expect(enCartelera({ fecha_estreno: HOY }, HOY)).toBe(true);
  });

  it('con estreno futuro no está: es de Próximamente', () => {
    expect(enCartelera({ fecha_estreno: '2026-09-22' }, HOY)).toBe(false);
  });
});
