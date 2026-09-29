import { Component, input } from '@angular/core';

/** Una ventaja de tener cuenta: el título corto y la explicación */
interface Ventaja {
  titulo: string;
  detalle: string;
}

/**
 * Panel de marquesina que acompaña a los formularios de ingresar y registrarse. En escritorio
 * esas pantallas eran una columna angosta en el medio de la página, con tres cuartos vacíos;
 * el panel llena ese lado con lo que se gana al tener cuenta, que es lo que decide registrarse.
 *
 * Cada ventaja es algo que el sistema hace de verdad (RF-39, RF-40, RF-42, RF-41, RF-31), sin
 * cifras que dependan de la configuración: el valor del cupón y los costos de los canjes los
 * cambia el administrador, y el panel no los repite para no quedar desactualizado.
 */
@Component({
  imports: [],
  selector: 'app-panel-cuenta',
  styleUrl: './panel-cuenta.css',
  templateUrl: './panel-cuenta.html',
})
export class PanelCuenta {
  /** El título del panel: cambia entre "entrar" y "crear la cuenta" */
  readonly titulo = input('Con tu cuenta');

  protected readonly ventajas: readonly Ventaja[] = [
    {
      titulo: 'Puntos en cada compra',
      detalle: 'Sumás 1 punto por cada peso que pagás y los canjeás por entradas o candy.',
    },
    {
      titulo: 'Cupón de bienvenida',
      detalle: 'Un descuento para tu primera compra, que se te ofrece en el paso del pago.',
    },
    {
      titulo: 'Avisos de estreno',
      detalle: 'Marcás las películas que esperás y te avisamos cuando salen a la venta.',
    },
    {
      titulo: 'Mis Películas',
      detalle: 'Todo lo que viniste a ver, con la calificación que le diste a cada una.',
    },
    {
      titulo: 'Cancelación con crédito',
      detalle: 'Hasta 2 horas antes de la función: el importe queda como crédito en tu cuenta.',
    },
  ];
}
