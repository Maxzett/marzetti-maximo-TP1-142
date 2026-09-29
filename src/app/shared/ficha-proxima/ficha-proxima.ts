import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { estadoDeVenta } from '../../core/catalogo/venta';
import { formatearPrecio } from '../../core/formato/precio';
import { Pelicula } from '../../core/models/pelicula';
import { formatearDiaYMes, hoyIso } from '../selector-fecha/fechas';
import { Poster } from '../poster/poster';
import { SelloEdad } from '../sello-edad/sello-edad';
import { Tarjeta } from '../tarjeta/tarjeta';

/**
 * La ficha de una película de Próximamente (RF-08): en vez de puntaje y ventas, que todavía no
 * tiene, dice cuándo se estrena y cuándo sale a la venta, con el precio de preventa si lo hay
 * (RF-49). El estado de la venta es texto, no un color: "En preventa", "A la venta desde…".
 *
 * Mismo criterio de enlace que ficha-pelicula: uno solo, en el título, estirado sobre la
 * tarjeta. Lo que se proyecta adentro (el botón de alerta) queda por encima del enlace.
 */
@Component({
  imports: [Poster, RouterLink, SelloEdad, Tarjeta],
  selector: 'app-ficha-proxima',
  styleUrl: './ficha-proxima.css',
  templateUrl: './ficha-proxima.html',
})
export class FichaProxima {
  readonly pelicula = input.required<Pelicula>();
  /** 'AAAA-MM-DD'. Es input para que un test o el catálogo vivo puedan fijar el día */
  readonly hoy = input(hoyIso());

  protected readonly venta = computed(() => estadoDeVenta(this.pelicula(), this.hoy()));

  protected readonly estreno = computed(() => {
    const fecha = this.pelicula().fecha_estreno;
    return fecha ? formatearDiaYMes(fecha) : '';
  });

  protected readonly preventa = computed(() => {
    const precio = this.pelicula().precio_preventa;
    return precio === null ? '' : formatearPrecio(precio);
  });

  protected readonly estadoDeVenta = computed(() => {
    const { aLaVenta, desde, enPreventa } = this.venta();

    if (enPreventa) {
      return `En preventa · ${this.preventa()}`;
    }
    if (aLaVenta) {
      return 'Entradas a la venta';
    }
    if (desde && this.pelicula().precio_preventa !== null) {
      return `Preventa desde el ${formatearDiaYMes(desde)} · ${this.preventa()}`;
    }
    return 'A la venta desde el estreno';
  });
}
