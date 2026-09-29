import { Component, input } from '@angular/core';
import { LineaDelPedido } from '../../core/compra/candy';

/**
 * "Tu pedido": lo que la persona lleva elegido, al costado del selector del candy. En escritorio
 * el selector ocupa varias pantallas de alto y lo elegido arriba de todo queda fuera de la vista;
 * este resumen acompaña el scroll para que se vea qué se suma sin volver a subir.
 *
 * Solo nombres y cantidades, sin montos: el precio lo decide la base y se muestra en el paso de
 * pago con el cupón y el crédito aplicados (mismo criterio que app-desglose).
 */
@Component({
  imports: [],
  selector: 'app-pedido',
  styleUrl: './pedido.css',
  templateUrl: './pedido.html',
})
export class Pedido {
  /** Butacas elegidas ya escritas ("F7 · VIP"); vacío en la compra de candy sin entrada */
  readonly butacas = input<readonly string[]>([]);
  readonly lineas = input.required<readonly LineaDelPedido[]>();
  /** Sin candy bar cargado no hay nada que ofrecer, y el bloque no se muestra */
  readonly mostrarCandy = input(true);
  /** Qué decir cuando todavía no hay candy elegido */
  readonly vacio = input('Todavía no sumaste nada del candy bar.');
}
