import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

const ESTRELLAS = [1, 2, 3, 4, 5] as const;

/** Coma decimal y un decimal fijo: "4,5" y "4,0", como se escribe en castellano */
const FORMATO = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Estrellas de calificación (RF-09, RF-11), con dos modos:
 *
 * - Lectura: muestra un promedio, con decimales (4,5 de 5) y la cantidad de reseñas. Es una
 *   imagen para el lector de pantalla, con el número dicho en palabras.
 * - Edición (`editable`): las elige el usuario. Es un radiogroup y no cinco botones de dos
 *   estados: de las cinco se elige exactamente una, y con aria-pressed un lector de pantalla
 *   leería "estrella 3, presionado" sin decir que las demás son alternativas. Trae además el
 *   teclado del patrón, igual que selector-hora: una sola parada de Tab y las flechas
 *   mueven y eligen a la vez.
 *
 * La estrella llena se distingue de la vacía por el relleno y no solo por el color (RNF-10), y
 * el número va siempre escrito al lado.
 */
@Component({
  imports: [NgTemplateOutlet],
  selector: 'app-estrellas',
  styleUrl: './estrellas.css',
  templateUrl: './estrellas.html',
})
export class Estrellas {
  /** En lectura, el promedio (admite decimales). En edición, la elegida: 0 es ninguna */
  readonly valor = model(0);
  /** Solo en lectura: cuántas reseñas hay detrás del promedio. Cero muestra "Sin reseñas" */
  readonly cantidad = input<number | null>(null);
  readonly editable = input(false);
  /** Solo en edición: cómo se llama el grupo para el lector de pantalla */
  readonly etiqueta = input('Tu calificación');

  protected readonly posiciones = ESTRELLAS;

  /** Cuánto de la fila llena se ve: 4,5 de 5 son 90 % del ancho, y la media estrella queda a la vista */
  protected readonly porcentaje = computed(
    () => (Math.max(0, Math.min(5, this.valor())) / ESTRELLAS.length) * 100,
  );

  protected readonly valorTexto = computed(() => FORMATO.format(this.valor()));

  protected readonly descripcion = computed(() => {
    const cantidad = this.cantidad();
    const base = `Puntaje ${this.valorTexto()} de 5`;

    if (cantidad === null) {
      return base;
    }

    return `${base}, ${cantidad} ${cantidad === 1 ? 'reseña' : 'reseñas'}`;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Se incrementa en cada movimiento con teclado, para devolver el foco después de redibujar */
  private readonly pedidoDeFoco = signal(0);
  private aEnfocar = 1;

  constructor() {
    // Elegir con las flechas cambia el tabindex de lugar: el foco se mueve después de redibujar
    afterRenderEffect(() => {
      if (this.pedidoDeFoco() === 0) {
        return;
      }

      this.host.nativeElement
        .querySelector<HTMLButtonElement>(`[data-valor="${this.aEnfocar}"]`)
        ?.focus();
    });
  }

  protected elegir(estrellas: number): void {
    this.valor.set(estrellas);
  }

  /**
   * Las flechas mueven y eligen en el mismo gesto, y el recorrido da la vuelta en los bordes,
   * como un radiogroup nativo. Parte de la estrella que tiene el foco y no de la elegida:
   * con nada elegido todavía, el foco está en la primera, y la flecha derecha tiene que ir
   * a la segunda.
   */
  protected alTeclear(evento: KeyboardEvent): void {
    const enfocada = (evento.target as HTMLElement).closest<HTMLElement>('[data-valor]');
    const actual = Number(enfocada?.dataset['valor'] ?? this.valor()) || 1;
    const total = ESTRELLAS.length;

    let destino: number;
    switch (evento.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        destino = (actual % total) + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        destino = ((actual - 2 + total) % total) + 1;
        break;
      case 'Home':
        destino = 1;
        break;
      case 'End':
        destino = total;
        break;
      default:
        return;
    }

    // Sin esto las flechas además scrollean la página por debajo
    evento.preventDefault();
    this.elegir(destino);
    this.aEnfocar = destino;
    this.pedidoDeFoco.update((numero) => numero + 1);
  }
}
