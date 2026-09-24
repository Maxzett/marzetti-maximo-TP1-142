import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/** Segundos que quedan hasta `expiraAt`, sin bajar de cero. Null si la fecha no es válida */
export function segundosRestantes(expiraAt: string, ahora: number): number | null {
  const fin = Date.parse(expiraAt);
  return Number.isNaN(fin) ? null : Math.max(0, Math.ceil((fin - ahora) / 1000));
}

/** 9:05, o 0:42: los minutos sin cero adelante y los segundos siempre con dos cifras */
export function formatearCuenta(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${String(segundos % 60).padStart(2, '0')}`;
}

/**
 * Cuenta regresiva de la reserva de butacas (D-08).
 *
 * El plazo lo fija la base (`expira_at`) y este componente solo lo muestra: si se vence, avisa
 * con `vencido` y quien lo usa decide qué hacer, porque la que libera las butacas de verdad es
 * la base. Compara contra el reloj del navegador, así que un reloj desfasado la adelanta o la
 * atrasa unos segundos; por eso no es la autoridad y al pagar la base vuelve a comprobar.
 *
 * El anuncio para lector de pantalla es aparte del número: leer cada segundo sería ruido. Se
 * avisa una vez cuando queda un minuto y una vez al vencer.
 */
@Component({
  imports: [],
  selector: 'app-temporizador',
  styleUrl: './temporizador.css',
  templateUrl: './temporizador.html',
})
export class Temporizador {
  /** Instante de vencimiento, ISO 8601 */
  readonly expiraAt = input.required<string>();
  readonly vencido = output<void>();

  private readonly ahora = signal(Date.now());

  protected readonly restantes = computed(() => segundosRestantes(this.expiraAt(), this.ahora()));
  protected readonly texto = computed(() => formatearCuenta(this.restantes() ?? 0));
  protected readonly urgente = computed(() => (this.restantes() ?? 0) <= 60);

  protected readonly anuncio = computed(() => {
    const restantes = this.restantes();

    if (restantes === null) {
      return '';
    }

    if (restantes === 0) {
      return 'La reserva venció.';
    }

    return restantes <= 60 ? 'Queda un minuto de reserva.' : '';
  });

  constructor() {
    const intervalo = setInterval(() => this.ahora.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(intervalo));

    // Una sola vez por vencimiento: un `effect` que emitiera en cada tick repetiría el aviso
    let avisado = false;

    effect(() => {
      const vencida = this.restantes() === 0;

      if (vencida && !avisado) {
        avisado = true;
        this.vencido.emit();
      } else if (!vencida) {
        avisado = false;
      }
    });
  }
}
