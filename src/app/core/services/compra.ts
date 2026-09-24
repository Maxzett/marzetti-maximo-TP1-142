import { inject, Service } from '@angular/core';
import { mensajeDeError } from '../admin/mensaje-de-error';
import { estadosDesdeFilas, MapaDeEstados } from '../compra/estado-butacas';
import { sesionDeCompra } from '../compra/sesion';
import {
  DesgloseDeOrden,
  EntradaComprada,
  EventoDeButaca,
  MedioDePago,
  ResultadoDeConfiguracion,
  ResultadoDeOrden,
  ResultadoDePago,
  ResultadoDeReserva,
  ResumenDeOrden,
  SeleccionDeOrden,
} from '../models/orden';
import { Supabase } from './supabase';

/** Lo que devuelve confirmar_pago (migración 0020) */
type RespuestaDePago =
  { ok: true; codigo: string } | { ok: false; motivo: string; mensaje: string };

/**
 * Compra de entradas (RF-24 a RF-29).
 *
 * Nada de esto escribe tablas: las cuatro de la compra están cerradas a la API y todo pasa por
 * funciones de la base, que validan la función, la butaca, la edad y el estado. Este servicio
 * solo las llama y traduce sus errores. Las reglas (RN-03, RN-04, RN-10, RN-11) no se repiten
 * acá: una copia en el cliente se podría saltear desde las DevTools y engañaría al leerla.
 *
 * El comprador se identifica con `sesionId`, no con la cuenta: la compra es anónima (RF-26).
 */
@Service()
export class Compra {
  private readonly supabase = inject(Supabase);

  readonly sesionId = sesionDeCompra();

  /** Butacas que no están libres en una función. Null si la lectura falló */
  async cargarEstados(funcionId: string): Promise<MapaDeEstados | null> {
    const { data, error } = await this.supabase.client.rpc('estado_butacas', {
      p_funcion: funcionId,
      p_sesion: this.sesionId,
    });

    return error
      ? null
      : estadosDesdeFilas(
          data as { butaca_id: string; estado: string; expira_at: string | null }[],
        );
  }

  /** Reserva una butaca por 10 minutos (D-08) y dice cuándo vence, o por qué no se pudo */
  async retener(funcionId: string, butacaId: string): Promise<ResultadoDeReserva> {
    const { data, error } = await this.supabase.client.rpc('retener_butaca', {
      p_funcion: funcionId,
      p_butaca: butacaId,
      p_sesion: this.sesionId,
    });

    if (error) {
      return { estado: 'error', mensaje: mensajeDeError(error) };
    }

    // Volver a reservar una butaca que ya era propia no trae vencimiento: el que ya se conoce sigue valiendo
    return {
      estado: 'reservada',
      expiraAt: (data as { expira_at?: string } | null)?.expira_at ?? null,
    };
  }

  async liberar(funcionId: string, butacaId: string): Promise<string | null> {
    const { error } = await this.supabase.client.rpc('liberar_butaca', {
      p_funcion: funcionId,
      p_butaca: butacaId,
      p_sesion: this.sesionId,
    });

    return error ? mensajeDeError(error) : null;
  }

  /**
   * Convierte las reservas en una orden pendiente con los precios congelados. Con restricción
   * de edad y sin cuenta hay que pasar la fecha de nacimiento declarada (D-02).
   */
  async crearOrden(
    funcionId: string,
    email: string,
    fechaNacimiento: string | null,
  ): Promise<ResultadoDeOrden> {
    const { data, error } = await this.supabase.client.rpc('crear_orden', {
      p_funcion: funcionId,
      p_sesion: this.sesionId,
      p_email: email,
      p_fecha_nacimiento: fechaNacimiento,
    });

    if (error) {
      return { estado: 'error', mensaje: mensajeDeError(error) };
    }

    return { estado: 'creada', resumen: data as ResumenDeOrden };
  }

  /**
   * Manda lo elegido del candy, el cupón, el crédito y el canje, y recibe el desglose que
   * calculó la base. Reemplaza la selección entera cada vez, así que se puede llamar con cada
   * cambio. Una selección inválida (cupón que no corresponde, más combos que butacas) vuelve
   * como error con el mensaje de la base, y la orden queda como estaba.
   */
  async configurarOrden(
    ordenId: string,
    seleccion: SeleccionDeOrden,
  ): Promise<ResultadoDeConfiguracion> {
    const { data, error } = await this.supabase.client.rpc('configurar_orden', {
      p_orden: ordenId,
      p_sesion: this.sesionId,
      p_productos: seleccion.productos,
      p_combos: seleccion.combos,
      p_cupon: seleccion.cupon.trim() || null,
      p_usar_credito: seleccion.usarCredito,
      p_recompensa: seleccion.recompensaId,
    });

    if (error) {
      return { estado: 'error', mensaje: mensajeDeError(error) };
    }

    const respuesta = data as
      ({ ok: true } & DesgloseDeOrden) | { ok: false; motivo: string; mensaje: string };

    return respuesta.ok
      ? { estado: 'configurada', desglose: respuesta }
      : { estado: 'vencida', mensaje: respuesta.mensaje };
  }

  /**
   * Pago simulado (D-07). Que la reserva haya vencido no es un error de la base sino un
   * resultado previsto, y por eso tiene su propio estado.
   */
  async confirmarPago(ordenId: string, medio: MedioDePago | null): Promise<ResultadoDePago> {
    const { data, error } = await this.supabase.client.rpc('confirmar_pago', {
      p_orden: ordenId,
      p_sesion: this.sesionId,
      p_medio: medio,
    });

    if (error) {
      return { estado: 'error', mensaje: mensajeDeError(error) };
    }

    const respuesta = data as RespuestaDePago;

    return respuesta.ok
      ? { estado: 'pagada', codigo: respuesta.codigo }
      : { estado: 'vencida', mensaje: respuesta.mensaje };
  }

  /** La entrada por su código (RF-27). Null si no existe o la lectura falló */
  async obtenerEntrada(codigo: string): Promise<EntradaComprada | null> {
    const { data, error } = await this.supabase.client.rpc('obtener_orden', {
      p_codigo: codigo,
    });

    return error ? null : (data as EntradaComprada);
  }

  /**
   * Escucha los cambios de butacas de una función en tiempo real (RF-25). La base emite un
   * Broadcast por función con solo la butaca y su estado. Devuelve la función que cancela la
   * suscripción: quien la abre tiene que cerrarla al salir, o el canal queda abierto.
   */
  escuchar(funcionId: string, alEvento: (evento: EventoDeButaca) => void): () => void {
    const canal = this.supabase.client
      .channel(`funcion:${funcionId}`)
      .on('broadcast', { event: 'butaca' }, ({ payload }) => alEvento(payload as EventoDeButaca))
      .subscribe();

    return () => {
      void this.supabase.client.removeChannel(canal);
    };
  }
}
