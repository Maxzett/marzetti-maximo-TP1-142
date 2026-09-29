import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { filtrarPeliculas } from '../../core/catalogo/filtrar';
import { horaLocal } from '../../core/funciones/programacion';
import { Genero, Pelicula, Puntaje, VentaPelicula } from '../../core/models/pelicula';
import { Catalogo } from '../../core/services/catalogo';
import { Funciones } from '../../core/services/funciones';
import { Campo } from '../../shared/campo/campo';
import { Chip } from '../../shared/chip/chip';
import { FichaPelicula } from '../../shared/ficha-pelicula/ficha-pelicula';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { SelloEdad } from '../../shared/sello-edad/sello-edad';
import { Spinner } from '../../shared/spinner/spinner';
import { Estrenos } from './estrenos/estrenos';
import { Podio, PuestoDelTop } from './podio/podio';

/** '?genero=accion,drama' → ['accion', 'drama'] */
function leerSlugs(valor: string | undefined): string[] {
  return (valor ?? '').split(',').filter(Boolean);
}

/** Cuántos estrenos entran en la franja: una fila de cuatro en escritorio */
const ESTRENOS_EN_PORTADA = 4;

/**
 * La portada es la cartelera entera, en el orden en que se recorre un cine:
 *
 * 1. Las 3 más vendidas (RF-04), primero como pide el requerimiento.
 * 2. El buscador por nombre (RF-05) y por géneros (RF-06), sobre toda la cartelera.
 * 3. La grilla, con las que destacó el administrador adelante y con su rótulo (RF-07).
 * 4. Los estrenos más cercanos (RF-08), con enlace a Próximamente.
 *
 * Hasta la revisión R1 el buscador vivía aparte, en /peliculas, y la portada mostraba solo las
 * destacadas. Ahora es una sola pantalla y /peliculas redirige acá con sus filtros.
 *
 * Los filtros viven en la URL (/?q=...&genero=accion,drama), así que un filtro se puede
 * compartir y sobrevive a recargar. withComponentInputBinding entrega los parámetros de
 * consulta como input(), sin inyectar ActivatedRoute. La dirección es una sola por vez:
 * la URL manda el estado inicial y los cambios externos (el enlace "Cartelera" del header
 * vuelve a / sin filtros), y cada gesto del usuario escribe la URL de vuelta.
 */
@Component({
  imports: [Campo, Chip, Estrenos, FichaPelicula, Mensaje, Podio, RouterLink, SelloEdad, Spinner],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {
  private readonly catalogo = inject(Catalogo);
  private readonly funciones = inject(Funciones);
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
  private readonly ventas = signal<VentaPelicula[]>([]);
  protected readonly puntajes = signal(new Map<string, Puntaje>());
  /** Si Próximamente no se pudo leer, la portada sigue: esa franja es un extra, no la cartelera */
  protected readonly proximas = signal<Pelicula[]>([]);
  /** Horarios de hoy del top. Null mientras cargan o si fallaron: el podio no afirma nada */
  protected readonly horarios = signal<Map<string, string[]> | null>(null);

  /**
   * El top con la película ya resuelta. Una fila del ranking cuya película no está en la
   * cartelera cargada se descarta (pasa si la base y el navegador no coinciden en qué día
   * es "hoy" cerca de la medianoche): el puesto se numera después de descartar. La cantidad
   * de entradas ordena el ranking pero no sale de acá: no se muestra al público.
   */
  protected readonly top = computed<PuestoDelTop[]>(() => {
    const porId = new Map(this.cartelera().map((pelicula) => [pelicula.id, pelicula]));

    return this.ventas()
      .flatMap((venta) => {
        const pelicula = porId.get(venta.pelicula_id);
        return pelicula ? [pelicula] : [];
      })
      .map((pelicula, indice) => ({ pelicula, puesto: indice + 1 }));
  });

  /**
   * RF-07: las destacadas van primero. sort es estable, así que dentro de cada grupo se
   * conserva el orden en que las devolvió la base.
   */
  private readonly ordenada = computed(() =>
    [...this.cartelera()].sort((a, b) => Number(b.destacada) - Number(a.destacada)),
  );

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
    filtrarPeliculas(this.ordenada(), this.busqueda(), this.seleccionados()),
  );

  protected readonly hayFiltros = computed(
    () => this.busqueda().trim() !== '' || this.seleccionados().length > 0,
  );

  /** Se anuncia en una región viva cada vez que cambia el resultado */
  protected readonly resumen = computed(() => {
    const cantidad = this.resultados().length;
    const total = this.cartelera().length;

    if (cantidad === 0) {
      return 'No hay películas que coincidan.';
    }
    if (!this.hayFiltros()) {
      return cantidad === 1 ? '1 película en cartelera' : `${cantidad} películas en cartelera`;
    }
    return `${cantidad} de ${total} ${total === 1 ? 'película' : 'películas'}`;
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

    // Las consultas no dependen entre sí: van en paralelo y no una detrás de otra
    const [cartelera, ventas, puntajes, proximas] = await Promise.all([
      this.catalogo.cargarCartelera(),
      this.catalogo.masVendidas(3),
      this.catalogo.cargarPuntajes(),
      this.catalogo.cargarProximas(),
    ]);

    if (cartelera === null) {
      this.fallo.set(true);
    } else {
      this.cartelera.set(cartelera);
      this.ventas.set(ventas);
      this.puntajes.set(puntajes);
      this.proximas.set((proximas ?? []).slice(0, ESTRENOS_EN_PORTADA));
    }

    this.cargando.set(false);

    // Los horarios dependen de cuáles quedaron en el top, así que van después. No se esperan:
    // la cartelera ya está en pantalla y el talón se completa cuando llegan.
    void this.cargarHorarios();
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

  private async cargarHorarios(): Promise<void> {
    const funciones = await this.funciones.cargarDeHoy(this.top().map((item) => item.pelicula.id));

    if (funciones === null) {
      return;
    }

    const porPelicula = new Map<string, string[]>();
    for (const funcion of funciones) {
      const horas = porPelicula.get(funcion.pelicula_id) ?? [];
      const hora = horaLocal(funcion.inicio);
      // Dos salas a la misma hora son un solo horario para el que mira la cartelera
      if (!horas.includes(hora)) {
        porPelicula.set(funcion.pelicula_id, [...horas, hora]);
      }
    }
    this.horarios.set(porPelicula);
  }

  /**
   * Refleja el estado en la URL. replaceUrl reemplaza la entrada del historial en lugar de
   * sumar una por tecla: el botón "atrás" vuelve a la pantalla anterior, no al filtro anterior.
   * Un parámetro en null se borra de la URL, así una portada sin filtros queda en / a secas.
   */
  private escribirUrl(): void {
    const texto = this.busqueda().trim();
    const slugs = this.seleccionados().join(',');

    void this.router.navigate(['/'], {
      queryParams: { q: texto || null, genero: slugs || null },
      replaceUrl: true,
    });
  }
}
