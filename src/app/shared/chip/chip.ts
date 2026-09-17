import { Component, input, model } from '@angular/core';

/**
 * Chip de filtro. Es un botón de dos estados, no un enlace: aria-pressed le dice al
 * lector de pantalla si está activo, y el tilde lo dice a la vista (RNF-10).
 * Lo usan los géneros de la cartelera, que se combinan entre sí.
 */
@Component({
  imports: [],
  selector: 'app-chip',
  styleUrl: './chip.css',
  templateUrl: './chip.html',
})
export class Chip {
  readonly activo = model(false);
  readonly deshabilitado = input(false);

  protected alternar(): void {
    this.activo.set(!this.activo());
  }
}
