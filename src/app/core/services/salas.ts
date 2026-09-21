import { inject, Service } from '@angular/core';
import { mensajeDeError } from '../admin/mensaje-de-error';
import { Butaca, Sala } from '../models/sala';
import { Supabase } from './supabase';

/**
 * Salas y su mapa de butacas (RF-12 a RF-18).
 *
 * La lectura es pública (migración 0019): el comprador anónimo también dibuja el mapa. La
 * escritura no es sobre las tablas, que ningún rol de la API puede tocar, sino por las
 * funciones `crear_sala` y `actualizar_sala`, que verifican en la base que quien llama es
 * administrador. Este servicio no vuelve a chequearlo: el chequeo que vale es el de la base.
 *
 * Las lecturas devuelven null si la base falla, para que la pantalla distinga un error de una
 * lista vacía. Las escrituras devuelven null si salió bien o el mensaje a mostrar, igual que Auth.
 */
@Service()
export class Salas {
  private readonly supabase = inject(Supabase);

  /** Todas las salas por nombre, las dadas de baja incluidas: el administrador las gestiona */
  async cargarSalas(): Promise<Sala[] | null> {
    const { data, error } = await this.supabase.client
      .from('salas')
      .select('id, nombre, activa')
      .order('nombre')
      .overrideTypes<Sala[], { merge: false }>();

    return error ? null : data;
  }

  /**
   * Las 532 butacas de una sala. Entran en una sola respuesta porque PostgREST corta en 1000
   * filas: una sala más grande que eso tendría que paginarse, pero la distribución es fija
   * para todas (RF-12).
   */
  async cargarButacas(salaId: string): Promise<Butaca[] | null> {
    const { data, error } = await this.supabase.client
      .from('butacas')
      .select('id, fila, columna, numero, tipo')
      .eq('sala_id', salaId)
      .overrideTypes<Butaca[], { merge: false }>();

    return error ? null : data;
  }

  /** Da de alta una sala. La base genera su mapa completo, igual que el de las demás */
  async crear(nombre: string): Promise<string | null> {
    const { error } = await this.supabase.client.rpc('crear_sala', { p_nombre: nombre });

    return error ? mensajeDeError(error) : null;
  }

  /** Renombra o activa/desactiva. Una sala con funciones por delante no se puede desactivar */
  async actualizar(id: string, nombre: string, activa: boolean): Promise<string | null> {
    const { error } = await this.supabase.client.rpc('actualizar_sala', {
      p_sala_id: id,
      p_nombre: nombre,
      p_activa: activa,
    });

    return error ? mensajeDeError(error) : null;
  }
}
