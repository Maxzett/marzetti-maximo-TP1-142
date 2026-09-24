import { TipoUbicacion } from './sala';

/**
 * Cómo ve el mapa cada butaca de una función. `libre` no viaja desde la base: es lo que
 * queda cuando una butaca no está en la lista. `propia` es una reserva de esta misma sesión.
 */
export type EstadoDeButaca = 'libre' | 'ocupada' | 'retenida' | 'propia';

/** Evento que emite la base por Broadcast cuando cambia una butaca (migración 0020) */
export interface EventoDeButaca {
  butaca_id: string;
  estado: 'libre' | 'retenida' | 'ocupada';
}

export type MedioDePago = 'tarjeta_credito' | 'tarjeta_debito' | 'transferencia';

export const MEDIOS_DE_PAGO: readonly { valor: MedioDePago; nombre: string }[] = [
  { valor: 'tarjeta_credito', nombre: 'Tarjeta de crédito' },
  { valor: 'tarjeta_debito', nombre: 'Tarjeta de débito' },
  { valor: 'transferencia', nombre: 'Transferencia' },
];

/** Una butaca de la orden con el precio ya congelado (RN-10) */
export interface ButacaDeOrden {
  fila: string;
  numero: number;
  tipo: TipoUbicacion;
  precio: number;
}

/** Lo que devuelve crear_orden: el resumen que se muestra antes de pagar */
export interface ResumenDeOrden {
  orden_id: string;
  codigo: string;
  expira_at: string;
  subtotal: number;
  total: number;
  /** RF-17: si hay una butaca VIP, la interfaz avisa antes de pagar */
  tiene_vip: boolean;
  /** RF-29: la entrada de una película con restricción lleva la leyenda de adulto acompañante */
  requiere_acompanante: boolean;
  items: (ButacaDeOrden & { butaca_id: string })[];
}

/** Lo que el usuario eligió del candy, para mandar a configurar_orden (0022) */
export interface SeleccionDeOrden {
  productos: { id: string; cantidad: number }[];
  combos: { id: string; cantidad: number }[];
  /** Código del cupón, o vacío si no usa ninguno */
  cupon: string;
  usarCredito: boolean;
  recompensaId: string | null;
}

/** Cupón aplicado, tal como lo describe el desglose */
export interface CuponAplicado {
  codigo: string;
  tipo_descuento: 'porcentaje' | 'monto';
  valor: number;
}

/**
 * Lo que devuelve configurar_orden: el desglose completo en el orden de D-06 (subtotal, cupón,
 * crédito, total). Lo calcula la base; la pantalla solo lo muestra.
 */
export interface DesgloseDeOrden {
  subtotal: number;
  descuento_cupon: number;
  credito_aplicado: number;
  total: number;
  /** RN-07: 1 punto por peso pagado con el medio de pago; 0 sin cuenta */
  puntos_a_ganar: number;
  puntos_canje: number;
  cupon: CuponAplicado | null;
  tiene_vip: boolean;
  entradas: (ButacaDeOrden & { butaca_id: string })[];
  productos: {
    producto_id: string;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    por_canje: boolean;
  }[];
  combos: { combo_id: string; nombre: string; cantidad: number; precio_unitario: number }[];
}

export type ResultadoDeConfiguracion =
  | { estado: 'configurada'; desglose: DesgloseDeOrden }
  /** La reserva venció mientras se elegía: es el caso previsto de D-08, no una falla */
  | { estado: 'vencida'; mensaje: string }
  | { estado: 'error'; mensaje: string };

/** Lo que devuelve mis_saldos (RF-40) */
export interface Saldos {
  puntos: number;
  credito: number;
  /** El cupón de bienvenida que todavía se puede usar (RF-39), o null */
  bienvenida: CuponAplicado | null;
}

/** Una compra propia del historial, con lo que hace falta para decidir si se puede cancelar */
export interface OrdenPropia {
  orden_id: string;
  codigo: string;
  estado: 'pagada' | 'cancelada';
  total: number;
  credito_aplicado: number;
  pagada_at: string | null;
  cancelada_at: string | null;
  pelicula: string;
  inicio: string;
  sala: string;
  entradas: number;
  tiene_candy: boolean;
  cancelable: boolean;
  /** Por qué no se puede cancelar (RN-06); nulo cuando sí se puede */
  motivo_no_cancelable: string | null;
}

/** Un canje del historial (RF-40) */
export interface Canje {
  id: string;
  costo_puntos: number;
  creado_at: string;
  recompensas: { nombre: string } | null;
}

export type ResultadoDeCancelacion =
  { estado: 'cancelada'; credito: number } | { estado: 'error'; mensaje: string };

/** Un producto o combo a retirar con el mismo QR (RF-35) */
export interface ItemParaRetirar {
  nombre: string;
  cantidad: number;
  por_canje: boolean;
  /** Lo que trae un combo; vacío para un producto suelto */
  incluye: { nombre: string; cantidad: number }[];
}

/** Lo que devuelve obtener_orden: todo lo que muestran la entrada en pantalla y el PDF */
export interface EntradaComprada {
  codigo: string;
  estado: 'pendiente' | 'pagada' | 'cancelada' | 'expirada';
  email: string;
  subtotal: number;
  descuento_cupon: number;
  credito_aplicado: number;
  total: number;
  pagada_at: string | null;
  cancelada_at: string | null;
  entrada_validada_at: string | null;
  candy_entregado_at: string | null;
  tiene_candy: boolean;
  candy: ItemParaRetirar[];
  pelicula: string;
  restriccion_edad: 0 | 13 | 18;
  requiere_acompanante: boolean;
  inicio: string;
  formato: string;
  idioma: string;
  sala: string;
  butacas: ButacaDeOrden[];
}

export type ResultadoDeReserva =
  { estado: 'reservada'; expiraAt: string | null } | { estado: 'error'; mensaje: string };

export type ResultadoDeOrden =
  { estado: 'creada'; resumen: ResumenDeOrden } | { estado: 'error'; mensaje: string };

export type ResultadoDePago =
  | { estado: 'pagada'; codigo: string }
  /** La reserva de 10 minutos venció: no es una falla, es el caso previsto de D-08 */
  | { estado: 'vencida'; mensaje: string }
  | { estado: 'error'; mensaje: string };
