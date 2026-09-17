import { Component, signal } from '@angular/core';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Chip } from '../../shared/chip/chip';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { hoyIso } from '../../shared/selector-fecha/fechas';
import { SelectorFecha } from '../../shared/selector-fecha/selector-fecha';
import { SelectorHora } from '../../shared/selector-hora/selector-hora';
import { Spinner } from '../../shared/spinner/spinner';
import { Tarjeta } from '../../shared/tarjeta/tarjeta';

/**
 * Catálogo vivo de los componentes de shared/. No es una pantalla del producto:
 * sirve para revisar estados y accesibilidad en un solo lugar, y para mostrarlos en la defensa.
 */
@Component({
  imports: [Boton, Campo, Chip, Dialogo, Mensaje, SelectorFecha, SelectorHora, Spinner, Tarjeta],
  selector: 'app-sistema',
  styleUrl: './sistema.css',
  templateUrl: './sistema.html',
})
export class Sistema {
  protected readonly mail = signal('');
  protected readonly mailInvalido = signal('maxi@');
  protected readonly dialogoAbierto = signal(false);
  protected readonly procesando = signal(false);

  // Los tres casos del RNF-08, con datos de ejemplo
  protected readonly fechaDeFuncion = signal('');
  protected readonly fechaDeNacimiento = signal('');
  protected readonly fechaDeAlta = signal('');
  protected readonly horarioDeFuncion = signal('');
  protected readonly horarioDeAlta = signal('');

  /** Días con función de "El último tren a Retiro", como los devolvería la base en la F5 */
  protected readonly diasConFuncion = [
    '2026-09-17',
    '2026-09-18',
    '2026-09-19',
    '2026-09-24',
    '2026-09-25',
    '2026-09-26',
  ];

  protected readonly horariosDelDia = ['18:40', '21:10', '23:30'];

  /** La fecha de nacimiento no puede ser futura (RF-38) */
  protected readonly hoy = hoyIso();

  /** Solo para ver el estado de carga del botón: no hay nada que enviar todavía */
  protected simularEnvio(): void {
    this.procesando.set(true);
    setTimeout(() => this.procesando.set(false), 1800);
  }
}
