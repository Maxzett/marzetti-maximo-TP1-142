import { CategoriaDeProducto, Combo, Producto } from '../models/candy';
import { CuponAplicado } from '../models/orden';

/**
 * Lógica pura del candy en la compra. Acá no se decide ningún precio ni ninguna regla: eso lo
 * hace la base (`calcular_orden`, migración 0022). Lo de este archivo es armar lo que se le
 * manda y adelantar avisos para no hacer esperar una vuelta de red por algo evidente.
 */

/** Unidades elegidas por id de producto o de combo */
export type Cantidades = ReadonlyMap<string, number>;

/** Mismo tope que `max_unidades_por_producto` de la base: es comodidad, la base es la que manda */
export const MAXIMO_POR_LINEA = 20;

/**
 * Suma o resta unidades sin mutar el mapa. Al llegar a cero la línea desaparece, para que "elegí
 * 0" y "no elegí" sean lo mismo y no viajen renglones vacíos a la base.
 */
export function cambiarCantidad(
  cantidades: Cantidades,
  id: string,
  delta: number,
  maximo = MAXIMO_POR_LINEA,
): Cantidades {
  const siguiente = Math.min(maximo, Math.max(0, (cantidades.get(id) ?? 0) + delta));
  const mapa = new Map(cantidades);

  if (siguiente === 0) {
    mapa.delete(id);
  } else {
    mapa.set(id, siguiente);
  }

  return mapa;
}

/** Forma que espera configurar_orden: una lista de `{id, cantidad}` */
export function comoLineas(cantidades: Cantidades): { id: string; cantidad: number }[] {
  return [...cantidades].map(([id, cantidad]) => ({ id, cantidad }));
}

/** Los productos por categoría, en el orden que definió el administrador; sin categorías vacías */
export function agruparPorCategoria(
  categorias: readonly CategoriaDeProducto[],
  productos: readonly Producto[],
): { categoria: CategoriaDeProducto; productos: Producto[] }[] {
  return [...categorias]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((categoria) => ({
      categoria,
      productos: productos.filter((p) => p.categoria_id === categoria.id),
    }))
    .filter((grupo) => grupo.productos.length > 0);
}

/** Cuántas entradas trae un combo (RF-36): las que consumen una butaca de la orden */
export function entradasDelCombo(combo: Combo): number {
  return combo.combo_items
    .filter((item) => item.incluye_entrada)
    .reduce((suma, item) => suma + item.cantidad, 0);
}

/** Butacas que cubren los combos elegidos y, si hay, un canje de entrada */
export function entradasCubiertas(
  combos: readonly Combo[],
  cantidades: Cantidades,
  conCanjeDeEntrada: boolean,
): number {
  const deCombos = combos.reduce(
    (suma, combo) => suma + entradasDelCombo(combo) * (cantidades.get(combo.id) ?? 0),
    0,
  );

  return deCombos + (conCanjeDeEntrada ? 1 : 0);
}

/**
 * Cuántas unidades más de un combo entran sin pasarse de las butacas reservadas. Un combo sin
 * entrada (solo candy) no consume butaca y solo lo limita el tope por línea.
 */
export function unidadesQueEntran(
  combo: Combo,
  combos: readonly Combo[],
  cantidades: Cantidades,
  butacas: number,
  conCanjeDeEntrada: boolean,
): number {
  const porUnidad = entradasDelCombo(combo);

  if (porUnidad === 0) {
    return MAXIMO_POR_LINEA - (cantidades.get(combo.id) ?? 0);
  }

  const libres = butacas - entradasCubiertas(combos, cantidades, conCanjeDeEntrada);

  return Math.max(0, Math.floor(libres / porUnidad));
}

/** "Tu entrada · Pochoclo mediano · Gaseosa 500 ml": lo que trae el combo, en una línea */
export function contenidoDelCombo(combo: Combo): string {
  return combo.combo_items
    .map((item) => {
      const nombre = item.incluye_entrada ? 'Entrada' : (item.productos?.nombre ?? 'Producto');
      return item.cantidad > 1 ? `${item.cantidad} × ${nombre}` : nombre;
    })
    .join(' · ');
}

/** "20 %" o "$1.500": cómo se dice un descuento */
export function describirCupon(cupon: Pick<CuponAplicado, 'tipo_descuento' | 'valor'>): string {
  return cupon.tipo_descuento === 'porcentaje'
    ? `${cupon.valor} %`
    : `$${new Intl.NumberFormat('es-AR').format(cupon.valor)}`;
}
