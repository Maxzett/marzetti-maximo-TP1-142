import { Component, computed, input } from '@angular/core';

export type TonoMensaje = 'exito' | 'error' | 'aviso';

/**
 * Mensaje de resultado. Cada tono tiene su propia forma de ícono y su palabra al frente,
 * así que se distingue sin ver el color (RNF-10).
 */
@Component({
  imports: [],
  selector: 'app-mensaje',
  styleUrl: './mensaje.css',
  templateUrl: './mensaje.html',
})
export class Mensaje {
  readonly tono = input<TonoMensaje>('aviso');

  /**
   * alert interrumpe al lector de pantalla; status espera a que termine la frase en curso.
   * Un error de pago merece la interrupción, un "listo" no.
   */
  protected readonly rol = computed(() => (this.tono() === 'error' ? 'alert' : 'status'));

  protected readonly palabra = computed(() => {
    switch (this.tono()) {
      case 'exito':
        return 'Listo:';
      case 'error':
        return 'Error:';
      default:
        return 'Atención:';
    }
  });
}
