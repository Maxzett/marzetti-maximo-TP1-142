/** Categoría del candy bar (RF-33) */
export interface CategoriaDeProducto {
  id: string;
  nombre: string;
  orden: number;
}

export interface Producto {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string;
  imagen_url: string | null;
  precio: number;
}

/** Un renglón de un combo: una entrada o un producto (la base lo impone, migración 0007) */
export interface ItemDeCombo {
  incluye_entrada: boolean;
  cantidad: number;
  /** Nulo cuando el renglón es la entrada, o cuando el producto fue dado de baja */
  productos: { nombre: string } | null;
}

/** Combo a precio fijo (RF-36), que no es la suma de las partes */
export interface Combo {
  id: string;
  nombre: string;
  descripcion: string;
  imagen_url: string | null;
  precio: number;
  destacado: boolean;
  combo_items: ItemDeCombo[];
}

/** Lo que se puede canjear por puntos (RF-46, RF-47) */
export interface Recompensa {
  id: string;
  nombre: string;
  tipo: 'entrada' | 'producto';
  producto_id: string | null;
  costo_puntos: number;
}

/** Todo lo que necesita la pantalla de compra para ofrecer el candy */
export interface CatalogoDeCandy {
  categorias: CategoriaDeProducto[];
  productos: Producto[];
  combos: Combo[];
  recompensas: Recompensa[];
}
