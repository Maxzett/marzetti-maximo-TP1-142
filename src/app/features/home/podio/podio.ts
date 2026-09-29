import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatearDuracion } from '../../../core/formato/duracion';
import { Pelicula, Puntaje } from '../../../core/models/pelicula';
import { Estrellas } from '../../../shared/estrellas/estrellas';
import { Poster } from '../../../shared/poster/poster';
import { SelloEdad } from '../../../shared/sello-edad/sello-edad';

export interface PuestoDelTop {
  pelicula: Pelicula;
  /** 1, 2 o 3, ya renumerado por la portada */
  puesto: number;
}

/**
 * Las 3 más vendidas (RF-04). El primer puesto es una entrada de cine troquelada: el cuerpo
 * con la película y un talón con las funciones que le quedan hoy. El segundo y el tercero van
 * al lado, más chicos. Es una lista ordenada: el puesto es parte del contenido, no decoración.
 *
 * Las ventas ordenan el podio pero no se muestran: la cantidad de entradas es un dato interno
 * del cine, no algo que el público tenga que leer.
 *
 * Un solo enlace por puesto, en el título, estirado sobre la tarjeta (mismo criterio que
 * ficha-pelicula). El "Comprar" del talón es la señal visual de que la tarjeta entera lleva a
 * comprar: está oculto para el lector de pantalla, que si no escucharía dos enlaces al mismo lugar.
 */
@Component({
  imports: [Estrellas, Poster, RouterLink, SelloEdad],
  selector: 'app-podio',
  styleUrl: './podio.css',
  templateUrl: './podio.html',
})
export class Podio {
  readonly items = input.required<readonly PuestoDelTop[]>();
  readonly puntajes = input(new Map<string, Puntaje>());
  /**
   * Horarios de hoy por película ('HH:MM'). Null mientras cargan o si no se pudieron leer:
   * en ese caso el talón manda a la ficha en vez de afirmar que no hay funciones.
   */
  readonly horarios = input<ReadonlyMap<string, readonly string[]> | null>(null);

  protected datos(pelicula: Pelicula): string {
    return [
      ...pelicula.generos.map((genero) => genero.nombre),
      formatearDuracion(pelicula.duracion_minutos),
    ].join(' · ');
  }

  protected horasDe(pelicula: Pelicula): readonly string[] | null {
    const horarios = this.horarios();
    return horarios === null ? null : (horarios.get(pelicula.id) ?? []);
  }
}
