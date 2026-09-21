import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Pelicula, Puntaje, VentaPelicula } from '../../core/models/pelicula';
import { Catalogo } from '../../core/services/catalogo';
import { FichaPelicula } from '../../shared/ficha-pelicula/ficha-pelicula';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Spinner } from '../../shared/spinner/spinner';

/**
 * Portada: primero las 3 películas más vendidas (RF-04) y después las que el
 * administrador marcó como destacadas (RF-07). El catálogo completo, con buscador y filtro
 * de géneros, está en /peliculas: si el buscador viviera acá solo encontraría lo destacado.
 */
@Component({
  imports: [FichaPelicula, Mensaje, RouterLink, Spinner],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {
  private readonly catalogo = inject(Catalogo);

  protected readonly cargando = signal(true);
  protected readonly fallo = signal(false);

  private readonly cartelera = signal<Pelicula[]>([]);
  private readonly ventas = signal<VentaPelicula[]>([]);
  protected readonly puntajes = signal(new Map<string, Puntaje>());

  /**
   * El top con la película ya resuelta. Una fila del ranking cuya película no está en la
   * cartelera cargada se descarta (pasa si la base y el navegador no coinciden en qué día
   * es "hoy" cerca de la medianoche): el puesto se numera después de descartar.
   */
  protected readonly top = computed(() => {
    const porId = new Map(this.cartelera().map((pelicula) => [pelicula.id, pelicula]));

    return this.ventas()
      .flatMap((venta) => {
        const pelicula = porId.get(venta.pelicula_id);
        return pelicula ? [{ pelicula, entradas: venta.entradas }] : [];
      })
      .map((item, indice) => ({ ...item, puesto: indice + 1 }));
  });

  /** Las destacadas que todavía no aparecieron en el top: la misma película no se muestra dos veces */
  protected readonly destacadas = computed(() => {
    const enElTop = new Set(this.top().map((item) => item.pelicula.id));
    return this.cartelera().filter((pelicula) => pelicula.destacada && !enElTop.has(pelicula.id));
  });

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.fallo.set(false);

    // Las tres consultas no dependen entre sí: van en paralelo y no una detrás de otra
    const [cartelera, ventas, puntajes] = await Promise.all([
      this.catalogo.cargarCartelera(),
      this.catalogo.masVendidas(3),
      this.catalogo.cargarPuntajes(),
    ]);

    if (cartelera === null) {
      this.fallo.set(true);
    } else {
      this.cartelera.set(cartelera);
      this.ventas.set(ventas);
      this.puntajes.set(puntajes);
    }

    this.cargando.set(false);
  }
}
