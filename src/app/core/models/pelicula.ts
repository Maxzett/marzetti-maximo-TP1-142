/**
 * Modelos del catálogo y las reseñas (RF-01 a RF-11).
 *
 * Igual que en perfil.ts, los campos van en snake_case porque son los nombres de las
 * columnas de Postgres: supabase-js devuelve la fila tal cual y renombrarlas obligaría a
 * mapear en cada consulta a cambio de nada.
 */

/** RF-03. Es el número que compara RN-04 contra la edad del comprador, no una etiqueta */
export type RestriccionEdad = 0 | 13 | 18;

export interface Genero {
  id: string;
  nombre: string;
  /** Lo que viaja en la URL del filtro (RF-06): estable aunque se corrija el nombre */
  slug: string;
}

/** Fila de `peliculas` con sus géneros ya resueltos (RF-02) */
export interface Pelicula {
  id: string;
  titulo: string;
  sinopsis: string;
  /** Nulo mientras no haya imagen cargada: el póster lo dibuja la aplicación */
  poster_url: string | null;
  duracion_minutos: number;
  restriccion_edad: RestriccionEdad;
  /** 'AAAA-MM-DD'. Nulo significa que ya está en cartelera sin fecha de lanzamiento */
  fecha_estreno: string | null;
  /** RF-07: el administrador decide qué aparece en la portada */
  destacada: boolean;
  precio_preventa: number | null;
  generos: Genero[];
}

/** Promedio y cantidad de reseñas de una película (RF-11). Sin reseñas no hay fila. */
export interface Puntaje {
  pelicula_id: string;
  promedio: number;
  cantidad: number;
}

/** Una fila del top de ventas (RF-04) */
export interface VentaPelicula {
  pelicula_id: string;
  /** Es 0 mientras no haya compras: la interfaz no lo muestra en ese caso */
  entradas: number;
}

/**
 * Reseña tal como la devuelve resenas_de_pelicula(). No trae el id del perfil ni el
 * apellido entero: la base solo entrega lo que se muestra.
 */
export interface Resena {
  id: string;
  estrellas: number;
  comentario: string;
  creado_at: string;
  /** "Ana G.": nombre e inicial del apellido */
  autor: string;
  /** Es la del que consulta: la pantalla la deja editar y borrar */
  es_propia: boolean;
}

/** Lo que el usuario completa al opinar (RF-09) */
export interface DatosResena {
  estrellas: number;
  comentario: string;
}

/** Largo máximo del comentario: el mismo CHECK que tiene la columna en la base */
export const LARGO_MAXIMO_COMENTARIO = 500;
