import { inject, Service } from '@angular/core';
import { mensajeDeError } from '../admin/mensaje-de-error';
import { Canje, OrdenPropia, ResultadoDeCancelacion, Saldos } from '../models/orden';
import { Supabase } from './supabase';

/**
 * Lo que la cuenta ve de sí misma (RF-40) y la cancelación con crédito (RF-30, RF-31).
 *
 * Los saldos y el historial salen de funciones de la base, no de leer `ordenes`, que ningún
 * rol de la API puede leer. Los canjes sí se leen de su tabla: la política de la migración 0022
 * deja ver solo las filas propias, así que acá no hay que filtrar por el usuario.
 *
 * Las lecturas devuelven null si la base falla, para que la pantalla no muestre "0 puntos" cuando
 * en realidad no pudo saberlo.
 */
@Service()
export class Cuenta {
  private readonly supabase = inject(Supabase);

  async saldos(): Promise<Saldos | null> {
    const { data, error } = await this.supabase.client.rpc('mis_saldos');

    return error ? null : (data as Saldos);
  }

  /** Las compras pagadas y canceladas, la función más nueva primero */
  async ordenes(): Promise<OrdenPropia[] | null> {
    const { data, error } = await this.supabase.client.rpc('mis_ordenes');

    return error ? null : (data as OrdenPropia[]);
  }

  async canjes(): Promise<Canje[] | null> {
    const { data, error } = await this.supabase.client
      .from('canjes')
      .select('id, costo_puntos, creado_at, recompensas(nombre)')
      .order('creado_at', { ascending: false })
      .overrideTypes<Canje[], { merge: false }>();

    return error ? null : data;
  }

  /**
   * Cancela una compra y acredita lo pagado como crédito. Los motivos por los que no se puede
   * (menos de 2 horas, entrada ya usada) los dice la base con su propio texto.
   */
  async cancelar(ordenId: string): Promise<ResultadoDeCancelacion> {
    const { data, error } = await this.supabase.client.rpc('cancelar_orden', {
      p_orden: ordenId,
    });

    if (error) {
      return { estado: 'error', mensaje: mensajeDeError(error) };
    }

    return { estado: 'cancelada', credito: Number((data as { credito: number }).credito) };
  }
}
