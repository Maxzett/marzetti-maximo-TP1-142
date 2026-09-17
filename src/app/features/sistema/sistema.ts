import { Component, signal } from '@angular/core';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Chip } from '../../shared/chip/chip';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Spinner } from '../../shared/spinner/spinner';
import { Tarjeta } from '../../shared/tarjeta/tarjeta';

/**
 * Catálogo vivo de los componentes de shared/. No es una pantalla del producto:
 * sirve para revisar estados y accesibilidad en un solo lugar, y para mostrarlos en la defensa.
 */
@Component({
  imports: [Boton, Campo, Chip, Dialogo, Mensaje, Spinner, Tarjeta],
  selector: 'app-sistema',
  styleUrl: './sistema.css',
  templateUrl: './sistema.html',
})
export class Sistema {
  protected readonly mail = signal('');
  protected readonly mailInvalido = signal('maxi@');
  protected readonly dialogoAbierto = signal(false);
  protected readonly procesando = signal(false);

  /** Solo para ver el estado de carga del botón: no hay nada que enviar todavía */
  protected simularEnvio(): void {
    this.procesando.set(true);
    setTimeout(() => this.procesando.set(false), 1800);
  }
}
