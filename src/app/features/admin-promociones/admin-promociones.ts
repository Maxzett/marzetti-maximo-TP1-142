import { Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { formatearPrecio, formatearPuntos, leerImporte } from '../../core/formato/precio';
import {
  ClaveDeConfiguracion,
  Cupon,
  Promociones,
  RecompensaGestionada,
  TipoDeCupon,
  TipoDeDescuento,
} from '../../core/models/gestion';
import { fechaCorta } from '../../core/reportes/facturacion';
import { Gestion } from '../../core/services/gestion';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { CampoFecha } from '../../shared/campo-fecha/campo-fecha';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { Spinner } from '../../shared/spinner/spinner';

const TIPOS_DE_CUPON: Record<TipoDeCupon, string> = {
  bienvenida: 'Bienvenida (primera compra)',
  por_edad: 'Por edad',
  general: 'General',
};

/** Las opciones de configuración, con cómo se leen y en qué unidad */
const OPCIONES_DE_CONFIGURACION: readonly {
  clave: ClaveDeConfiguracion;
  etiqueta: string;
  ayuda: string;
}[] = [
  {
    clave: 'recargo_vip',
    etiqueta: 'Recargo de las butacas VIP',
    ayuda: 'En pesos, sobre el precio de la función. De 0 a 100.000.',
  },
  {
    clave: 'max_butacas_por_orden',
    etiqueta: 'Butacas por compra',
    ayuda: 'Cuántas butacas puede reservar una misma compra. De 1 a 20.',
  },
  {
    clave: 'max_unidades_por_producto',
    etiqueta: 'Unidades por producto',
    ayuda: 'Cuántas unidades de un mismo producto del candy entran en una compra. De 1 a 50.',
  },
];

/**
 * Promociones desde el panel (RF-39, RF-43, RF-44, RF-46, RF-47) y la configuración de la venta
 * (RN-11): cupones, recompensas por puntos, recargo VIP y topes.
 *
 * Las reglas las pone la base (0024) y esta pantalla muestra su mensaje: un solo cupón de
 * bienvenida activo, el porcentaje hasta 100, un cupón por edad con su edad mínima. Cada cambio
 * queda en el log con el valor anterior (RF-61).
 */
@Component({
  imports: [Boton, Campo, CampoFecha, Dialogo, Mensaje, Seleccion, Spinner],
  selector: 'app-admin-promociones',
  styleUrls: ['../../layout/admin/pantalla-admin.css', './admin-promociones.css'],
  templateUrl: './admin-promociones.html',
})
export class AdminPromociones {
  private readonly gestion = inject(Gestion);

  protected readonly puntos = formatearPuntos;
  protected readonly opcionesDeConfiguracion = OPCIONES_DE_CONFIGURACION;

  protected readonly opcionesDeTipo: OpcionSeleccion[] = Object.entries(TIPOS_DE_CUPON).map(
    ([valor, texto]) => ({ valor, texto }),
  );
  protected readonly opcionesDeDescuento: OpcionSeleccion[] = [
    { valor: 'porcentaje', texto: 'Porcentaje' },
    { valor: 'monto', texto: 'Monto fijo en pesos' },
  ];
  protected readonly opcionesDeRecompensa: OpcionSeleccion[] = [
    { valor: 'entrada', texto: 'Una entrada' },
    { valor: 'producto', texto: 'Un producto del candy' },
  ];

  protected readonly cargando = signal(true);
  protected readonly datos = signal<Promociones | null>(null);
  protected readonly aviso = signal('');

  protected readonly opcionesDeProducto = computed<OpcionSeleccion[]>(() =>
    (this.datos()?.productos ?? []).map((p) => ({ valor: p.id, texto: p.nombre })),
  );

  // ── Cupón ──
  protected readonly cuponAbierto = signal(false);
  protected readonly cuponId = signal<string | null>(null);
  protected readonly cupCodigo = signal('');
  protected readonly cupTipo = signal<string>('general');
  protected readonly cupDescuento = signal<string>('porcentaje');
  protected readonly cupValor = signal('');
  protected readonly cupEdad = signal('');
  protected readonly cupDesde = signal('');
  protected readonly cupHasta = signal('');
  protected readonly cupActivo = signal(true);

  // ── Recompensa ──
  protected readonly recompensaAbierta = signal(false);
  protected readonly recompensaId = signal<string | null>(null);
  protected readonly recNombre = signal('');
  protected readonly recTipo = signal<string>('producto');
  protected readonly recProducto = signal('');
  protected readonly recCosto = signal('');
  protected readonly recActiva = signal(true);

  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  // ── Configuración: un campo por opción, con el valor que tiene hoy ──
  protected readonly valoresDeConfiguracion = signal<Record<ClaveDeConfiguracion, string>>({
    recargo_vip: '',
    max_butacas_por_orden: '',
    max_unidades_por_producto: '',
  });
  protected readonly guardandoConfiguracion = signal(false);
  protected readonly errorDeConfiguracion = signal('');
  protected readonly avisoDeConfiguracion = signal('');

  constructor() {
    void this.cargar();
  }

  /** "20 %", "$ 500"; y a quién aplica si no es para todos */
  protected describirCupon(cupon: Cupon): string {
    const descuento =
      cupon.tipo_descuento === 'porcentaje' ? `${cupon.valor} %` : formatearPrecio(cupon.valor);
    const para =
      cupon.tipo === 'bienvenida'
        ? ' · primera compra de cada cuenta'
        : cupon.edad_minima !== null
          ? ` · desde los ${cupon.edad_minima} años`
          : '';
    return `${descuento}${para}`;
  }

  protected describirVigencia(cupon: Cupon): string {
    const desde = cupon.vigente_desde;
    const hasta = cupon.vigente_hasta;

    if (!desde && !hasta) {
      return 'Sin vencimiento';
    }
    if (desde && hasta) {
      return `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
    }
    return desde ? `Desde el ${fechaCorta(desde)}` : `Hasta el ${fechaCorta(hasta as string)}`;
  }

  protected describirRecompensa(recompensa: RecompensaGestionada): string {
    if (recompensa.tipo === 'entrada') {
      return 'Una entrada';
    }
    const producto = this.datos()?.productos.find((p) => p.id === recompensa.producto_id);
    return producto?.nombre ?? 'Un producto dado de baja';
  }

  protected casilla(evento: Event): boolean {
    return (evento.target as HTMLInputElement).checked;
  }

  // ── Cupones ──
  protected abrirCupon(cupon: Cupon | null): void {
    this.cuponId.set(cupon?.id ?? null);
    this.cupCodigo.set(cupon?.codigo ?? '');
    this.cupTipo.set(cupon?.tipo ?? 'general');
    this.cupDescuento.set(cupon?.tipo_descuento ?? 'porcentaje');
    this.cupValor.set(cupon ? String(cupon.valor) : '');
    this.cupEdad.set(cupon?.edad_minima !== null && cupon ? String(cupon.edad_minima) : '');
    this.cupDesde.set(cupon?.vigente_desde ?? '');
    this.cupHasta.set(cupon?.vigente_hasta ?? '');
    this.cupActivo.set(cupon?.activo ?? true);
    this.abrir(this.cuponAbierto);
  }

  protected async guardarCupon(): Promise<void> {
    const valor = leerImporte(this.cupValor());
    const edad = this.cupEdad().trim() === '' ? null : Number(this.cupEdad());
    const codigo = this.cupCodigo().trim().toUpperCase();

    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) {
      this.error.set('El código lleva de 3 a 30 letras, números o guiones, sin espacios.');
      return;
    }
    if (valor === null || valor === 0) {
      this.error.set('El descuento tiene que ser mayor que cero.');
      return;
    }
    if (this.cupDescuento() === 'porcentaje' && valor > 100) {
      this.error.set('Un porcentaje no puede superar el 100 %.');
      return;
    }
    if (edad !== null && (!Number.isInteger(edad) || edad < 0 || edad > 120)) {
      this.error.set('La edad mínima es un número entero de 0 a 120.');
      return;
    }
    if (this.cupTipo() === 'por_edad' && edad === null) {
      this.error.set('Un cupón por edad necesita la edad mínima.');
      return;
    }
    if (this.cupDesde() && this.cupHasta() && this.cupDesde() > this.cupHasta()) {
      this.error.set('La vigencia termina antes de empezar.');
      return;
    }

    await this.guardar(
      () =>
        this.gestion.guardarCupon({
          id: this.cuponId(),
          codigo,
          tipo: this.cupTipo() as TipoDeCupon,
          tipo_descuento: this.cupDescuento() as TipoDeDescuento,
          valor,
          edad_minima: edad,
          vigente_desde: this.cupDesde() || null,
          vigente_hasta: this.cupHasta() || null,
          activo: this.cupActivo(),
        }),
      this.cuponAbierto,
      `Guardamos el cupón ${codigo}.`,
    );
  }

  // ── Recompensas ──
  protected abrirRecompensa(recompensa: RecompensaGestionada | null): void {
    this.recompensaId.set(recompensa?.id ?? null);
    this.recNombre.set(recompensa?.nombre ?? '');
    this.recTipo.set(recompensa?.tipo ?? 'producto');
    this.recProducto.set(recompensa?.producto_id ?? '');
    this.recCosto.set(recompensa ? String(recompensa.costo_puntos) : '');
    this.recActiva.set(recompensa?.activa ?? true);
    this.abrir(this.recompensaAbierta);
  }

  protected async guardarRecompensa(): Promise<void> {
    const costo = Number(this.recCosto().replace(/\./g, ''));
    const esProducto = this.recTipo() === 'producto';

    if (!this.recNombre().trim()) {
      this.error.set('Escribí el nombre de la recompensa.');
      return;
    }
    if (esProducto && !this.recProducto()) {
      this.error.set('Elegí el producto que se entrega.');
      return;
    }
    if (!Number.isInteger(costo) || costo <= 0) {
      this.error.set('El costo es una cantidad entera de puntos, mayor que cero.');
      return;
    }

    await this.guardar(
      () =>
        this.gestion.guardarRecompensa({
          id: this.recompensaId(),
          nombre: this.recNombre(),
          tipo: esProducto ? 'producto' : 'entrada',
          producto_id: esProducto ? this.recProducto() : null,
          costo_puntos: costo,
          activa: this.recActiva(),
        }),
      this.recompensaAbierta,
      `Guardamos la recompensa ${this.recNombre().trim()}.`,
    );
  }

  // ── Configuración ──
  protected valorDe(clave: ClaveDeConfiguracion): string {
    return this.valoresDeConfiguracion()[clave];
  }

  protected cambiarValor(clave: ClaveDeConfiguracion, valor: string): void {
    this.valoresDeConfiguracion.update((valores) => ({ ...valores, [clave]: valor }));
  }

  /**
   * Guarda solo lo que cambió, de a una opción: cada una es una llamada con su propio registro
   * en el log, y si la base rechaza una, las anteriores ya quedaron guardadas y se dice cuál falló.
   */
  protected async guardarConfiguracion(): Promise<void> {
    const actual = this.datos()?.configuracion ?? {};
    const cambios = OPCIONES_DE_CONFIGURACION.map((o) => ({
      ...o,
      valor: Number(this.valorDe(o.clave).replace(',', '.')),
    })).filter((o) => o.valor !== actual[o.clave]);

    this.errorDeConfiguracion.set('');
    this.avisoDeConfiguracion.set('');

    const invalido = cambios.find(
      (o) => this.valorDe(o.clave).trim() === '' || !Number.isFinite(o.valor),
    );
    if (invalido) {
      this.errorDeConfiguracion.set(`${invalido.etiqueta}: escribí un número.`);
      return;
    }

    if (cambios.length === 0) {
      this.avisoDeConfiguracion.set('No hay cambios para guardar.');
      return;
    }

    this.guardandoConfiguracion.set(true);

    for (const cambio of cambios) {
      const error = await this.gestion.guardarConfiguracion(cambio.clave, cambio.valor);

      if (error) {
        this.errorDeConfiguracion.set(`${cambio.etiqueta}: ${error}`);
        break;
      }
    }

    this.guardandoConfiguracion.set(false);
    await this.cargar();

    if (!this.errorDeConfiguracion()) {
      this.avisoDeConfiguracion.set('Guardamos la configuración. Rige para las compras nuevas.');
    }
  }

  private abrir(dialogo: WritableSignal<boolean>): void {
    this.error.set('');
    this.aviso.set('');
    dialogo.set(true);
  }

  private async guardar(
    escribir: () => Promise<string | null>,
    dialogo: WritableSignal<boolean>,
    exito: string,
  ): Promise<void> {
    this.guardando.set(true);
    this.error.set('');

    const error = await escribir();
    this.guardando.set(false);

    if (error) {
      this.error.set(error);
      return;
    }

    dialogo.set(false);
    await this.cargar();
    this.aviso.set(exito);
  }

  private async cargar(): Promise<void> {
    const datos = await this.gestion.cargarPromociones();

    this.datos.set(datos);
    this.cargando.set(false);

    if (datos) {
      this.valoresDeConfiguracion.set({
        recargo_vip: String(datos.configuracion.recargo_vip ?? ''),
        max_butacas_por_orden: String(datos.configuracion.max_butacas_por_orden ?? ''),
        max_unidades_por_producto: String(datos.configuracion.max_unidades_por_producto ?? ''),
      });
    }
  }
}
