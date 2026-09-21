import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { describirEdad } from '../../core/catalogo/edad';
import { LARGO_MAXIMO_COMENTARIO, Pelicula, Puntaje, Resena } from '../../core/models/pelicula';
import { Auth } from '../../core/services/auth';
import { Catalogo } from '../../core/services/catalogo';
import { Resenas } from '../../core/services/resenas';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Estrellas } from '../../shared/estrellas/estrellas';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Poster } from '../../shared/poster/poster';
import { Spinner } from '../../shared/spinner/spinner';
import { Tarjeta } from '../../shared/tarjeta/tarjeta';

/**
 * Ficha de una película: datos, puntaje promedio (RF-11) y reseñas (RF-09). Las reseñas se
 * ven antes de comprar y sin cuenta (RF-10); dejar una exige haber iniciado sesión.
 *
 * El id llega como input() desde la ruta gracias a withComponentInputBinding.
 */
@Component({
  imports: [Boton, Campo, Dialogo, Estrellas, Mensaje, Poster, RouterLink, Spinner, Tarjeta],
  selector: 'app-pelicula-detalle',
  styleUrl: './pelicula-detalle.css',
  templateUrl: './pelicula-detalle.html',
})
export class PeliculaDetalle {
  private readonly catalogo = inject(Catalogo);
  private readonly servicioResenas = inject(Resenas);
  private readonly auth = inject(Auth);
  private readonly titulo = inject(Title);

  readonly id = input.required<string>();

  protected readonly haySesion = this.auth.haySesion;
  protected readonly largoMaximo = LARGO_MAXIMO_COMENTARIO;

  protected readonly cargando = signal(true);
  protected readonly pelicula = signal<Pelicula | null>(null);
  protected readonly puntaje = signal<Puntaje | null>(null);
  /** Null si la lista no se pudo leer: es distinto de una película que todavía no tiene reseñas */
  protected readonly resenas = signal<Resena[] | null>(null);

  protected readonly edad = computed(() => {
    const pelicula = this.pelicula();
    return pelicula ? describirEdad(pelicula.restriccion_edad) : null;
  });

  /** La reseña del que mira la pantalla, si ya dejó una. La marca es_propia la pone la base */
  protected readonly miResena = computed(
    () => this.resenas()?.find((resena) => resena.es_propia) ?? null,
  );

  // ── Formulario de reseña ──
  protected readonly estrellas = signal(0);
  protected readonly comentario = signal('');
  protected readonly editando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorDelFormulario = signal('');
  protected readonly avisoDeExito = signal('');
  protected readonly confirmandoBorrado = signal(false);

  /** Con sesión, el formulario aparece si todavía no reseñó o si eligió corregir la suya */
  protected readonly mostrarFormulario = computed(
    () => this.haySesion() && (this.miResena() === null || this.editando()),
  );

  constructor() {
    // Al cambiar el id (de una película a otra sin salir de la ruta) se carga la nueva.
    // untracked: cargar() lee y escribe muchas señales, y no tienen que re-disparar el efecto.
    effect(() => {
      const id = this.id();
      untracked(() => void this.cargar(id));
    });
  }

  protected fechaDe(iso: string): string {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected editar(): void {
    const propia = this.miResena();
    if (!propia) {
      return;
    }

    this.estrellas.set(propia.estrellas);
    this.comentario.set(propia.comentario);
    this.errorDelFormulario.set('');
    this.avisoDeExito.set('');
    this.editando.set(true);
  }

  protected cancelarEdicion(): void {
    this.editando.set(false);
    this.errorDelFormulario.set('');
  }

  protected async guardar(evento: Event): Promise<void> {
    evento.preventDefault();
    const pelicula = this.pelicula();
    if (!pelicula || this.guardando()) {
      return;
    }

    this.guardando.set(true);
    this.errorDelFormulario.set('');
    this.avisoDeExito.set('');

    const error = await this.servicioResenas.guardar(
      pelicula.id,
      { estrellas: this.estrellas(), comentario: this.comentario() },
      this.miResena()?.id ?? null,
    );

    if (error) {
      this.errorDelFormulario.set(error);
    } else {
      this.editando.set(false);
      this.estrellas.set(0);
      this.comentario.set('');
      this.avisoDeExito.set('Guardamos tu reseña.');
      await this.recargarResenas(pelicula.id);
    }

    this.guardando.set(false);
  }

  protected async borrar(): Promise<void> {
    const propia = this.miResena();
    const pelicula = this.pelicula();
    if (!propia || !pelicula) {
      return;
    }

    this.guardando.set(true);
    const error = await this.servicioResenas.borrar(propia.id);
    this.confirmandoBorrado.set(false);

    if (error) {
      this.errorDelFormulario.set(error);
    } else {
      this.errorDelFormulario.set('');
      this.avisoDeExito.set('Borramos tu reseña.');
      await this.recargarResenas(pelicula.id);
    }

    this.guardando.set(false);
  }

  private async cargar(id: string): Promise<void> {
    this.cargando.set(true);
    this.pelicula.set(null);
    this.resenas.set(null);
    this.puntaje.set(null);
    this.editando.set(false);
    this.avisoDeExito.set('');
    this.errorDelFormulario.set('');

    const pelicula = await this.catalogo.cargarPelicula(id);

    // Si mientras tanto se pidió otra película, esta respuesta ya no es la que se quiere ver
    if (id !== this.id()) {
      return;
    }

    this.pelicula.set(pelicula);

    if (pelicula) {
      // El título de la pestaña lo escribe el router al navegar, con el nombre genérico de
      // la ruta; acá se pisa con el de la película, que es lo que distingue una pestaña de otra
      this.titulo.setTitle(`${pelicula.titulo} · Cine Emezeta`);
      await this.recargarResenas(pelicula.id);
    }

    this.cargando.set(false);
  }

  /**
   * Trae las reseñas y el promedio juntos. El promedio sale de la base y no se calcula acá:
   * es el mismo número que muestran las tarjetas del catálogo, y dos cuentas hechas en dos
   * lugares terminarían redondeando distinto.
   */
  private async recargarResenas(peliculaId: string): Promise<void> {
    const [resenas, puntajes] = await Promise.all([
      this.servicioResenas.deLaPelicula(peliculaId),
      this.catalogo.cargarPuntajes(),
    ]);

    this.resenas.set(resenas);
    this.puntaje.set(puntajes.get(peliculaId) ?? null);
  }
}
