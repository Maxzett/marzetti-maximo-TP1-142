import { TestBed } from '@angular/core/testing';
import { Catalogo } from './catalogo';
import { Supabase } from './supabase';

const ID_VALIDO = '3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6';

const ACCION = { id: 'g1', nombre: 'Acción', slug: 'accion' };
const COMEDIA = { id: 'g2', nombre: 'Comedia', slug: 'comedia' };

/** Una fila tal como la devuelve PostgREST: los géneros pasan por la tabla puente */
function fila(titulo: string, extra: Record<string, unknown> = {}) {
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
    peliculas_generos: [],
    ...extra,
  };
}

interface Respuestas {
  filas?: unknown;
  rpc?: unknown;
  error?: boolean;
}

/**
 * Doble del cliente de Supabase. Cada método de la cadena devuelve la misma cadena y solo
 * el último (overrideTypes o maybeSingle) resuelve, que es cómo se usa en el servicio.
 */
function crearSupabaseFalso({ filas = [], rpc = [], error = false }: Respuestas = {}) {
  const resultado = (datos: unknown) => async () => ({
    data: error ? null : datos,
    error: error ? { message: 'falló' } : null,
  });

  const consulta = () => {
    const cadena = {
      select: vi.fn(() => cadena),
      order: vi.fn(() => cadena),
      eq: vi.fn(() => cadena),
      overrideTypes: resultado(filas),
      maybeSingle: resultado(filas),
    };
    return cadena;
  };

  return {
    client: {
      from: vi.fn(consulta),
      rpc: vi.fn((_nombre: string, _argumentos?: unknown) => resultado(rpc)()),
    },
  };
}

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Catalogo {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Catalogo);
}

describe('Catalogo', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('cargarCartelera', () => {
    it('saca la tabla puente del medio y deja los géneros en una lista', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          filas: [fila('Fuego cruzado', { peliculas_generos: [{ generos: ACCION }] })],
        }),
      );

      const [pelicula] = (await servicio.cargarCartelera()) ?? [];

      expect(pelicula.generos).toEqual([ACCION]);
      expect(pelicula).not.toHaveProperty('peliculas_generos');
    });

    it('ordena los géneros por nombre, no por como los devolvió la base', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          filas: [
            fila('Fuego cruzado', {
              peliculas_generos: [{ generos: COMEDIA }, { generos: ACCION }],
            }),
          ],
        }),
      );

      const [pelicula] = (await servicio.cargarCartelera()) ?? [];

      expect(pelicula.generos.map((g) => g.nombre)).toEqual(['Acción', 'Comedia']);
    });

    it('descarta un vínculo cuyo género vino nulo, en vez de romperse', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          filas: [fila('X', { peliculas_generos: [{ generos: null }, { generos: ACCION }] })],
        }),
      );

      const [pelicula] = (await servicio.cargarCartelera()) ?? [];

      expect(pelicula.generos).toEqual([ACCION]);
    });

    // Las de estreno futuro son de Próximamente (F10): no van a la cartelera
    it('deja afuera las películas con estreno futuro', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          filas: [
            fila('Ya estrenada', { fecha_estreno: '2000-01-01' }),
            fila('Sin fecha', { fecha_estreno: null }),
            fila('Futura', { fecha_estreno: '2999-01-01' }),
          ],
        }),
      );

      const cartelera = await servicio.cargarCartelera();

      expect(cartelera?.map((p) => p.titulo)).toEqual(['Ya estrenada', 'Sin fecha']);
    });

    it('devuelve null si la base falla, para no confundir un error con una cartelera vacía', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ error: true }));

      expect(await servicio.cargarCartelera()).toBeNull();
    });

    it('una cartelera realmente vacía es una lista vacía, no null', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ filas: [] }));

      expect(await servicio.cargarCartelera()).toEqual([]);
    });
  });

  // A diferencia de la cartelera, quien programa funciones tiene que ver también las que
  // todavía no se estrenaron: la preventa arranca 7 días antes (RF-49)
  describe('cargarTodas', () => {
    it('incluye las películas con estreno futuro', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          filas: [
            fila('Ya estrenada', { fecha_estreno: '2000-01-01' }),
            fila('Futura', { fecha_estreno: '2999-01-01' }),
          ],
        }),
      );

      const todas = await servicio.cargarTodas();

      expect(todas?.map((p) => p.titulo)).toEqual(['Ya estrenada', 'Futura']);
    });

    it('devuelve null si la base falla', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ error: true }));

      expect(await servicio.cargarTodas()).toBeNull();
    });
  });

  describe('cargarPelicula', () => {
    it('devuelve la película con sus géneros', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          filas: fila('Mar de cenizas', { peliculas_generos: [{ generos: ACCION }] }),
        }),
      );

      const pelicula = await servicio.cargarPelicula(ID_VALIDO);

      expect(pelicula?.titulo).toBe('Mar de cenizas');
      expect(pelicula?.generos).toEqual([ACCION]);
    });

    it('un id que no es uuid devuelve null sin ir a la red', async () => {
      const falso = crearSupabaseFalso();
      const servicio = crearServicio(falso);

      expect(await servicio.cargarPelicula('no-soy-un-uuid')).toBeNull();
      expect(falso.client.from).not.toHaveBeenCalled();
    });

    it('devuelve null si la película no existe', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ filas: null }));

      expect(await servicio.cargarPelicula(ID_VALIDO)).toBeNull();
    });

    it('devuelve null si la base falla', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ error: true }));

      expect(await servicio.cargarPelicula(ID_VALIDO)).toBeNull();
    });

    // A diferencia de la cartelera, la ficha sirve también para lo que todavía no se estrenó
    it('no aplica el filtro de cartelera: una película futura se puede abrir', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({ filas: fila('Futura', { fecha_estreno: '2999-01-01' }) }),
      );

      expect((await servicio.cargarPelicula(ID_VALIDO))?.titulo).toBe('Futura');
    });
  });

  describe('cargarPuntajes', () => {
    it('indexa los puntajes por id de película', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          rpc: [
            { pelicula_id: 'a', promedio: 4.5, cantidad: 2 },
            { pelicula_id: 'b', promedio: 3, cantidad: 1 },
          ],
        }),
      );

      const puntajes = await servicio.cargarPuntajes();

      expect(puntajes.get('a')?.promedio).toBe(4.5);
      expect(puntajes.get('b')?.cantidad).toBe(1);
      // Una película sin reseñas no tiene entrada: la pantalla lo lee como "sin puntuar"
      expect(puntajes.get('c')).toBeUndefined();
    });

    it('ante un error devuelve un mapa vacío', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ error: true }));

      expect((await servicio.cargarPuntajes()).size).toBe(0);
    });
  });

  describe('masVendidas', () => {
    it('llama a la función de la base con el límite pedido', async () => {
      const falso = crearSupabaseFalso({ rpc: [{ pelicula_id: 'a', entradas: 12 }] });
      const servicio = crearServicio(falso);

      const top = await servicio.masVendidas(3);

      expect(falso.client.rpc).toHaveBeenCalledWith('peliculas_mas_vendidas', { p_limite: 3 });
      expect(top).toEqual([{ pelicula_id: 'a', entradas: 12 }]);
    });

    it('pide 3 por defecto: es el top de la portada (RF-04)', async () => {
      const falso = crearSupabaseFalso();
      await crearServicio(falso).masVendidas();

      expect(falso.client.rpc).toHaveBeenCalledWith('peliculas_mas_vendidas', { p_limite: 3 });
    });

    it('ante un error devuelve una lista vacía', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ error: true }));

      expect(await servicio.masVendidas()).toEqual([]);
    });
  });
});
