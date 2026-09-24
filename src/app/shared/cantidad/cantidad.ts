import { Component, computed, input, model } from '@angular/core';

/**
 * Cuántas unidades de algo: un botón para restar, el número y un botón para sumar.
 *
 * Es un par de botones con un número entre medio y no un `<input type="number">`: el campo
 * numérico nativo trae flechas diminutas, deja tipear "e" o un negativo y en el celular abre un
 * teclado entero para cambiar de 1 a 2. Los topes se marcan con `aria-disabled` y no con
 * `disabled`, para que el foco no se caiga al `<body>` justo cuando se llega al límite.
 */
@Component({
  imports: [],
  selector: 'app-cantidad',
  styleUrl: './cantidad.css',
  templateUrl: './cantidad.html',
})
export class Cantidad {
  /** Qué se está contando: lo leen los botones ("Quitar una unidad de Pochoclo grande") */
  readonly etiqueta = input.required<string>();
  readonly valor = model(0);
  readonly minimo = input(0);
  readonly maximo = input(20);

  protected readonly enElMinimo = computed(() => this.valor() <= this.minimo());
  protected readonly enElMaximo = computed(() => this.valor() >= this.maximo());

  protected restar(): void {
    if (!this.enElMinimo()) {
      this.valor.update((v) => v - 1);
    }
  }

  protected sumar(): void {
    if (!this.enElMaximo()) {
      this.valor.update((v) => v + 1);
    }
  }
}
