import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { describirEdad } from '../../core/catalogo/edad';
import { estadoDeVenta, esProxima } from '../../core/catalogo/venta';
import { formatearPrecio, leerImporte } from '../../core/formato/precio';
import { PeliculasGestionadas } from '../../core/models/gestion';
import { Pelicula, RestriccionEdad } from '../../core/models/pelicula';
import { Gestion } from '../../core/services/gestion';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { CampoFecha } from '../../shared/campo-fecha/campo-fecha';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Poster } from '../../shared/poster/poster';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { formatearDiaYMes, hoyIso } from '../../shared/selector-fecha/fechas';
import { Spinner } from '../../shared/spinner/spinner';

const OPCIONES_DE_EDAD: OpcionSeleccion[] = ([0, 13, 18] as const).map((edad) => ({
  valor: String(edad),
  texto: describirEdad(edad).largo,
}));

/**
 * Alta y edición de películas (RF-56, RF-07, RF-49), con el póster en Supabase Storage (RNF-02).
 *
 * No hay baja: las funciones y las órdenes referencian la película. Las reglas que protegen lo ya
 * programado las pone guardar_pelicula() y esta pantalla muestra su mensaje: no se cambia la
 * duración de una película con funciones por delante (su ocupación de sala ya se calculó) ni se
 * mueve el estreno después de una función.
 *
 * El póster se sube recién al guardar, no al elegirlo: si el admin se arrepiente y cierra el
 * diálogo, no queda un archivo huérfano en el bucket. Hasta entonces la vista previa es un
 * `blob:` local.
 */
@Component({
  imports: [Boton, Campo, CampoFecha, Dialogo, Mensaje, Poster, Seleccion, Spinner],
  selector: 'app-admin-peliculas',
  styleUrls: ['../../layout/admin/pantalla-admin.css', './admin-peliculas.css'],
  templateUrl: './admin-peliculas.html',
})
export class AdminPeliculas implements OnDestroy {
  private readonly gestion = inject(Gestion);

  protected readonly opcionesDeEdad = OPCIONES_DE_EDAD;
  protected readonly precio = formatearPrecio;

  protected readonly cargando = signal(true);
  protected readonly datos = signal<PeliculasGestionadas | null>(null);
  protected readonly aviso = signal('');

  // ── Formulario ──
  protected readonly abierto = signal(false);
  protected readonly peliculaId = signal<string | null>(null);
  protected readonly titulo = signal('');
  protected readonly sinopsis = signal('');
  protected readonly duracion = signal('');
  protected readonly edad = signal('0');
  protected readonly estreno = signal('');
  protected readonly preventa = signal('');
  protected readonly destacada = signal(false);
  protected readonly generos = signal<ReadonlySet<string>>(new Set());
  /** La URL guardada del póster; null si no tiene o si se pidió quitarlo */
  protected readonly posterUrl = signal<string | null>(null);
  /** El archivo elegido y todavía no subido */
  protected readonly archivo = signal<File | null>(null);
  protected readonly vistaPrevia = signal<string | null>(null);

  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  /** Lo que se ve en la vista previa: el archivo nuevo si lo hay, si no el guardado */
  protected readonly posterVisible = computed(() => this.vistaPrevia() ?? this.posterUrl());

  /** El póster con el que se abrió el formulario: se borra del bucket si se reemplaza */
  private posterOriginal: string | null = null;

  constructor() {
    void this.cargar();
  }

  ngOnDestroy(): void {
    this.soltarVistaPrevia();
  }

  /** "En cartelera", "En preventa", "Próximamente": dicho con palabras en la tabla */
  protected estadoDe(pelicula: Pelicula): string {
    const hoy = hoyIso();

    if (!esProxima(pelicula, hoy)) {
      return 'En cartelera';
    }
    return estadoDeVenta(pelicula, hoy).enPreventa ? 'En preventa' : 'Próximamente';
  }

  protected estrenoDe(pelicula: Pelicula): string {
    return pelicula.fecha_estreno ? formatearDiaYMes(pelicula.fecha_estreno) : 'Sin fecha';
  }

  protected abrir(pelicula: Pelicula | null): void {
    this.soltarVistaPrevia();
    this.peliculaId.set(pelicula?.id ?? null);
    this.titulo.set(pelicula?.titulo ?? '');
    this.sinopsis.set(pelicula?.sinopsis ?? '');
    this.duracion.set(pelicula ? String(pelicula.duracion_minutos) : '');
    this.edad.set(String(pelicula?.restriccion_edad ?? 0));
    this.estreno.set(pelicula?.fecha_estreno ?? '');
    this.preventa.set(pelicula?.precio_preventa != null ? String(pelicula.precio_preventa) : '');
    this.destacada.set(pelicula?.destacada ?? false);
    this.generos.set(new Set(pelicula?.generos.map((g) => g.id) ?? []));
    this.posterUrl.set(pelicula?.poster_url ?? null);
    this.posterOriginal = pelicula?.poster_url ?? null;
    this.archivo.set(null);
    this.error.set('');
    this.aviso.set('');
    this.abierto.set(true);
  }

  protected alternarGenero(id: string, evento: Event): void {
    const marcado = (evento.target as HTMLInputElement).checked;
    this.generos.update((actual) => {
      const nuevo = new Set(actual);
      if (marcado) {
        nuevo.add(id);
      } else {
        nuevo.delete(id);
      }
      return nuevo;
    });
  }

  protected casilla(evento: Event): boolean {
    return (evento.target as HTMLInputElement).checked;
  }

  protected elegirArchivo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0] ?? null;

    this.soltarVistaPrevia();
    this.archivo.set(archivo);
    this.vistaPrevia.set(archivo ? URL.createObjectURL(archivo) : null);
  }

  protected quitarPoster(): void {
    this.soltarVistaPrevia();
    this.archivo.set(null);
    this.posterUrl.set(null);
  }

  protected async guardar(): Promise<void> {
    const duracion = Number(this.duracion());
    // Vacío es "sin preventa"; escrito, tiene que ser un importe
    const textoPreventa = this.preventa().trim();
    const preventa = textoPreventa === '' ? null : leerImporte(textoPreventa);

    if (!this.titulo().trim()) {
      this.error.set('Escribí el título de la película.');
      return;
    }
    if (!Number.isInteger(duracion) || duracion < 1 || duracion > 600) {
      this.error.set('La duración es un número entero de minutos, de 1 a 600.');
      return;
    }
    if (textoPreventa !== '' && preventa === null) {
      this.error.set('El precio de preventa es un importe en pesos, o dejalo vacío si no tiene.');
      return;
    }
    if (preventa !== null && !this.estreno()) {
      this.error.set('Para tener preventa, la película necesita fecha de estreno.');
      return;
    }
    if (this.generos().size === 0) {
      this.error.set('Elegí al menos un género.');
      return;
    }

    this.guardando.set(true);
    this.error.set('');

    // Primero el archivo: guardar_pelicula recibe la URL ya pública
    let poster = this.posterUrl();
    const archivo = this.archivo();
    if (archivo) {
      const subida = await this.gestion.subirPoster(archivo);
      if ('error' in subida) {
        this.error.set(subida.error);
        this.guardando.set(false);
        return;
      }
      poster = subida.url;
    }

    const error = await this.gestion.guardarPelicula({
      id: this.peliculaId(),
      titulo: this.titulo(),
      sinopsis: this.sinopsis(),
      poster_url: poster,
      duracion_minutos: duracion,
      restriccion_edad: Number(this.edad()) as RestriccionEdad,
      fecha_estreno: this.estreno() || null,
      destacada: this.destacada(),
      precio_preventa: preventa,
      generos: [...this.generos()],
    });

    if (error) {
      // La película no se guardó: el póster recién subido no lo usa nadie
      if (archivo) {
        await this.gestion.borrarPoster(poster);
      }
      this.error.set(error);
      this.guardando.set(false);
      return;
    }

    // Guardada con otro póster (o sin ninguno): el anterior ya no lo usa nadie
    if (this.posterOriginal && this.posterOriginal !== poster) {
      await this.gestion.borrarPoster(this.posterOriginal);
    }

    this.guardando.set(false);
    this.abierto.set(false);
    this.soltarVistaPrevia();
    await this.cargar();
    this.aviso.set(`Guardamos ${this.titulo().trim()}.`);
  }

  private soltarVistaPrevia(): void {
    const url = this.vistaPrevia();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.vistaPrevia.set(null);
  }

  private async cargar(): Promise<void> {
    this.datos.set(await this.gestion.cargarPeliculas());
    this.cargando.set(false);
  }
}
