import { Component, input } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-spinner',
  styleUrl: './spinner.css',
  templateUrl: './spinner.html',
})
export class Spinner {
  /** Lo que anuncia el lector de pantalla: el anillo es decorativo y no dice nada por sí solo */
  readonly etiqueta = input('Cargando');
  readonly tamanio = input<'chico' | 'normal'>('normal');
}
