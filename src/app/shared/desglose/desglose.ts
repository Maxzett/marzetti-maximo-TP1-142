import { Component, computed, input } from '@angular/core';
import { describirCupon } from '../../core/compra/candy';
import { formatearPrecio, formatearPuntos } from '../../core/formato/precio';
import { DesgloseDeOrden } from '../../core/models/orden';
import { NOMBRE_DE_TIPO } from '../../core/salas/distribucion';

/**
 * El detalle de una compra en el orden en que se aplica cada cosa (D-06): las entradas, el
 * candy, el subtotal, el cupón, el crédito y lo que se paga. Solo muestra lo que calculó la
 * base; no suma ni descuenta nada por su cuenta, así lo que se lee es lo que se cobra.
 */
@Component({
  imports: [],
  selector: 'app-desglose',
  styleUrl: './desglose.css',
  templateUrl: './desglose.html',
})
export class Desglose {
  readonly desglose = input.required<DesgloseDeOrden>();
  /** Con cuenta se anuncian los puntos que se ganan con esta compra (RN-07) */
  readonly mostrarPuntos = input(false);

  protected readonly formatearPrecio = formatearPrecio;
  protected readonly formatearPuntos = formatearPuntos;
  protected readonly nombres = NOMBRE_DE_TIPO;

  protected readonly cupon = computed(() => {
    const cupon = this.desglose().cupon;
    return cupon ? `${cupon.codigo} (${describirCupon(cupon)})` : '';
  });
}
