import { Component, input } from '@angular/core';

/**
 * Póster de una película. Con imagen la muestra; sin ella dibuja uno tipográfico con el
 * título sobre un marco de bombillas, igual que la marquesina de la marca. Así una película
 * recién cargada, sin póster todavía, no deja un hueco gris en la cartelera.
 *
 * Tiene la misma proporción (2:3) en los dos casos, para que la grilla no cambie de alto
 * según qué películas tengan imagen.
 */
@Component({
  imports: [],
  selector: 'app-poster',
  host: { '[class.llena]': 'llenar()' },
  styleUrl: './poster.css',
  templateUrl: './poster.html',
})
export class Poster {
  readonly titulo = input.required<string>();
  /** Nulo mientras la película no tenga imagen cargada */
  readonly url = input<string | null>(null);
  /**
   * Cuando el título ya está escrito al lado, como en una ficha con su enlace, el póster
   * es decoración: leerlo de nuevo haría que un lector de pantalla repita el nombre dos veces.
   */
  readonly decorativo = input(false);
  /**
   * Ocupa todo el alto que le dé quien lo usa, sin bajar de la proporción 2:3: una imagen
   * más angosta que eso se recorta con object-fit en vez de deformarse. Lo usa el primer puesto
   * de la portada, donde el póster tiene que llegar al borde de la tarjeta.
   */
  readonly llenar = input(false);
}
