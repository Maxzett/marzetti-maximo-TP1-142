import { Component, computed, input, model } from '@angular/core';
import {
  agruparPorCategoria,
  Cantidades,
  contenidoDelCombo,
  entradasDelCombo,
  MAXIMO_POR_LINEA,
  unidadesQueEntran,
} from '../../core/compra/candy';
import { formatearPrecio } from '../../core/formato/precio';
import { CatalogoDeCandy, Combo } from '../../core/models/candy';
import { Cantidad } from '../cantidad/cantidad';

/**
 * Candy y combos para sumar a la compra (RF-34, RF-36, RF-37). Solo elige cantidades: no calcula
 * precios ni valida reglas, eso lo hace la base al recibir la selección. Lo único que adelanta es
 * el tope de los combos con entrada, que no pueden ser más que las butacas reservadas: en vez de
 * dejar sumar y avisar después, el botón "+" se traba donde corresponde.
 */
@Component({
  imports: [Cantidad],
  selector: 'app-selector-candy',
  styleUrl: './selector-candy.css',
  templateUrl: './selector-candy.html',
})
export class SelectorCandy {
  readonly catalogo = input.required<CatalogoDeCandy>();
  /** Butacas reservadas: cada combo con entrada consume una */
  readonly butacas = input.required<number>();
  readonly conCanjeDeEntrada = input(false);

  readonly productos = model<Cantidades>(new Map());
  readonly combos = model<Cantidades>(new Map());

  protected readonly formatearPrecio = formatearPrecio;
  protected readonly contenidoDelCombo = contenidoDelCombo;
  protected readonly entradasDelCombo = entradasDelCombo;

  /** Los destacados primero (RF-37); adentro de cada grupo, por nombre */
  protected readonly combosOrdenados = computed(() =>
    [...this.catalogo().combos].sort(
      (a, b) => Number(b.destacado) - Number(a.destacado) || a.nombre.localeCompare(b.nombre),
    ),
  );

  protected readonly grupos = computed(() =>
    agruparPorCategoria(this.catalogo().categorias, this.catalogo().productos),
  );

  protected readonly hayAlgo = computed(
    () => this.catalogo().combos.length > 0 || this.catalogo().productos.length > 0,
  );

  protected cantidadDeProducto(id: string): number {
    return this.productos().get(id) ?? 0;
  }

  protected cantidadDeCombo(id: string): number {
    return this.combos().get(id) ?? 0;
  }

  protected ponerProducto(id: string, cantidad: number): void {
    this.productos.set(this.conCantidad(this.productos(), id, cantidad));
  }

  protected ponerCombo(id: string, cantidad: number): void {
    this.combos.set(this.conCantidad(this.combos(), id, cantidad));
  }

  /** Lo que ya hay elegido más lo que todavía entra: el tope que se le pasa al "+" */
  protected maximoDelCombo(combo: Combo): number {
    const actuales = this.cantidadDeCombo(combo.id);
    const libres = unidadesQueEntran(
      combo,
      this.catalogo().combos,
      this.combos(),
      this.butacas(),
      this.conCanjeDeEntrada(),
    );

    return Math.min(MAXIMO_POR_LINEA, actuales + libres);
  }

  protected readonly maximoPorLinea = MAXIMO_POR_LINEA;

  private conCantidad(actuales: Cantidades, id: string, cantidad: number): Cantidades {
    const mapa = new Map(actuales);

    if (cantidad <= 0) {
      mapa.delete(id);
    } else {
      mapa.set(id, cantidad);
    }

    return mapa;
  }
}
