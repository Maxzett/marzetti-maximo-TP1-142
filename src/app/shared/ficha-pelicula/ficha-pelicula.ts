import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { describirEdad } from '../../core/catalogo/edad';
import { Pelicula, Puntaje } from '../../core/models/pelicula';
import { Estrellas } from '../estrellas/estrellas';
import { Poster } from '../poster/poster';
import { Tarjeta } from '../tarjeta/tarjeta';

/**
 * La ficha de una película en un listado: póster, título, edad, duración, géneros y
 * puntaje. La usan la portada (top 3 y cartelera) y el buscador, así que se ven igual.
 *
 * Toda la tarjeta es clicable, pero el enlace es uno solo y vive en el título: un enlace
 * que envolviera póster, géneros y estrellas haría que un lector de pantalla leyera todo
 * eso como el nombre del enlace. El ::after del título lo estira sobre la tarjeta.
 */
@Component({
  imports: [Estrellas, Poster, RouterLink, Tarjeta],
  selector: 'app-ficha-pelicula',
  styleUrl: './ficha-pelicula.css',
  templateUrl: './ficha-pelicula.html',
})
export class FichaPelicula {
  readonly pelicula = input.required<Pelicula>();
  /** Nulo si la película todavía no tiene reseñas */
  readonly puntaje = input<Puntaje | null>(null);
  /** Entradas vendidas. Solo se muestra si es mayor a cero: no se afirma lo que no pasó */
  readonly entradas = input(0);
  /** Posición en un ranking (1, 2, 3). Nulo en un listado común */
  readonly puesto = input<number | null>(null);

  protected readonly edad = computed(() => describirEdad(this.pelicula().restriccion_edad));
}
