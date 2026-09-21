import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { filtrarPeliculas } from '../../core/catalogo/filtrar';
import { Genero, Pelicula, Puntaje } from '../../core/models/pelicula';
import { Catalogo } from '../../core/services/catalogo';
import { Campo } from '../../shared/campo/campo';
import { Chip } from '../../shared/chip/chip';
import { FichaPelicula } from '../../shared/ficha-pelicula/ficha-pelicula';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Spinner } from '../../shared/spinner/spinner';

/** '?genero=accion,drama' → ['accion', 'drama'] */
function leerSlugs(valor: string | undefined): string[] {
  return (valor ?? '').split(',').filter(Boolean);
}

/**
 * Catálogo completo con buscador por nombre (RF-05) y filtro por género (RF-06). Los dos
 * se combinan, y los géneros entre sí también: la película tiene que tener todos los elegidos.
 *
 * Los filtros viven en la URL (?q=...&genero=accion,drama), así que un filtro se puede
 * compartir y sobrevive a recargar. withComponentInputBinding entrega los parámetros de
 * consulta como input(), sin inyectar ActivatedRoute. La dirección es una sola por vez:
 * la URL manda el estado inicial y los cambios externos (el enlace del header vuelve a
 * /peliculas sin filtros), y cada gesto del usuario escribe la URL de vuelta.
 */
@Component({
  imports: [Campo, Chip, FichaPelicula, Mensaje, Spinner],
  selector: 'app-peliculas',
  styleUrl: './peliculas.css',
  templateUrl: './peliculas.html',
})
export class Peliculas {
  private readonly catalogo = inject(Catalogo);
  private readonly router = inject(Router);

  /** Parámetros de consulta. Son undefined cuando la URL no los trae */
  readonly q = input<string>();
  readonly genero = input<string>();

  /**
   * Estado real de los filtros. No se lee directo de los input(): el texto tiene que
   * responder al tipeo al instante, sin esperar el viaje de ida y vuelta por el router.
   */
  protected readonly busqueda = signal('');
  protected readonly seleccionados = signal<string[]>([]);

  protected readonly cargando = signal(true);
  protected readonly fallo = signal(false);

  private readonly cartelera = signal<Pelicula[]>([]);
  protected readonly puntajes = signal(new Map<string, Puntaje>());

  /**
   * Los géneros que tienen al menos una película en cartelera. Salen de las mismas películas
   * ya cargadas, así no hay una consulta más ni chips que siempre devuelvan cero resultados.
   */
  protected readonly generosDisponibles = computed(() => {
    const porSlug = new Map<string, Genero>();
    for (const pelicula of this.cartelera()) {
      for (const genero of pelicula.generos) {
        porSlug.set(genero.slug, genero);
      }
    }
    return [...porSlug.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  protected readonly resultados = computed(() =>
    filtrarPeliculas(this.cartelera(), this.busqueda(), this.seleccionados()),
  );

  protected readonly hayFiltros = computed(
    () => this.busqueda().trim() !== '' || this.seleccionados().length > 0,
  );

  /** Se anuncia en una región viva cada vez que cambia el resultado */
  protected readonly resumen = computed(() => {
    const cantidad = this.resultados().length;

    if (cantidad === 0) {
      return 'No hay películas que coincidan.';
    }
    return cantidad === 1 ? '1 película' : `${cantidad} películas`;
  });

  constructor() {
    // URL → estado. untracked: el efecto solo tiene que reaccionar a la URL, no al estado
    // que él mismo escribe. Comparar antes de escribir evita pisar lo que el usuario está
    // tipeando con el valor que acaba de volver de la URL.
    effect(() => {
      const texto = this.q() ?? '';
      untracked(() => {
        if (texto !== this.busqueda()) {
          this.busqueda.set(texto);
        }
      });
    });

    effect(() => {
      const slugs = leerSlugs(this.genero());
      untracked(() => {
        if (slugs.join(',') !== this.seleccionados().join(',')) {
          this.seleccionados.set(slugs);
        }
      });
    });

    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.fallo.set(false);

    const [cartelera, puntajes] = await Promise.all([
      this.catalogo.cargarCartelera(),
      this.catalogo.cargarPuntajes(),
    ]);

    if (cartelera === null) {
      this.fallo.set(true);
    } else {
      this.cartelera.set(cartelera);
      this.puntajes.set(puntajes);
    }

    this.cargando.set(false);
  }

  protected alBuscar(texto: string): void {
    this.busqueda.set(texto);
    this.escribirUrl();
  }

  protected alternarGenero(slug: string, activo: boolean): void {
    this.seleccionados.update((lista) =>
      activo ? [...lista.filter((s) => s !== slug), slug] : lista.filter((s) => s !== slug),
    );
    this.escribirUrl();
  }

  protected limpiar(): void {
    this.busqueda.set('');
    this.seleccionados.set([]);
    this.escribirUrl();
  }

  /**
   * Refleja el estado en la URL. replaceUrl reemplaza la entrada del historial en lugar de
   * sumar una por tecla: el botón "atrás" vuelve a la pantalla anterior, no al filtro anterior.
   * Un parámetro en null se borra de la URL, así una pantalla sin filtros queda en /peliculas.
   */
  private escribirUrl(): void {
    const texto = this.busqueda().trim();
    const slugs = this.seleccionados().join(',');

    void this.router.navigate(['/peliculas'], {
      queryParams: { q: texto || null, genero: slugs || null },
      replaceUrl: true,
    });
  }
}
