import { inject, Service } from '@angular/core';
import { DatosResena, LARGO_MAXIMO_COMENTARIO, Resena } from '../models/pelicula';
import { Auth } from './auth';
import { Supabase } from './supabase';

/** Código de Postgres para una violación de unique: ya existe una reseña de esta persona */
const UNIQUE_VIOLADO = '23505';

/**
 * Reseñas de las películas (RF-09, RF-10).
 *
 * La lectura es pública y pasa por una función de la base, no por la tabla: mostrar el autor
 * exige leer `perfiles`, que es privado (migración 0018). La escritura sí es sobre la tabla,
 * y solo se permite la fila propia: eso lo garantiza RLS, no este servicio. Las validaciones
 * de acá son para dar un mensaje claro antes de ir a la red.
 *
 * Igual que Auth, las escrituras devuelven null si salió bien o el mensaje a mostrar.
 */
@Service()
export class Resenas {
  private readonly supabase = inject(Supabase);
  private readonly auth = inject(Auth);

  /** Las reseñas de una película, las más nuevas primero. Null si no se pudieron leer. */
  async deLaPelicula(peliculaId: string): Promise<Resena[] | null> {
    const { data, error } = await this.supabase.client.rpc('resenas_de_pelicula', {
      p_pelicula_id: peliculaId,
    });

    // Sin tipos de base generados, rpc() devuelve data sin tipo: se declara acá lo que
    // devuelve la función SQL (migración 0018).
    return error ? null : (data as Resena[]);
  }

  /**
   * Crea la reseña, o corrige la existente si se pasa su id. No se usa upsert: el
   * `merge-duplicates` de PostgREST necesitaría UPDATE sobre `pelicula_id` y `perfil_id`,
   * y la migración 0018 solo otorga el de `estrellas` y `comentario` a propósito.
   */
  async guardar(
    peliculaId: string,
    datos: DatosResena,
    resenaExistenteId: string | null,
  ): Promise<string | null> {
    const perfilId = this.auth.perfil()?.id;
    if (!perfilId) {
      return 'Iniciá sesión para dejar tu reseña.';
    }

    const comentario = datos.comentario.trim();

    if (!Number.isInteger(datos.estrellas) || datos.estrellas < 1 || datos.estrellas > 5) {
      return 'Elegí de 1 a 5 estrellas.';
    }

    if (comentario.length > LARGO_MAXIMO_COMENTARIO) {
      return `El comentario puede tener hasta ${LARGO_MAXIMO_COMENTARIO} caracteres.`;
    }

    const tabla = this.supabase.client.from('resenas');
    const valores = { estrellas: datos.estrellas, comentario };

    if (resenaExistenteId) {
      // .select() al final devuelve las filas tocadas: con RLS, un UPDATE sobre una fila que
      // no es tuya no falla, simplemente no toca nada, y sin este chequeo pasaría por éxito.
      const { data, error } = await tabla.update(valores).eq('id', resenaExistenteId).select('id');

      if (error) {
        return 'No pudimos guardar tu reseña. Probá de nuevo.';
      }

      return data.length === 0 ? 'No encontramos tu reseña para modificarla.' : null;
    }

    const { error } = await tabla.insert({
      pelicula_id: peliculaId,
      perfil_id: perfilId,
      ...valores,
    });

    if (error) {
      return error.code === UNIQUE_VIOLADO
        ? 'Ya dejaste una reseña para esta película.'
        : 'No pudimos guardar tu reseña. Probá de nuevo.';
    }

    return null;
  }

  async borrar(resenaId: string): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from('resenas')
      .delete()
      .eq('id', resenaId)
      .select('id');

    if (error) {
      return 'No pudimos borrar tu reseña. Probá de nuevo.';
    }

    return data.length === 0 ? 'No encontramos tu reseña para borrarla.' : null;
  }
}
