import { Component, computed, input, model } from '@angular/core';

/**
 * Selector de hora propio (RNF-08), con dos modos que resuelven los dos casos del sistema:
 *
 * - Con `opciones`: muestra los horarios que existen, como en la compra, donde no se elige
 *   una hora cualquiera sino una de las funciones programadas.
 * - Sin `opciones`: dos cuadrículas, horas y minutos. Las 24 horas entran en 6 × 4 y los
 *   minutos en 3 × 4 con paso de 15, así que no hay nada que scrollear ni rueda que girar.
 */
@Component({
  imports: [],
  selector: 'app-selector-hora',
  styleUrl: './selector-hora.css',
  templateUrl: './selector-hora.html',
})
export class SelectorHora {
  /** Hora elegida como 'HH:MM'. Vacío significa que todavía no se eligió ninguna */
  readonly valor = model('');
  readonly opciones = input<readonly string[] | null>(null);
  /** Minutos entre opción y opción cuando no hay lista fija. 15 deja 4 por hora */
  readonly pasoMinutos = input(15);
  readonly etiqueta = input('Elegí un horario');

  protected readonly horaElegida = computed(() => this.valor().slice(0, 2));
  protected readonly minutoElegido = computed(() => this.valor().slice(3, 5));

  protected readonly horas = computed(() =>
    Array.from({ length: 24 }, (_, hora) => String(hora).padStart(2, '0')),
  );

  protected readonly minutos = computed(() => {
    const paso = Math.max(1, Math.min(30, this.pasoMinutos()));
    const cantidad = Math.floor(60 / paso);

    return Array.from({ length: cantidad }, (_, indice) => String(indice * paso).padStart(2, '0'));
  });

  protected elegirOpcion(hora: string): void {
    this.valor.set(hora);
  }

  /** Al tocar una hora sin haber elegido minutos todavía, se asume en punto */
  protected elegirHora(hora: string): void {
    this.valor.set(`${hora}:${this.minutoElegido() || '00'}`);
  }

  protected elegirMinuto(minuto: string): void {
    this.valor.set(`${this.horaElegida() || '00'}:${minuto}`);
  }
}
