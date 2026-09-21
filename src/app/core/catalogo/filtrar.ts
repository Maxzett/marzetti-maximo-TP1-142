import { Pelicula } from '../models/pelicula';

/**
 * Lógica del catálogo, sin Angular ni Supabase: son funciones puras, así que se prueban
 * con datos armados a mano y no necesitan un navegador ni una base.
 *
 * El buscador filtra en el cliente, sobre el catálogo cargado una sola vez. Con las decenas
 * de películas de un cine es más simple y más rápido que ir a la base en cada tecla, y
 * permite ignorar las tildes ("accion" encuentra "Acción"), cosa que un ILIKE de Postgres
 * no hace sin la extensión unaccent. Si el catálogo creciera a miles de filas, el paso
 * siguiente sería una RPC con unaccent y pg_trgm, y esta función quedaría como contrato.
 */

/**
 * Deja el texto listo para comparar: sin mayúsculas, sin tildes y sin espacios sobrantes.
 * NFD separa cada letra acentuada en letra + marca, y la regex descarta las marcas.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * RF-05 y RF-06, combinados: el texto busca sobre el título y los géneros restringen.
 *
 * Los géneros se combinan con AND: la película tiene que tener TODOS los elegidos. Es lo
 * que justifica RF-02 (varios géneros por película): con OR, elegir "Acción" y "Comedia"
 * ensancharía el resultado, y con AND permite llegar a una comedia de acción.
 */
export function filtrarPeliculas(
  peliculas: readonly Pelicula[],
  texto: string,
  slugs: readonly string[],
): Pelicula[] {
  const buscado = normalizar(texto);

  return peliculas.filter((pelicula) => {
    if (buscado && !normalizar(pelicula.titulo).includes(buscado)) {
      return false;
    }

    return slugs.every((slug) => pelicula.generos.some((genero) => genero.slug === slug));
  });
}

/**
 * Una película está en cartelera si ya se estrenó o no tiene fecha de lanzamiento. Las de
 * fecha futura —incluida la preventa, que arranca siete días antes— son de Próximamente.
 *
 * Las fechas son 'AAAA-MM-DD', así que comparadas como texto ordenan igual que como fechas.
 * La misma regla la aplica peliculas_mas_vendidas() en la base, con la hora de Buenos Aires.
 */
export function enCartelera(pelicula: Pick<Pelicula, 'fecha_estreno'>, hoy: string): boolean {
  return pelicula.fecha_estreno === null || pelicula.fecha_estreno <= hoy;
}
