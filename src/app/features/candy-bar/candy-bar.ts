import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Cantidades,
  catalogoSinEntradas,
  comoLineas,
  lineasDelPedido,
} from '../../core/compra/candy';
import { formatearPrecio } from '../../core/formato/precio';
import { CatalogoDeCandy } from '../../core/models/candy';
import {
  DesgloseDeOrden,
  MEDIOS_DE_PAGO,
  MedioDePago,
  OrdenDeCandy,
  Saldos,
  SeleccionDeOrden,
} from '../../core/models/orden';
import { Auth } from '../../core/services/auth';
import { Candy } from '../../core/services/candy';
import { Compra } from '../../core/services/compra';
import { Cuenta } from '../../core/services/cuenta';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Desglose } from '../../shared/desglose/desglose';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Pedido } from '../../shared/pedido/pedido';
import { PromocionesOrden } from '../../shared/promociones-orden/promociones-orden';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { SelectorCandy } from '../../shared/selector-candy/selector-candy';
import { Spinner } from '../../shared/spinner/spinner';
import { Tarjeta } from '../../shared/tarjeta/tarjeta';
import { Temporizador } from '../../shared/temporizador/temporizador';

type Paso = 'elegir' | 'pago';

/**
 * Compra de candy sin entrada (RF-34.1): elegir productos y combos, dejar el mail, pagar y
 * llevarse un ticket con QR para retirarlos en el candy bar. No exige cuenta (RF-26).
 *
 * Es la compra de entradas sin el mapa: la orden la abre crear_orden_candy (0027) y después se
 * arma y se paga con las mismas funciones (configurar_orden y confirmar_pago), así el cupón, el
 * crédito, el canje y los puntos siguen las mismas reglas (D-06). El ticket es la misma pantalla
 * de la entrada, con el mismo QR y el mismo tramo de candy que valida el empleado.
 */
@Component({
  imports: [
    Boton,
    Campo,
    Desglose,
    Mensaje,
    Pedido,
    PromocionesOrden,
    Seleccion,
    SelectorCandy,
    Spinner,
    Tarjeta,
    Temporizador,
  ],
  selector: 'app-candy-bar',
  styleUrl: './candy-bar.css',
  templateUrl: './candy-bar.html',
})
export class CandyBar {
  private readonly candy = inject(Candy);
  private readonly cuenta = inject(Cuenta);
  private readonly servicio = inject(Compra);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly formatearPrecio = formatearPrecio;
  protected readonly mediosDePago: readonly OpcionSeleccion[] = MEDIOS_DE_PAGO.map((m) => ({
    valor: m.valor,
    texto: m.nombre,
  }));
  protected readonly haySesion = this.auth.haySesion;

  protected readonly cargando = signal(true);
  /** Null si no se pudo leer: la pantalla lo dice en vez de mostrar un candy vacío */
  protected readonly catalogo = signal<CatalogoDeCandy | null>(null);
  protected readonly saldos = signal<Saldos | null>(null);

  protected readonly paso = signal<Paso>('elegir');
  protected readonly productos = signal<Cantidades>(new Map());
  protected readonly combos = signal<Cantidades>(new Map());
  protected readonly email = signal('');
  protected readonly errorDeEleccion = signal('');
  protected readonly enviando = signal(false);
  protected readonly avisoDeVencimiento = signal('');

  protected readonly orden = signal<OrdenDeCandy | null>(null);
  protected readonly desglose = signal<DesgloseDeOrden | null>(null);
  protected readonly cupon = signal('');
  protected readonly usarCredito = signal(false);
  protected readonly recompensaId = signal('');
  protected readonly ajustando = signal(false);
  protected readonly errorDeAjuste = signal('');
  protected readonly medio = signal('');
  protected readonly pagando = signal(false);
  protected readonly errorDePago = signal('');

  /** Sin combos con entrada ni canje de entrada: acá no hay butaca que cubrir */
  protected readonly tienda = computed(() => {
    const catalogo = this.catalogo();
    return catalogo ? catalogoSinEntradas(catalogo) : null;
  });

  /** Lo elegido, con nombre, para el lateral "Tu pedido" */
  protected readonly lineas = computed(() => {
    const tienda = this.tienda();
    return tienda ? lineasDelPedido(tienda, this.productos(), this.combos()) : [];
  });

  protected readonly unidades = computed(
    () =>
      [...this.productos().values(), ...this.combos().values()].reduce((a, b) => a + b, 0) +
      (this.recompensaId() ? 1 : 0),
  );

  protected readonly total = computed(() => this.desglose()?.total ?? 0);

  constructor() {
    void this.cargar();
  }

  // ── Paso 1: elegir ───────────────────────────────────────────────────────

  protected async continuar(evento: Event): Promise<void> {
    evento.preventDefault();

    if (this.enviando()) {
      return;
    }

    // Adelanta lo que la base también rechazaría, sin hacer esperar una vuelta de red
    if (this.unidades() === 0) {
      this.errorDeEleccion.set('Elegí al menos un producto o un combo.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) {
      this.errorDeEleccion.set(
        'Ingresá un email válido: queda como dato de contacto de tu compra.',
      );
      return;
    }

    this.enviando.set(true);
    this.errorDeEleccion.set('');
    this.avisoDeVencimiento.set('');

    const creada = await this.servicio.crearOrdenCandy(this.email().trim());

    if (creada.estado === 'creada') {
      // La orden es nueva: arranca sin cupón, sin crédito y sin canje
      this.cupon.set('');
      this.usarCredito.set(false);
      this.recompensaId.set('');

      const configurada = await this.servicio.configurarOrden(
        creada.orden.orden_id,
        this.seleccion(),
      );

      if (configurada.estado === 'configurada') {
        this.orden.set(creada.orden);
        this.desglose.set(configurada.desglose);
        this.errorDeAjuste.set('');
        this.paso.set('pago');
      } else {
        this.errorDeEleccion.set(configurada.mensaje);
      }
    } else {
      this.errorDeEleccion.set(creada.mensaje);
    }

    this.enviando.set(false);
  }

  protected volverAElegir(): void {
    this.paso.set('elegir');
    this.errorDePago.set('');
  }

  /** Pasaron los 10 minutos: la orden ya no se puede pagar, pero lo elegido se conserva */
  protected alVencer(): void {
    this.avisoDeVencimiento.set('Pasaron 10 minutos sin pagar. Revisá tu pedido y seguí de nuevo.');
    this.orden.set(null);
    this.desglose.set(null);
    this.paso.set('elegir');
  }

  // ── Paso 2: pago ─────────────────────────────────────────────────────────

  private seleccion(): SeleccionDeOrden {
    return {
      productos: comoLineas(this.productos()),
      combos: comoLineas(this.combos()),
      cupon: this.cupon(),
      usarCredito: this.usarCredito(),
      recompensaId: this.recompensaId() || null,
    };
  }

  /**
   * Mismo criterio que la compra de entradas: si la base rechaza el cambio, la orden quedó como
   * estaba, así que se vuelve a lo anterior y se muestra el motivo.
   */
  private async ajustar(cambio: () => void): Promise<void> {
    const orden = this.orden();

    if (!orden || this.ajustando()) {
      return;
    }

    const previa = {
      cupon: this.desglose()?.cupon?.codigo ?? '',
      usarCredito: this.usarCredito(),
      recompensaId: this.recompensaId(),
    };

    cambio();
    this.ajustando.set(true);
    this.errorDeAjuste.set('');

    const resultado = await this.servicio.configurarOrden(orden.orden_id, this.seleccion());

    if (resultado.estado === 'configurada') {
      this.desglose.set(resultado.desglose);
    } else if (resultado.estado === 'vencida') {
      this.alVencer();
    } else {
      this.errorDeAjuste.set(resultado.mensaje);
      this.cupon.set(previa.cupon);
      this.usarCredito.set(previa.usarCredito);
      this.recompensaId.set(previa.recompensaId);
    }

    this.ajustando.set(false);
  }

  protected aplicarCupon(): Promise<void> {
    return this.ajustar(() => undefined);
  }

  protected usarCupon(codigo: string): Promise<void> {
    return this.ajustar(() => this.cupon.set(codigo));
  }

  protected quitarCupon(): Promise<void> {
    return this.ajustar(() => this.cupon.set(''));
  }

  protected alternarCredito(activo: boolean): Promise<void> {
    return this.ajustar(() => this.usarCredito.set(activo));
  }

  protected elegirRecompensa(id: string): Promise<void> {
    return this.ajustar(() => this.recompensaId.set(id));
  }

  protected async pagar(): Promise<void> {
    const orden = this.orden();

    if (!orden || this.pagando()) {
      return;
    }

    if (this.total() > 0 && !this.medio()) {
      this.errorDePago.set('Elegí un medio de pago.');
      return;
    }

    this.pagando.set(true);
    this.errorDePago.set('');

    const resultado = await this.servicio.confirmarPago(
      orden.orden_id,
      this.total() > 0 ? (this.medio() as MedioDePago) : null,
    );

    if (resultado.estado === 'pagada') {
      await this.router.navigate(['/entrada', resultado.codigo]);
    } else if (resultado.estado === 'vencida') {
      this.alVencer();
    } else {
      this.errorDePago.set(resultado.mensaje);
    }

    this.pagando.set(false);
  }

  // ── Carga ────────────────────────────────────────────────────────────────

  private async cargar(): Promise<void> {
    const [catalogo, saldos] = await Promise.all([
      this.candy.cargar(),
      this.haySesion() ? this.cuenta.saldos() : Promise.resolve(null),
    ]);

    this.catalogo.set(catalogo);
    this.saldos.set(saldos);
    this.email.set(this.auth.perfil()?.email ?? '');
    this.cargando.set(false);
  }
}
