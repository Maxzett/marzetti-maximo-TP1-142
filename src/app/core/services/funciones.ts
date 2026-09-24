import { inject, Service } from '@angular/core';
import { mensajeDeError } from '../admin/mensaje-de-error';
import {
  ConflictoDeSala,
  DatosModificacion,
  DatosProgramacion,
  Funcion,
  FuncionCreada,
  ResultadoModificacion,
  ResultadoProgramacion,
} from '../models/sala';
import { Supabase } from './supabase';

/**
 * Las columnas de `funciones` más la película y la sala, que viven en otras tablas. Los alias
 * (`pelicula:peliculas(...)`) hacen que la fila llegue con `pelicula` y `sala` en singular, que
 * es como se lee en la interfaz. Es un JOIN de PostgREST: una sola consulta, no una por fila.
 */
const COLUMNAS =
  'id, pelicula_id, sala_id, inicio, formato, idioma, precio_base, activa, pelicula:peliculas(titulo, duracion_minutos), sala:salas(nombre)';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgREST corta en 1000 filas. La programación de un mes son cientos: se pide con tope explícito */
const MAXIMO_DE_FUNCIONES = 500;

/** Lo que devuelve crear_funciones (migración 0019): el resultado es todo o nada */
type RespuestaDeAlta =
  { ok: true; creadas: FuncionCreada[] } | { ok: false; sin_sala: ConflictoDeSala[] };

/** Lo que devuelve modificar_funcion */
type RespuestaDeModificacion =
  | { ok: true; funcion_id: string; sala_id: string; sala: string }
  | { ok: false; sin_sala: ConflictoDeSala[] };

/**
 * Programación de funciones (RF-19 a RF-23).
 *
 * Lo que se lee lo abre la política pública de la migración 0019. Lo que se escribe pasa por
 * funciones de la base y nunca por las tablas: el administrador no elige la sala (RF-21), la
 * asigna el algoritmo, y ningún rol de la API tiene permiso de escribir `funciones` directo.
 * Este servicio no asigna nada ni valida solapamientos: eso lo hace la base, atómicamente.
 *
 * Programar y modificar pueden terminar en tres estados distintos (salió bien, no hay sala,
 * falló), por eso devuelven un resultado con `estado` y no un simple mensaje de error.
 */
@Service()
export class Funciones {
  private readonly supabase = inject(Supabase);

  /**
   * Una función por id, para la pantalla de compra. Null si no existe, fue dada de baja (la
   * política pública no la deja ver) o la lectura falló. Un id que no es uuid haría fallar a
   * Postgres con 22P02: es la misma "no encontrada", y no se va a la red por una URL escrita a mano.
   */
  async cargarUna(id: string): Promise<Funcion | null> {
    if (!ES_UUID.test(id)) {
      return null;
    }

    const { data, error } = await this.supabase.client
      .from('funciones')
      .select(COLUMNAS)
      .eq('id', id)
      .eq('activa', true)
      .maybeSingle<Funcion>();

    return error ? null : data;
  }

  /**
   * Las funciones vigentes que todavía no empezaron, por horario. Null si la lectura falló.
   * Las de baja no se listan: no son programación, son historia.
   */
  async cargarProgramacion(peliculaId: string | null = null): Promise<Funcion[] | null> {
    let consulta = this.supabase.client
      .from('funciones')
      .select(COLUMNAS)
      .eq('activa', true)
      .gte('inicio', new Date().toISOString());

    if (peliculaId) {
      consulta = consulta.eq('pelicula_id', peliculaId);
    }

    const { data, error } = await consulta
      .order('inicio')
      .limit(MAXIMO_DE_FUNCIONES)
      .overrideTypes<Funcion[], { merge: false }>();

    return error ? null : data;
  }

  /**
   * Programa funciones para los días y el horario elegidos (RF-20). La base asigna la sala de
   * cada una (RF-21). Si alguna fecha no tiene sala libre no se crea ninguna y se devuelve el
   * detalle de cuáles, con horarios cercanos (RF-22, D-05).
   */
  async crear(datos: DatosProgramacion): Promise<ResultadoProgramacion> {
    const { data, error } = await this.supabase.client.rpc('crear_funciones', {
      p_pelicula_id: datos.peliculaId,
      p_desde: datos.desde,
      p_hasta: datos.hasta,
      p_dias: [...datos.dias],
      p_hora: datos.hora,
      p_formato: datos.formato,
      p_idioma: datos.idioma,
      p_precio_base: datos.precioBase,
    });

    if (error) {
      return { estado: 'error', mensaje: mensajeDeError(error) };
    }

    // Sin tipos de base generados, rpc() devuelve data sin tipo: se declara acá lo que
    // devuelve la función SQL.
    const respuesta = data as RespuestaDeAlta;

    return respuesta.ok
      ? { estado: 'creadas', creadas: respuesta.creadas }
      : { estado: 'sin_sala', conflictos: respuesta.sin_sala };
  }

  /**
   * Cambia horario, formato, idioma o precio de una función (RF-23). Con entradas vendidas la
   * base solo deja cambiar el precio. Si se mueve a un horario sin sala libre, la función queda
   * como estaba y se informa igual que en el alta.
   */
  async modificar(id: string, datos: DatosModificacion): Promise<ResultadoModificacion> {
    const { data, error } = await this.supabase.client.rpc('modificar_funcion', {
      p_funcion_id: id,
      p_inicio: datos.inicio,
      p_formato: datos.formato,
      p_idioma: datos.idioma,
      p_precio_base: datos.precioBase,
    });

    if (error) {
      return { estado: 'error', mensaje: mensajeDeError(error) };
    }

    const respuesta = data as RespuestaDeModificacion;

    return respuesta.ok
      ? { estado: 'modificada', sala: respuesta.sala }
      : { estado: 'sin_sala', conflictos: respuesta.sin_sala };
  }

  /** Baja lógica (RF-23): libera la sala. Con entradas vendidas la base la rechaza */
  async darDeBaja(id: string): Promise<string | null> {
    const { error } = await this.supabase.client.rpc('dar_de_baja_funcion', {
      p_funcion_id: id,
    });

    return error ? mensajeDeError(error) : null;
  }
}
