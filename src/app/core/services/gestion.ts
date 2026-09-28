import { inject, Service } from '@angular/core';
import { mensajeDeError } from '../admin/mensaje-de-error';
import { CategoriaDeProducto } from '../models/candy';
import {
  Borrador,
  CandyGestionado,
  ClaveDeConfiguracion,
  ComboGestionado,
  Cupon,
  DatosDePelicula,
  PeliculasGestionadas,
  ProductoGestionado,
  Promociones,
  RecompensaGestionada,
} from '../models/gestion';
import { Genero } from '../models/pelicula';
import { Catalogo } from './catalogo';
import { Supabase } from './supabase';

/** Los mismos tipos que acepta el bucket `posters` (0025), con la extensión de cada uno */
const EXTENSIONES_DE_POSTER: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** 2 MB: el `file_size_limit` del bucket */
export const TAMANIO_MAXIMO_DE_POSTER = 2 * 1024 * 1024;

/** Lo que precede al nombre del archivo en la URL pública de un póster del bucket */
const RUTA_PUBLICA_DE_POSTERS = '/storage/v1/object/public/posters/';

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
  private readonly catalogo = inject(Catalogo);

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

  // ── Películas (RF-56, migración 0025) ──

  /** Todas las películas, estreno futuro incluido, y los géneros para elegir */
  async cargarPeliculas(): Promise<PeliculasGestionadas | null> {
    const [peliculas, generos] = await Promise.all([
      this.catalogo.cargarTodas(),
      this.supabase.client
        .from('generos')
        .select('id, nombre, slug')
        .order('nombre')
        .overrideTypes<Genero[], { merge: false }>(),
    ]);

    return peliculas === null || generos.error ? null : { peliculas, generos: generos.data };
  }

  guardarPelicula(pelicula: DatosDePelicula): Promise<string | null> {
    return this.guardar(
      'guardar_pelicula',
      {
        p_id: pelicula.id,
        p_titulo: pelicula.titulo,
        p_sinopsis: pelicula.sinopsis,
        p_poster_url: pelicula.poster_url,
        p_duracion: pelicula.duracion_minutos,
        p_restriccion: pelicula.restriccion_edad,
        p_estreno: pelicula.fecha_estreno,
        p_destacada: pelicula.destacada,
        p_precio_preventa: pelicula.precio_preventa,
        p_generos: pelicula.generos,
      },
      // El título no es único (puede haber remakes): un 23505 acá no tiene un motivo que contar
      'No pudimos guardar la película. Probá de nuevo.',
    );
  }

  /**
   * Sube un póster al bucket `posters` y devuelve su URL pública (RNF-02). El bucket vuelve a
   * controlar tipo y tamaño, y solo deja escribir a la administración (0025): esto evita subir
   * 20 MB para enterarse después de que no se aceptaban.
   *
   * El nombre es un UUID nuevo, no el título: dos películas con el mismo nombre no se pisan, y
   * como cada versión tiene su propia URL, el caché del navegador nunca muestra la vieja.
   */
  async subirPoster(archivo: File): Promise<{ url: string } | { error: string }> {
    const extension = EXTENSIONES_DE_POSTER[archivo.type];

    if (!extension) {
      return { error: 'El póster tiene que ser una imagen JPG, PNG o WebP.' };
    }
    if (archivo.size > TAMANIO_MAXIMO_DE_POSTER) {
      return { error: 'El póster puede pesar hasta 2 MB.' };
    }

    const ruta = `${crypto.randomUUID()}.${extension}`;
    const bucket = this.supabase.client.storage.from('posters');
    const { error } = await bucket.upload(ruta, archivo, {
      contentType: archivo.type,
      cacheControl: '31536000',
    });

    if (error) {
      return { error: 'No pudimos subir el póster. Probá de nuevo.' };
    }

    return { url: bucket.getPublicUrl(ruta).data.publicUrl };
  }

  /**
   * Borra un póster del bucket, si la URL es de ahí. Es de mejor esfuerzo: un archivo huérfano
   * ocupa lugar pero no rompe nada, así que un error acá no se le muestra a nadie.
   */
  async borrarPoster(url: string | null): Promise<void> {
    const ruta = url?.split(`${RUTA_PUBLICA_DE_POSTERS}`)[1];

    if (ruta) {
      await this.supabase.client.storage.from('posters').remove([decodeURIComponent(ruta)]);
    }
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
