import { CategoriaDeProducto } from './candy';
import { Genero, Pelicula } from './pelicula';

/**
 * Lo que gestiona el administrador en el candy y las promociones (RF-33, RF-36, RF-43, RF-44,
 * RF-47). A diferencia de los modelos de la compra, incluyen lo dado de baja y su estado: el
 * admin los ve por las políticas de la migración 0024 y los reactiva desde acá.
 */

export interface ProductoGestionado {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  activo: boolean;
}

/** Un renglón de un combo: la entrada (producto_id nulo) o un producto */
export interface ItemDeComboGestionado {
  producto_id: string | null;
  incluye_entrada: boolean;
  cantidad: number;
}

export interface ComboGestionado {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  destacado: boolean;
  activo: boolean;
  combo_items: ItemDeComboGestionado[];
}

export interface CandyGestionado {
  categorias: CategoriaDeProducto[];
  productos: ProductoGestionado[];
  combos: ComboGestionado[];
}

export type TipoDeCupon = 'bienvenida' | 'por_edad' | 'general';
export type TipoDeDescuento = 'porcentaje' | 'monto';

export interface Cupon {
  id: string;
  codigo: string;
  tipo: TipoDeCupon;
  tipo_descuento: TipoDeDescuento;
  valor: number;
  edad_minima: number | null;
  /** 'AAAA-MM-DD' o nulo si no tiene límite */
  vigente_desde: string | null;
  vigente_hasta: string | null;
  activo: boolean;
}

export interface RecompensaGestionada {
  id: string;
  nombre: string;
  tipo: 'entrada' | 'producto';
  producto_id: string | null;
  costo_puntos: number;
  activa: boolean;
}

/** Las opciones de la tabla `configuracion` que se pueden cambiar desde el panel */
export type ClaveDeConfiguracion =
  'recargo_vip' | 'max_butacas_por_orden' | 'max_unidades_por_producto';

export interface Promociones {
  cupones: Cupon[];
  recompensas: RecompensaGestionada[];
  configuracion: Partial<Record<ClaveDeConfiguracion, number>>;
  /** Los productos activos, para elegir cuál entrega una recompensa */
  productos: { id: string; nombre: string }[];
}

/** Las películas con sus géneros y la lista de géneros para elegir (RF-56) */
export interface PeliculasGestionadas {
  peliculas: Pelicula[];
  generos: Genero[];
}

/** Lo que se manda para guardar una película: los géneros van como lista de ids */
export type DatosDePelicula = Borrador<Omit<Pelicula, 'generos'>> & { generos: string[] };

/** Lo que se manda para guardar: sin id es un alta */
export type Borrador<T extends { id: string }> = Omit<T, 'id'> & { id: string | null };
