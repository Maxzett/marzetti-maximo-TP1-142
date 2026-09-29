import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatearDuracion } from '../../core/formato/duracion';
import { Pelicula, Puntaje } from '../../core/models/pelicula';
import { Estrellas } from '../estrellas/estrellas';
import { Poster } from '../poster/poster';
import { SelloEdad } from '../sello-edad/sello-edad';

/**
 * La ficha de una película en la grilla de la cartelera: póster, título, géneros con la
 * duración, sello de edad y puntaje. Sin marco de tarjeta: el póster es el que tiene peso,
 * como en la marquesina de un cine.
 *
 * Toda la ficha es clicable, pero el enlace es uno solo y vive en el título: un enlace
 * que envolviera póster, géneros y estrellas haría que un lector de pantalla leyera todo
 * eso como el nombre del enlace. El ::after del título lo estira sobre la ficha.
 */
@Component({
  imports: [Estrellas, Poster, RouterLink, SelloEdad],
  selector: 'app-ficha-pelicula',
  styleUrl: './ficha-pelicula.css',
  templateUrl: './ficha-pelicula.html',
})
export class FichaPelicula {
  readonly pelicula = input.required<Pelicula>();
  /** Nulo si la película todavía no tiene reseñas */
  readonly puntaje = input<Puntaje | null>(null);

  /** "Drama · Suspenso · 1 h 52 min" */
  protected readonly datos = computed(() => {
    const { generos, duracion_minutos } = this.pelicula();
    return [...generos.map((genero) => genero.nombre), formatearDuracion(duracion_minutos)].join(
      ' · ',
    );
  });
}
