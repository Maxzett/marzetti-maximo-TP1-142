import { Component, computed, input, model } from '@angular/core';

export interface OpcionSeleccion {
  valor: string;
  texto: string;
}

/** Cada instancia necesita un id propio para atar <label> con <select> */
let contador = 0;

/**
 * Campo de selección con etiqueta, ayuda y estado de error.
 *
 * Es el hermano de <app-campo> para las listas cerradas: tipo de sangre y color de
 * ojos en el registro, y más adelante formato, idioma y género. Se apoya en el
 * <select> nativo a propósito: el desplegable del sistema ya trae teclado, búsqueda
 * por letra y el control táctil de cada plataforma. Reimplementarlo sería más código
 * y peor accesibilidad, que es el mismo criterio que se usó con <dialog> en el diálogo.
 */
@Component({
  imports: [],
  selector: 'app-seleccion',
  styleUrl: './seleccion.css',
  templateUrl: './seleccion.html',
})
export class Seleccion {
  readonly etiqueta = input.required<string>();
  readonly opciones = input.required<readonly OpcionSeleccion[]>();
  /** Texto de la opción vacía inicial */
  readonly marcador = input('Elegí una opción');
  readonly ayuda = input('');
  /** Texto del error. Vacío significa que el campo está bien */
  readonly error = input('');
  readonly requerido = input(false);
  readonly deshabilitado = input(false);
  readonly valor = model('');

  protected readonly id = `seleccion-${++contador}`;
  protected readonly idAyuda = `${this.id}-ayuda`;
  protected readonly idError = `${this.id}-error`;

  protected readonly hayError = computed(() => this.error().trim().length > 0);

  /** Un solo aria-describedby, igual que en <app-campo>: el error reemplaza a la ayuda */
  protected readonly descripcion = computed(() => {
    if (this.hayError()) {
      return this.idError;
    }
    return this.ayuda() ? this.idAyuda : null;
  });

  protected alElegir(evento: Event): void {
    this.valor.set((evento.target as HTMLSelectElement).value);
  }
}
