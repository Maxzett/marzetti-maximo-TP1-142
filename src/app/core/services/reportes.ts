import { inject, Service } from '@angular/core';
import { instanteDeFuncion } from '../funciones/programacion';
import {
  DiaDeFacturacion,
  FiltroDeActividad,
  PaginaDeActividad,
  PeliculaVista,
  Periodo,
  ProductoVendido,
  RegistroDeActividad,
} from '../models/reportes';
import { sumarDias } from '../../shared/selector-fecha/fechas';
import { Supabase } from './supabase';

/** Registros del log por página: una pantalla entera sin que la tabla se vuelva infinita */
export const REGISTROS_POR_PAGINA = 50;

/**
 * Reportes y log de actividad del panel de administración (RF-57 a RF-61).
 *
 * Los reportes son funciones de la base (migración 0024) que devuelven el agregado ya resuelto:
 * este servicio no suma ventas ni lee `ordenes`, que sigue cerrada. Las funciones verifican que
 * quien llama sea administrador; el guard de la ruta es solo una ayuda de interfaz (RNF-09).
 *
 * El log se lee directo de la tabla: su política solo le muestra filas al admin, y a cualquier
 * otro le devuelve una lista vacía, no un error.
 *
 * Todas las lecturas devuelven null si la base falla, para que la pantalla distinga un error de
 * un período sin ventas.
 */
@Service()
export class Reportes {
  private readonly supabase = inject(Supabase);

  async facturacion(desde: string, hasta: string): Promise<DiaDeFacturacion[] | null> {
    // rpc() no recibe overrideTypes (ver Catalogo): se tipa con un cast, que es lo que declara la
    // función SQL
    const { data, error } = await this.supabase.client.rpc('reporte_facturacion', {
      p_desde: desde,
      p_hasta: hasta,
    });

    // numeric viaja como número en JSON, pero se normaliza igual: una suma sobre un texto
    // concatenaría en vez de sumar, y el total del reporte sería basura sin dar error
    return error
      ? null
      : (data as DiaDeFacturacion[]).map((dia) => ({
          dia: dia.dia,
          ordenes: Number(dia.ordenes),
          entradas: Number(dia.entradas),
          cobrado: Number(dia.cobrado),
          credito: Number(dia.credito),
          descuentos: Number(dia.descuentos),
          canceladas: Number(dia.canceladas),
        }));
  }

  async peliculasMasVistas(periodo: Periodo, referencia: string): Promise<PeliculaVista[] | null> {
    const { data, error } = await this.supabase.client.rpc('peliculas_mas_vistas', {
      p_periodo: periodo,
      p_referencia: referencia,
      p_limite: 10,
    });

    return error
      ? null
      : (data as PeliculaVista[]).map((fila) => ({ ...fila, entradas: Number(fila.entradas) }));
  }

  async productosMasVendidos(desde: string, hasta: string): Promise<ProductoVendido[] | null> {
    const { data, error } = await this.supabase.client.rpc('productos_mas_vendidos', {
      p_desde: desde,
      p_hasta: hasta,
      p_limite: 5,
    });

    return error
      ? null
      : (data as ProductoVendido[]).map((fila) => ({ ...fila, unidades: Number(fila.unidades) }));
  }

  /**
   * Una página del log, lo más reciente primero. Las fechas del filtro son días del cine: el
   * "hasta" incluye ese día entero, por eso se compara contra la medianoche del día siguiente.
   */
  async actividad(filtro: FiltroDeActividad, pagina: number): Promise<PaginaDeActividad | null> {
    let consulta = this.supabase.client
      .from('log_actividad')
      .select(
        'id, accion, entidad, entidad_id, detalle, creado_at, actor_email, actor_rol, actor:perfiles(nombre, apellido)',
        { count: 'exact' },
      );

    if (filtro.accion) {
      consulta = consulta.eq('accion', filtro.accion);
    }

    if (filtro.desde) {
      consulta = consulta.gte('creado_at', instanteDeFuncion(filtro.desde, '00:00'));
    }

    if (filtro.hasta) {
      consulta = consulta.lt('creado_at', instanteDeFuncion(sumarDias(filtro.hasta, 1), '00:00'));
    }

    const desde = pagina * REGISTROS_POR_PAGINA;
    const { data, error, count } = await consulta
      .order('creado_at', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + REGISTROS_POR_PAGINA - 1)
      .overrideTypes<RegistroDeActividad[], { merge: false }>();

    return error ? null : { registros: data, total: count ?? data.length };
  }
}
