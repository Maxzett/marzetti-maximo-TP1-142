import { Component, computed, input, model, output } from '@angular/core';
import { describirCupon } from '../../core/compra/candy';
import { formatearPrecio, formatearPuntos } from '../../core/formato/precio';
import { Recompensa } from '../../core/models/candy';
import { DesgloseDeOrden, Saldos } from '../../core/models/orden';
import { Boton } from '../boton/boton';
import { Campo } from '../campo/campo';
import { Mensaje } from '../mensaje/mensaje';
import { OpcionSeleccion, Seleccion } from '../seleccion/seleccion';

/**
 * Cupón, crédito y canje de puntos de una orden (RF-32, RF-39, RF-44, RF-46). Lo usan la compra
 * de entradas y la del candy bar, que se pagan con las mismas reglas (D-06).
 *
 * No aplica nada: cada gesto sale como un evento, la pantalla se lo manda a configurar_orden y la
 * base devuelve el desglose recalculado. Así no hay dos lugares que decidan un descuento.
 */
@Component({
  imports: [Boton, Campo, Mensaje, Seleccion],
  selector: 'app-promociones-orden',
  styleUrl: './promociones-orden.css',
  templateUrl: './promociones-orden.html',
})
export class PromocionesOrden {
  /** Lo último que calculó la base: dice si ya hay un cupón aplicado */
  readonly desglose = input<DesgloseDeOrden | null>(null);
  /** Puntos, crédito y cupones que la cuenta puede usar. Null sin sesión */
  readonly saldos = input<Saldos | null>(null);
  readonly haySesion = input(false);
  /** Las recompensas que tienen sentido en esta compra; se ofrecen solo las que alcanzan */
  readonly recompensas = input<readonly Recompensa[]>([]);
  readonly usarCredito = input(false);
  readonly recompensaId = input('');
  readonly ajustando = input(false);
  readonly error = input('');
  /** El código que se está escribiendo; se aplica recién con el botón */
  readonly cupon = model('');

  readonly aplicar = output<void>();
  readonly usarCupon = output<string>();
  readonly quitarCupon = output<void>();
  readonly alternarCredito = output<boolean>();
  readonly elegirRecompensa = output<string>();

  protected readonly formatearPrecio = formatearPrecio;
  protected readonly formatearPuntos = formatearPuntos;
  protected readonly describirCupon = describirCupon;

  /** El cupón de bienvenida se ofrece mientras no haya otro aplicado (RF-39) */
  protected readonly bienvenida = computed(() =>
    this.desglose()?.cupon ? null : (this.saldos()?.bienvenida ?? null),
  );

  /**
   * El cupón por edad (RF-44), a quien lo puede usar: la cuenta no tiene otra forma de saber que
   * existe. Si también hay bienvenida se ofrecen los dos y elige la persona: van de a uno.
   */
  protected readonly porEdad = computed(() =>
    this.desglose()?.cupon ? null : (this.saldos()?.cupon_edad ?? null),
  );

  /** Solo se ofrecen las recompensas que alcanzan con los puntos de la cuenta (RF-46) */
  protected readonly posibles = computed<OpcionSeleccion[]>(() => {
    const puntos = this.saldos()?.puntos ?? 0;

    return this.recompensas()
      .filter((r) => r.costo_puntos <= puntos)
      .map((r) => ({
        valor: r.id,
        texto: `${r.nombre} · ${formatearPuntos(r.costo_puntos)} puntos`,
      }));
  });
}
