import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { describirInicio } from '../../core/funciones/programacion';
import { PeliculaVista } from '../../core/models/pelicula';
import { Cuenta } from '../../core/services/cuenta';
import { Estrellas } from '../../shared/estrellas/estrellas';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Poster } from '../../shared/poster/poster';
import { Spinner } from '../../shared/spinner/spinner';

/**
 * Mis Películas (RF-41): el historial visual de lo que la persona vio, con póster, fecha y su
 * propia calificación.
 *
 * "Vio" quiere decir que un empleado validó su ingreso (RN-05), no que compró: una entrada que no
 * se usó, o una compra cancelada, no es haber visto la película. Lo resuelve mis_peliculas() en la
 * base, porque las órdenes no se leen por tabla. Si todavía no la calificó, la tarjeta invita a
 * hacerlo en la ficha, donde viven las reseñas (RF-09).
 */
@Component({
  imports: [Estrellas, Mensaje, Poster, RouterLink, Spinner],
  selector: 'app-mis-peliculas',
  styleUrl: './mis-peliculas.css',
  templateUrl: './mis-peliculas.html',
})
export class MisPeliculas {
  private readonly cuenta = inject(Cuenta);

  protected readonly cargando = signal(true);
  /** Null si la lectura falló: es distinto de no haber visto nada todavía */
  protected readonly vistas = signal<PeliculaVista[] | null>(null);
  protected readonly describirInicio = describirInicio;

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.vistas.set(await this.cuenta.misPeliculas());
    this.cargando.set(false);
  }
}
