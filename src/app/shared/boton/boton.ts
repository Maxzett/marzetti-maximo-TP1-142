import { Component, computed, input, output } from '@angular/core';
import { Spinner } from '../spinner/spinner';

export type VarianteBoton = 'primario' | 'borde' | 'fantasma';

/**
 * Botón del sistema. Envuelve un <button> nativo, así que el foco, la tecla Enter
 * y el estado deshabilitado los pone el navegador.
 * Un enlace que parece botón NO usa este componente: usa las clases .boton de styles.css.
 */
@Component({
  imports: [Spinner],
  selector: 'app-boton',
  styleUrl: './boton.css',
  templateUrl: './boton.html',
})
export class Boton {
  readonly variante = input<VarianteBoton>('primario');
  readonly tipo = input<'button' | 'submit' | 'reset'>('button');
  readonly deshabilitado = input(false);
  /** Mientras carga queda inerte pero conserva el texto, así el botón no cambia de ancho */
  readonly cargando = input(false);
  readonly anchoCompleto = input(false);
  readonly presionado = output<void>();

  protected readonly clases = computed(() =>
    ['boton', `boton--${this.variante()}`, this.anchoCompleto() ? 'boton--ancho' : '']
      .filter(Boolean)
      .join(' '),
  );

  /** Cargando también bloquea: evita que se dispare dos veces la misma compra */
  protected readonly inerte = computed(() => this.deshabilitado() || this.cargando());

  protected alPresionar(evento: MouseEvent): void {
    if (!this.inerte()) {
      this.presionado.emit();
      return;
    }

    /*
     * Con aria-disabled el navegador no bloquea nada: el clic llega igual y, en un
     * type="submit", dispararía además el envío del formulario. Un Enter sobre el botón
     * también se convierte en clic, así que preventDefault corta los dos caminos de una vez.
     */
    evento.preventDefault();
  }
}
