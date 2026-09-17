import { Component, computed, input, model } from '@angular/core';

export type TipoCampo = 'text' | 'email' | 'password' | 'search' | 'tel' | 'number' | 'date';

/** Cada instancia necesita un id propio para atar <label> con <input> */
let contador = 0;

/**
 * Campo de formulario con etiqueta, ayuda y estado de error.
 * El valor va por model(), no por ControlValueAccessor: cuando llegue el registro de la F3
 * se decide si vale la pena integrarlo con formularios reactivos.
 */
@Component({
  imports: [],
  selector: 'app-campo',
  styleUrl: './campo.css',
  templateUrl: './campo.html',
})
export class Campo {
  readonly etiqueta = input.required<string>();
  readonly tipo = input<TipoCampo>('text');
  readonly marcador = input('');
  readonly ayuda = input('');
  /** Texto del error. Vacío significa que el campo está bien */
  readonly error = input('');
  readonly requerido = input(false);
  readonly deshabilitado = input(false);
  readonly autocompletado = input('');
  readonly valor = model('');

  protected readonly id = `campo-${++contador}`;
  protected readonly idAyuda = `${this.id}-ayuda`;
  protected readonly idError = `${this.id}-error`;

  protected readonly hayError = computed(() => this.error().trim().length > 0);

  /**
   * Un solo aria-describedby: el error reemplaza a la ayuda en vez de sumarse,
   * así el lector de pantalla no lee dos textos que se contradicen.
   */
  protected readonly descripcion = computed(() => {
    if (this.hayError()) {
      return this.idError;
    }
    return this.ayuda() ? this.idAyuda : null;
  });

  protected alEscribir(evento: Event): void {
    this.valor.set((evento.target as HTMLInputElement).value);
  }
}
