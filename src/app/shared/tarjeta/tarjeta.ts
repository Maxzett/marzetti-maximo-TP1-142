import { Component, input } from '@angular/core';

/**
 * Superficie del sistema: la caja sobre la que se apoyan póster, función o combo.
 * No proyecta semántica propia; quien la usa decide si adentro va un <article> o un <li>.
 */
@Component({
  imports: [],
  selector: 'app-tarjeta',
  styleUrl: './tarjeta.css',
  templateUrl: './tarjeta.html',
})
export class Tarjeta {
  /** Con sombra y borde fuerte: para lo que tiene que destacarse sobre el resto */
  readonly destacada = input(false);
}
