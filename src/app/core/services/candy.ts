import { inject, Service } from '@angular/core';
import { CatalogoDeCandy, CategoriaDeProducto, Combo, Producto, Recompensa } from '../models/candy';
import { Supabase } from './supabase';

/**
 * Candy bar y recompensas (RF-33 a RF-37, RF-46). Lectura pública (migración 0022): la compra es
 * anónima y el candy se ofrece antes de que exista una cuenta. La base ya filtra lo dado de baja
 * con RLS, así que acá no se vuelve a filtrar por `activo`.
 *
 * Devuelve null si alguna de las lecturas falla, para que la pantalla distinga un error de un
 * candy vacío. El candy es opcional: si no carga, la compra de entradas sigue funcionando.
 */
@Service()
export class Candy {
  private readonly supabase = inject(Supabase);

  async cargar(): Promise<CatalogoDeCandy | null> {
    const cliente = this.supabase.client;

    const [categorias, productos, combos, recompensas] = await Promise.all([
      cliente
        .from('categorias_productos')
        .select('id, nombre, orden')
        .order('orden')
        .overrideTypes<CategoriaDeProducto[], { merge: false }>(),
      cliente
        .from('productos')
        .select('id, categoria_id, nombre, descripcion, imagen_url, precio')
        .order('nombre')
        .overrideTypes<Producto[], { merge: false }>(),
      cliente
        .from('combos')
        .select(
          'id, nombre, descripcion, imagen_url, precio, destacado, combo_items(incluye_entrada, cantidad, productos(nombre))',
        )
        .order('nombre')
        .overrideTypes<Combo[], { merge: false }>(),
      cliente
        .from('recompensas')
        .select('id, nombre, tipo, producto_id, costo_puntos')
        .order('costo_puntos')
        .overrideTypes<Recompensa[], { merge: false }>(),
    ]);

    if (categorias.error || productos.error || combos.error || recompensas.error) {
      return null;
    }

    return {
      categorias: categorias.data,
      productos: productos.data,
      combos: combos.data,
      recompensas: recompensas.data,
    };
  }
}
