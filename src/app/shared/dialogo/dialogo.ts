import { Component, ElementRef, effect, input, model, output, viewChild } from '@angular/core';

/** Cada instancia necesita un id propio para atar el diálogo con su título */
let contador = 0;

/**
 * Diálogo modal construido sobre el <dialog> nativo: showModal() ya trae foco atrapado,
 * cierre con Escape, ::backdrop y el resto de la página marcado como inerte.
 * Reimplementar todo eso a mano sería más código y peor accesibilidad.
 */
@Component({
  imports: [],
  selector: 'app-dialogo',
  styleUrl: './dialogo.css',
  templateUrl: './dialogo.html',
})
export class Dialogo {
  readonly titulo = input.required<string>();
  readonly abierto = model(false);
  readonly cerrado = output<void>();

  protected readonly idTitulo = `dialogo-${++contador}-titulo`;

  private readonly elemento = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    // Sincroniza la señal con el estado real del <dialog>, que el navegador también puede cambiar (Escape)
    effect(() => {
      const dialogo = this.elemento().nativeElement;

      if (this.abierto() && !dialogo.open) {
        dialogo.showModal();
      } else if (!this.abierto() && dialogo.open) {
        dialogo.close();
      }
    });
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  /** El evento close llega también cuando cierra el navegador por Escape */
  protected alCerrar(): void {
    this.abierto.set(false);
    this.cerrado.emit();
  }

  /**
   * El <dialog> ocupa toda la pantalla y el panel va adentro, así que un clic cuyo destino
   * es el propio <dialog> cayó en el fondo oscuro. Es la única forma de detectarlo.
   */
  protected alClicEnFondo(evento: MouseEvent): void {
    if (evento.target === this.elemento().nativeElement) {
      this.cerrar();
    }
  }
}
