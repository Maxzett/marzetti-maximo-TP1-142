import { CatalogoDeCandy, CategoriaDeProducto, Combo, Producto } from '../models/candy';
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

/** Una línea del resumen lateral: qué se eligió y cuántas unidades, sin precio */
export interface LineaDelPedido {
  id: string;
  nombre: string;
  cantidad: number;
}

/**
 * Lo elegido, con nombre, para el resumen "Tu pedido" que acompaña al selector. Combos primero y
 * después productos, cada uno en el orden del catálogo. Sin precios a propósito: el monto lo
 * decide la base (calcular_orden) y se ve en el paso de pago, con cupón y crédito ya aplicados.
 */
export function lineasDelPedido(
  catalogo: CatalogoDeCandy,
  productos: Cantidades,
  combos: Cantidades,
): LineaDelPedido[] {
  const elegidos = (lista: readonly { id: string; nombre: string }[], cantidades: Cantidades) =>
    lista
      .filter((item) => (cantidades.get(item.id) ?? 0) > 0)
      .map((item) => ({
        id: item.id,
        nombre: item.nombre,
        cantidad: cantidades.get(item.id) ?? 0,
      }));

  return [...elegidos(catalogo.combos, combos), ...elegidos(catalogo.productos, productos)];
}

/** "20 %" o "$1.500": cómo se dice un descuento */
export function describirCupon(cupon: Pick<CuponAplicado, 'tipo_descuento' | 'valor'>): string {
  return cupon.tipo_descuento === 'porcentaje'
    ? `${cupon.valor} %`
    : `$${new Intl.NumberFormat('es-AR').format(cupon.valor)}`;
}

/**
 * El catálogo para comprar candy sin entrada (RF-34.1): sin los combos que traen entrada ni el
 * canje de una entrada, que no tendrían butaca que cubrir. La base los rechazaría igual; acá
 * no se ofrecen para no invitar al error.
 */
export function catalogoSinEntradas(catalogo: CatalogoDeCandy): CatalogoDeCandy {
  return {
    ...catalogo,
    combos: catalogo.combos.filter((combo) => entradasDelCombo(combo) === 0),
    recompensas: catalogo.recompensas.filter((recompensa) => recompensa.tipo === 'producto'),
  };
}

/** Cuánto le falta a una cuenta para un canje: lo que el perfil muestra como incentivo (RF-46) */
export interface ProgresoDeCanje {
  alcanza: boolean;
  faltan: number;
  /** De 0 a 100, para dibujar la barra; el texto dice lo mismo con palabras */
  porcentaje: number;
}

export function progresoDeCanje(costo: number, puntos: number): ProgresoDeCanje {
  // Un saldo negativo (una cancelación que anuló puntos ya gastados) no dibuja una barra negativa
  const saldo = Math.max(0, puntos);
  const alcanza = saldo >= costo;

  return {
    alcanza,
    faltan: alcanza ? 0 : costo - saldo,
    porcentaje: costo > 0 ? Math.min(100, Math.floor((saldo * 100) / costo)) : 100,
  };
}
