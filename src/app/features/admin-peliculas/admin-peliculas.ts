import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { estadoDeVenta, esProxima } from '../../core/catalogo/venta';
import { formatearPrecio } from '../../core/formato/precio';
import { periodoDeCartel } from '../../core/funciones/programacion';
import { PeliculasGestionadas } from '../../core/models/gestion';
import { Pelicula } from '../../core/models/pelicula';
import { Gestion } from '../../core/services/gestion';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { formatearDiaYMes, hoyIso } from '../../shared/selector-fecha/fechas';
import { Spinner } from '../../shared/spinner/spinner';

/**
 * El catálogo de películas del panel (RF-56). El alta y la edición viven en su propia página
 * (`admin-pelicula`); desde acá se llega a esa página y a programar las funciones de cada una.
 *
 * No hay baja: las funciones y las órdenes referencian la película. Una película sale de
 * cartelera sola cuando pasa su última función (en_cartelera, 0028).
 */
@Component({
  imports: [Mensaje, RouterLink, Spinner],
  selector: 'app-admin-peliculas',
  styleUrls: ['../../layout/admin/pantalla-admin.css', './admin-peliculas.css'],
  templateUrl: './admin-peliculas.html',
})
export class AdminPeliculas {
  private readonly gestion = inject(Gestion);

  protected readonly precio = formatearPrecio;
  private readonly hoy = hoyIso();

  protected readonly cargando = signal(true);
  protected readonly datos = signal<PeliculasGestionadas | null>(null);

  constructor() {
    void this.cargar();
  }

  /**
   * Dicho con palabras en la tabla. "Sin funciones" es una película estrenada a la que no le
   * queda ninguna función por delante: ya salió de cartel, o se cargó y falta programarla.
   */
  protected estadoDe(pelicula: Pelicula): string {
    if (esProxima(pelicula, this.hoy)) {
      return estadoDeVenta(pelicula, this.hoy).enPreventa ? 'En preventa' : 'Próximamente';
    }
    return pelicula.en_cartelera ? 'En cartelera' : 'Sin funciones';
  }

  protected estrenoDe(pelicula: Pelicula): string {
    return pelicula.fecha_estreno ? formatearDiaYMes(pelicula.fecha_estreno) : 'Sin fecha';
  }

  /** La programación con esta película y cuatro semanas desde su estreno (o desde hoy) */
  protected enlaceAProgramar(pelicula: Pelicula): Record<string, string> {
    const periodo = periodoDeCartel(pelicula.fecha_estreno, this.hoy);
    return { pelicula: pelicula.id, desde: periodo.desde, hasta: periodo.hasta };
  }

  private async cargar(): Promise<void> {
    this.datos.set(await this.gestion.cargarPeliculas());
    this.cargando.set(false);
  }
}
