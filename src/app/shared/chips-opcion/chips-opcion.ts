import {
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { destinoEnRadiogroup } from '../radiogroup-lineal';

let contador = 0;

export interface OpcionChip {
  valor: string;
  etiqueta: string;
}

/**
 * Chips de elección única (RNF-08): reemplaza al calendario y a la rueda de horario donde
 * las opciones son una lista fija y corta, como el día o el horario de una función.
 *
 * Es un radiogroup, no una fila de botones de dos estados: de todas las opciones se elige
 * exactamente una. El grupo entero es una sola parada de Tab; adentro las flechas mueven
 * y eligen en el mismo gesto, con vuelta en los bordes (WAI-ARIA).
 */
@Component({
  imports: [],
  selector: 'app-chips-opcion',
  styleUrl: './chips-opcion.css',
  templateUrl: './chips-opcion.html',
})
export class ChipsOpcion {
  readonly opciones = input.required<readonly OpcionChip[]>();
  readonly valor = model('');
  /** Se ve arriba de los chips, como la etiqueta de un campo, y nombra al grupo */
  readonly etiqueta = input.required<string>();

  protected readonly idEtiqueta = `chips-opcion-${++contador}`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Se incrementa en cada movimiento con teclado, para devolver el foco después de redibujar */
  private readonly pedidoDeFoco = signal(0);
  private aEnfocar = '';

  constructor() {
    afterRenderEffect(() => {
      if (this.pedidoDeFoco() === 0) {
        return;
      }

      this.host.nativeElement.querySelector<HTMLButtonElement>(this.aEnfocar)?.focus();
    });
  }

  protected elegir(valor: string): void {
    this.valor.set(valor);
  }

  protected alTeclear(evento: KeyboardEvent): void {
    const lista = this.opciones().map((opcion) => opcion.valor);
    const destino = destinoEnRadiogroup(evento, lista, this.valor(), 1);

    if (destino !== null) {
      // Sin esto las flechas además scrollean la página por debajo del grupo
      evento.preventDefault();
      this.elegir(destino);
      this.pedirFoco(destino);
    }
  }

  private pedirFoco(valor: string): void {
    this.aEnfocar = `[data-valor="${valor}"]`;
    this.pedidoDeFoco.update((numero) => numero + 1);
  }
}
