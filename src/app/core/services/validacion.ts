import { inject, Service } from '@angular/core';
import { ErrorDeBase, mensajeDeError } from '../admin/mensaje-de-error';
import {
  ConsultaDeOrden,
  MotivoDeRechazo,
  OrdenParaPersonal,
  ResultadoDeValidacion,
  Tramo,
} from '../models/validacion';
import { Supabase } from './supabase';

/** Lo que devuelve validar_tramo (migración 0023) */
type RespuestaDeValidacion =
  | { ok: true; tramo: Tramo; usado_at: string; usado_por: string | null }
  | {
      ok: false;
      motivo: MotivoDeRechazo;
      mensaje: string;
      usado_at?: string;
      usado_por?: string | null;
    };

/**
 * Validación del QR en el acceso (RF-51 a RF-55).
 *
 * Nada de esto escribe tablas: `ordenes` sigue cerrada a la API y las dos funciones de la base
 * verifican por su cuenta que quien llama sea personal del cine, que la compra esté pagada, que
 * sea el momento y que el tramo no se haya usado (RN-05). Este servicio solo las llama y
 * traduce la respuesta. El guard de /empleado es una ayuda de interfaz (RNF-09).
 */
@Service()
export class Validacion {
  private readonly supabase = inject(Supabase);

  /** Lo que el empleado ve al escanear, sin consumir nada */
  async consultar(codigo: string): Promise<ConsultaDeOrden> {
    const { data, error } = await this.supabase.client.rpc('consultar_orden_personal', {
      p_codigo: codigo,
    });

    return error
      ? { estado: 'error', mensaje: traducir(error) }
      : { estado: 'encontrada', orden: data as OrdenParaPersonal };
  }

  /** Consume un tramo. Un rechazo previsto (ya usado, sin candy...) no es un error */
  async validar(codigo: string, tramo: Tramo): Promise<ResultadoDeValidacion> {
    const { data, error } = await this.supabase.client.rpc('validar_tramo', {
      p_codigo: codigo,
      p_tramo: tramo,
    });

    if (error) {
      return { estado: 'error', mensaje: traducir(error) };
    }

    const respuesta = data as RespuestaDeValidacion;

    if (respuesta.ok) {
      return {
        estado: 'validada',
        tramo: respuesta.tramo,
        uso: { usado_at: respuesta.usado_at, usado_por: respuesta.usado_por },
      };
    }

    return {
      estado: 'rechazada',
      motivo: respuesta.motivo,
      mensaje: respuesta.mensaje,
      uso: respuesta.usado_at
        ? { usado_at: respuesta.usado_at, usado_por: respuesta.usado_por ?? null }
        : null,
    };
  }
}

/**
 * El 42501 acá no es "una tarea de la administración" como en el resto de los paneles: es que la
 * cuenta no es de personal, o que la sesión se cerró y la llamada salió como anónima.
 */
function traducir(error: ErrorDeBase): string {
  return error.code === '42501'
    ? 'Solo el personal del cine puede validar entradas. Revisá que tu sesión siga abierta.'
    : mensajeDeError(error);
}
