import { inject, Service } from '@angular/core';
import { mensajeDeError } from '../admin/mensaje-de-error';
import { CategoriaDeProducto } from '../models/candy';
import {
  Borrador,
  CandyGestionado,
  ClaveDeConfiguracion,
  ComboGestionado,
  Cupon,
  ProductoGestionado,
  Promociones,
  RecompensaGestionada,
} from '../models/gestion';
import { Supabase } from './supabase';

/**
 * Gestión del candy y las promociones desde el panel (RF-33, RF-36, RF-43, RF-44, RF-47, RF-56).
 *
 * Lee las tablas directo: desde la migración 0024 el admin ve también lo dado de baja, por una
 * política que pide es_admin(). Escribe SOLO por las funciones guardar_* de esa migración, que
 * verifican el rol y registran cada cambio en el log dentro de la misma transacción (RN-12). Si
 * escribiera por tabla, el registro de auditoría dependería de que la pantalla lo mande.
 *
 * Las lecturas devuelven null si la base falla. Las escrituras devuelven null si salió bien o el
 * mensaje a mostrar, igual que Salas y Funciones.
 */
@Service()
export class Gestion {
  private readonly supabase = inject(Supabase);

  async cargarCandy(): Promise<CandyGestionado | null> {
    const cliente = this.supabase.client;

    const [categorias, productos, combos] = await Promise.all([
      cliente
        .from('categorias_productos')
        .select('id, nombre, orden')
        .order('orden')
        .order('nombre')
        .overrideTypes<CategoriaDeProducto[], { merge: false }>(),
      cliente
        .from('productos')
        .select('id, categoria_id, nombre, descripcion, precio, activo')
        .order('nombre')
        .overrideTypes<ProductoGestionado[], { merge: false }>(),
      cliente
        .from('combos')
        .select(
          'id, nombre, descripcion, precio, destacado, activo, combo_items(producto_id, incluye_entrada, cantidad)',
        )
        .order('nombre')
        .overrideTypes<ComboGestionado[], { merge: false }>(),
    ]);

    if (categorias.error || productos.error || combos.error) {
      return null;
    }

    return {
      categorias: categorias.data,
      productos: productos.data.map((p) => ({ ...p, precio: Number(p.precio) })),
      combos: combos.data.map((c) => ({ ...c, precio: Number(c.precio) })),
    };
  }

  async cargarPromociones(): Promise<Promociones | null> {
    const cliente = this.supabase.client;

    const [cupones, recompensas, configuracion, productos] = await Promise.all([
      cliente
        .from('cupones')
        .select(
          'id, codigo, tipo, tipo_descuento, valor, edad_minima, vigente_desde, vigente_hasta, activo',
        )
        .order('codigo')
        .overrideTypes<Cupon[], { merge: false }>(),
      cliente
        .from('recompensas')
        .select('id, nombre, tipo, producto_id, costo_puntos, activa')
        .order('costo_puntos')
        .overrideTypes<RecompensaGestionada[], { merge: false }>(),
      cliente
        .from('configuracion')
        .select('clave, valor')
        .overrideTypes<{ clave: string; valor: number }[], { merge: false }>(),
      cliente
        .from('productos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre')
        .overrideTypes<{ id: string; nombre: string }[], { merge: false }>(),
    ]);

    if (cupones.error || recompensas.error || configuracion.error || productos.error) {
      return null;
    }

    return {
      cupones: cupones.data.map((c) => ({ ...c, valor: Number(c.valor) })),
      recompensas: recompensas.data,
      configuracion: Object.fromEntries(
        configuracion.data.map((fila) => [fila.clave, Number(fila.valor)]),
      ),
      productos: productos.data,
    };
  }

  guardarCategoria(categoria: Borrador<CategoriaDeProducto>): Promise<string | null> {
    return this.guardar(
      'guardar_categoria',
      { p_id: categoria.id, p_nombre: categoria.nombre, p_orden: categoria.orden },
      'Ya existe una categoría con ese nombre.',
    );
  }

  guardarProducto(producto: Borrador<ProductoGestionado>): Promise<string | null> {
    return this.guardar('guardar_producto', {
      p_id: producto.id,
      p_categoria: producto.categoria_id,
      p_nombre: producto.nombre,
      p_descripcion: producto.descripcion,
      p_precio: producto.precio,
      p_activo: producto.activo,
    });
  }

  guardarCombo(combo: Borrador<ComboGestionado>): Promise<string | null> {
    return this.guardar('guardar_combo', {
      p_id: combo.id,
      p_nombre: combo.nombre,
      p_descripcion: combo.descripcion,
      p_precio: combo.precio,
      p_destacado: combo.destacado,
      p_activo: combo.activo,
      p_items: combo.combo_items,
    });
  }

  guardarCupon(cupon: Borrador<Cupon>): Promise<string | null> {
    return this.guardar(
      'guardar_cupon',
      {
        p_id: cupon.id,
        p_codigo: cupon.codigo,
        p_tipo: cupon.tipo,
        p_tipo_descuento: cupon.tipo_descuento,
        p_valor: cupon.valor,
        p_edad_minima: cupon.edad_minima,
        p_desde: cupon.vigente_desde,
        p_hasta: cupon.vigente_hasta,
        p_activo: cupon.activo,
      },
      'Ya existe un cupón con ese código.',
    );
  }

  guardarRecompensa(recompensa: Borrador<RecompensaGestionada>): Promise<string | null> {
    return this.guardar('guardar_recompensa', {
      p_id: recompensa.id,
      p_nombre: recompensa.nombre,
      p_tipo: recompensa.tipo,
      p_producto: recompensa.producto_id,
      p_costo: recompensa.costo_puntos,
      p_activa: recompensa.activa,
    });
  }

  guardarConfiguracion(clave: ClaveDeConfiguracion, valor: number): Promise<string | null> {
    return this.guardar('guardar_configuracion', { p_clave: clave, p_valor: valor });
  }

  private async guardar(
    funcion: string,
    argumentos: Record<string, unknown>,
    siDuplicado?: string,
  ): Promise<string | null> {
    const { error } = await this.supabase.client.rpc(funcion, argumentos);

    return error ? mensajeDeError(error, siDuplicado) : null;
  }
}
