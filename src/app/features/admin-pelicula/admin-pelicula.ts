import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { describirEdad } from '../../core/catalogo/edad';
import { estadoDeVenta, esProxima, ventaDesde } from '../../core/catalogo/venta';
import { formatearDuracion } from '../../core/formato/duracion';
import { formatearPrecio, leerImporte } from '../../core/formato/precio';
import { periodoDeCartel } from '../../core/funciones/programacion';
import { Genero, RestriccionEdad } from '../../core/models/pelicula';
import { Gestion } from '../../core/services/gestion';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { CampoFecha } from '../../shared/campo-fecha/campo-fecha';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Poster } from '../../shared/poster/poster';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { formatearDiaYMes, hoyIso } from '../../shared/selector-fecha/fechas';
import { SelloEdad } from '../../shared/sello-edad/sello-edad';
import { Spinner } from '../../shared/spinner/spinner';

const OPCIONES_DE_EDAD: OpcionSeleccion[] = ([0, 13, 18] as const).map((edad) => ({
  valor: String(edad),
  texto: describirEdad(edad).largo,
}));

/**
 * Alta y edición de una película (RF-56, RF-07, RF-49), en una página propia: `/admin/peliculas/nueva`
 * y `/admin/peliculas/:id`. Antes era un diálogo, y un formulario de siete secciones con póster no
 * entraba cómodo en un diálogo. Al costado va la vista previa de cómo se va a ver en la cartelera,
 * que se arma con lo que se está escribiendo.
 *
 * Al guardar ofrece el paso siguiente, "Programar funciones", que abre la programación con esta
 * película y el período de su cartel ya elegidos: cargar una película y no programarla es dejarla
 * fuera de cartelera (en_cartelera, 0028).
 *
 * Las reglas que protegen lo ya programado las pone guardar_pelicula() y esta pantalla muestra su
 * mensaje. El póster se sube recién al guardar: si el administrador se va sin guardar, no queda un
 * archivo huérfano en el bucket. Hasta entonces la vista previa es un `blob:` local.
 */
@Component({
  imports: [Boton, Campo, CampoFecha, Mensaje, Poster, RouterLink, Seleccion, SelloEdad, Spinner],
  selector: 'app-admin-pelicula',
  styleUrls: ['../../layout/admin/pantalla-admin.css', './admin-pelicula.css'],
  templateUrl: './admin-pelicula.html',
})
export class AdminPelicula implements OnDestroy {
  private readonly gestion = inject(Gestion);
  private readonly router = inject(Router);

  /**
   * El `:id` de la ruta, o `nueva` para un alta. Es una sola ruta y no dos a propósito: al
   * guardar un alta la URL pasa de /nueva a /:id y Angular reutiliza este mismo componente, con
   * el aviso de éxito y el paso siguiente todavía en pantalla.
   */
  readonly id = input<string>();

  protected readonly opcionesDeEdad = OPCIONES_DE_EDAD;
  protected readonly hoy = hoyIso();

  protected readonly cargando = signal(true);
  protected readonly noEncontrada = signal(false);
  protected readonly errorDeCarga = signal(false);
  protected readonly generosDisponibles = signal<Genero[]>([]);

  // ── Formulario ──
  /** Null mientras sea un alta; al guardar la primera vez pasa a tener el id nuevo */
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
  /** El título con que se guardó la última vez: el aviso de éxito y el paso siguiente */
  protected readonly guardada = signal('');

  /** Lo que se ve en la vista previa: el archivo nuevo si lo hay, si no el guardado */
  protected readonly posterVisible = computed(() => this.vistaPrevia() ?? this.posterUrl());

  // ── Vista previa ──
  protected readonly edadElegida = computed(() => Number(this.edad()) as RestriccionEdad);

  protected readonly duracionEscrita = computed(() => {
    const minutos = Number(this.duracion());
    return Number.isInteger(minutos) && minutos > 0 ? formatearDuracion(minutos) : '';
  });

  protected readonly nombresDeGeneros = computed(() =>
    this.generosDisponibles()
      .filter((genero) => this.generos().has(genero.id))
      .map((genero) => genero.nombre)
      .join(' · '),
  );

  /** Cómo va a figurar para el público: en cartel, en preventa o próximamente, y desde cuándo */
  protected readonly estadoPrevisto = computed(() => {
    const datos = {
      fecha_estreno: this.estreno() || null,
      precio_preventa: leerImporte(this.preventa().trim()),
    };

    if (!esProxima(datos, this.hoy)) {
      return 'En cartelera mientras tenga funciones programadas.';
    }

    const estreno = formatearDiaYMes(datos.fecha_estreno!);
    const venta = estadoDeVenta(datos, this.hoy);

    if (datos.precio_preventa === null) {
      return `Próximamente. Se estrena el ${estreno} y la venta abre ese día.`;
    }

    const precio = formatearPrecio(datos.precio_preventa);
    return venta.enPreventa
      ? `En preventa a ${precio} hasta el estreno, el ${estreno}.`
      : `Próximamente. Se estrena el ${estreno}; la preventa a ${precio} abre el ${formatearDiaYMes(ventaDesde(datos)!)}.`;
  });

  /** Los query params del paso siguiente: esta película y cuatro semanas desde su estreno */
  protected readonly enlaceAProgramar = computed(() => {
    const periodo = periodoDeCartel(this.estreno() || null, this.hoy);
    return { pelicula: this.peliculaId(), desde: periodo.desde, hasta: periodo.hasta };
  });

  /** El póster con el que se abrió el formulario: se borra del bucket si se reemplaza */
  private posterOriginal: string | null = null;

  constructor() {
    // El id de la ruta decide qué se carga. Si es el de la película que ya está en el
    // formulario (recién creada, la URL pasó de /nueva a /:id), no se vuelve a cargar: se
    // perdería el aviso de que se guardó.
    effect(() => {
      const ruta = this.id();
      const id = !ruta || ruta === 'nueva' ? null : ruta;
      untracked(() => {
        if (id === null || id !== this.peliculaId()) {
          void this.cargar(id);
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.soltarVistaPrevia();
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

    this.guardada.set('');

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

    const resultado = await this.gestion.guardarPelicula({
      id: this.peliculaId(),
      titulo: this.titulo(),
      sinopsis: this.sinopsis(),
      poster_url: poster,
      duracion_minutos: duracion,
      restriccion_edad: this.edadElegida(),
      fecha_estreno: this.estreno() || null,
      destacada: this.destacada(),
      precio_preventa: preventa,
      generos: [...this.generos()],
    });

    if ('error' in resultado) {
      // La película no se guardó: el póster recién subido no lo usa nadie
      if (archivo) {
        await this.gestion.borrarPoster(poster);
      }
      this.error.set(resultado.error);
      this.guardando.set(false);
      return;
    }

    // Guardada con otro póster (o sin ninguno): el anterior ya no lo usa nadie
    if (this.posterOriginal && this.posterOriginal !== poster) {
      await this.gestion.borrarPoster(this.posterOriginal);
    }

    // Lo guardado pasa a ser el punto de partida de la próxima edición
    this.posterOriginal = poster;
    this.posterUrl.set(poster);
    this.archivo.set(null);
    this.soltarVistaPrevia();

    const eraAlta = this.peliculaId() === null;
    this.peliculaId.set(resultado.id);
    this.guardando.set(false);
    this.guardada.set(this.titulo().trim());

    // Un alta pasa a ser una edición: la URL de /nueva a /:id, para que recargar no cree otra
    if (eraAlta) {
      await this.router.navigate(['/admin/peliculas', resultado.id], { replaceUrl: true });
    }
  }

  private soltarVistaPrevia(): void {
    const url = this.vistaPrevia();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.vistaPrevia.set(null);
  }

  private async cargar(id: string | null): Promise<void> {
    this.cargando.set(true);
    this.noEncontrada.set(false);
    this.errorDeCarga.set(false);

    const datos = await this.gestion.cargarPeliculas();

    if (datos === null) {
      this.errorDeCarga.set(true);
      this.cargando.set(false);
      return;
    }

    const pelicula = id === null ? null : (datos.peliculas.find((p) => p.id === id) ?? null);

    if (id !== null && pelicula === null) {
      this.noEncontrada.set(true);
      this.cargando.set(false);
      return;
    }

    this.generosDisponibles.set(datos.generos);
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
    this.guardada.set('');
    this.cargando.set(false);
  }
}
