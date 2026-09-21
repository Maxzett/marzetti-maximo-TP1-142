import { inject, Service } from '@angular/core';
import { hoyIso } from '../../shared/selector-fecha/fechas';
import { enCartelera } from '../catalogo/filtrar';
import { Genero, Pelicula, Puntaje, VentaPelicula } from '../models/pelicula';
import { Supabase } from './supabase';

/**
 * Las columnas de `peliculas` más los géneros, que viven en otra tabla. `generos(...)`
 * anidado dentro de `peliculas_generos(...)` es un JOIN de PostgREST: una sola consulta
 * trae la película y sus géneros, en vez de una consulta por película.
 */
const COLUMNAS =
  'id, titulo, sinopsis, poster_url, duracion_minutos, restriccion_edad, fecha_estreno, destacada, precio_preventa, peliculas_generos(generos(id, nombre, slug))';

/** Cómo llega la fila: los géneros pasan por la tabla puente */
type FilaPelicula = Omit<Pelicula, 'generos'> & {
  peliculas_generos: { generos: Genero | null }[];
};

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saca la tabla puente del medio: para la interfaz una película tiene una lista de géneros */
function aPelicula(fila: FilaPelicula): Pelicula {
  const { peliculas_generos: vinculos, ...resto } = fila;
  const generos = vinculos
    .flatMap((vinculo) => (vinculo.generos ? [vinculo.generos] : []))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return { ...resto, generos };
}

/**
 * Lectura del catálogo público (RF-01 a RF-08, RF-11).
 *
 * Todo lo que acá se lee lo permite la política de solo lectura de la migración 0017, para
 * `anon` y `authenticated`: se puede ver la cartelera sin cuenta. Las lecturas devuelven
 * null (o vacío, según el caso) si la base no responde, en vez de lanzar: la pantalla
 * decide qué mostrar, y un catálogo caído no tiene por qué ser una excepción sin atrapar.
 */
@Service()
export class Catalogo {
  private readonly supabase = inject(Supabase);

  /**
   * Todas las películas por título, las de estreno futuro incluidas. Es lo que necesita quien
   * programa funciones: se puede armar la cartelera de una película antes de que se estrene
   * (la preventa arranca 7 días antes, RF-49). Null si la consulta falló.
   */
  async cargarTodas(): Promise<Pelicula[] | null> {
    const { data, error } = await this.supabase.client
      .from('peliculas')
      .select(COLUMNAS)
      .order('titulo')
      .overrideTypes<FilaPelicula[], { merge: false }>();

    return error ? null : data.map(aPelicula);
  }

  /**
   * Las películas en cartelera, por título. Null si la consulta falló, para que la pantalla
   * distinga un error de una cartelera vacía. El filtro de estreno se hace acá y no en la
   * consulta para que la regla viva en un solo lugar (enCartelera).
   */
  async cargarCartelera(): Promise<Pelicula[] | null> {
    const todas = await this.cargarTodas();

    if (todas === null) {
      return null;
    }

    const hoy = hoyIso();
    return todas.filter((pelicula) => enCartelera(pelicula, hoy));
  }

  /**
   * Una película por id, o null si no existe o no se pudo leer. No filtra por cartelera: la
   * ficha de una película con estreno futuro es lo que van a abrir Próximamente y la preventa.
   */
  async cargarPelicula(id: string): Promise<Pelicula | null> {
    // Un id que no es uuid haría que Postgres falle con 22P02 (sintaxis inválida). Es la
    // misma "no encontrada", y así no se va a la red por una URL escrita a mano.
    if (!ES_UUID.test(id)) {
      return null;
    }

    const { data, error } = await this.supabase.client
      .from('peliculas')
      .select(COLUMNAS)
      .eq('id', id)
      .maybeSingle<FilaPelicula>();

    return error || !data ? null : aPelicula(data);
  }

  /**
   * Promedio y cantidad de reseñas por película (RF-11), indexados por id de película.
   * Las películas sin reseñas no tienen entrada: quien lo use trata la ausencia como
   * "sin puntuar". Ante un error devuelve un mapa vacío, que es lo mismo que decir eso.
   */
  async cargarPuntajes(): Promise<Map<string, Puntaje>> {
    // rpc() no recibe overrideTypes: sin tipos de base generados, el cliente lo trata como una
    // fila única. El resultado se tipa con un cast, que es lo que declara la función SQL.
    const { data, error } = await this.supabase.client.rpc('puntajes_peliculas');

    if (error) {
      return new Map();
    }

    const puntajes = data as Puntaje[];
    return new Map(puntajes.map((puntaje) => [puntaje.pelicula_id, puntaje]));
  }

  /**
   * El top de la portada (RF-04). La ordena la base, que es la única que puede contar las
   * compras: ningún rol de la API puede leer `ordenes`. Trae siempre `limite` filas
   * mientras haya películas en cartelera, aunque todavía no haya ventas.
   */
  async masVendidas(limite = 3): Promise<VentaPelicula[]> {
    const { data, error } = await this.supabase.client.rpc('peliculas_mas_vendidas', {
      p_limite: limite,
    });

    return error ? [] : (data as VentaPelicula[]);
  }
}
