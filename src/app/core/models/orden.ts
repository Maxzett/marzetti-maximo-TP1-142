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

/** Lo que devuelve obtener_orden: todo lo que muestran la entrada en pantalla y el PDF */
export interface EntradaComprada {
  codigo: string;
  estado: 'pendiente' | 'pagada' | 'cancelada' | 'expirada';
  email: string;
  total: number;
  pagada_at: string | null;
  entrada_validada_at: string | null;
  pelicula: string;
  restriccion_edad: 0 | 13 | 18;
  requiere_acompanante: boolean;
  inicio: string;
  formato: string;
  idioma: string;
  sala: string;
  butacas: ButacaDeOrden[];
}

export type ResultadoDeOrden =
  { estado: 'creada'; resumen: ResumenDeOrden } | { estado: 'error'; mensaje: string };

export type ResultadoDePago =
  | { estado: 'pagada'; codigo: string }
  /** La reserva de 10 minutos venció: no es una falla, es el caso previsto de D-08 */
  | { estado: 'vencida'; mensaje: string }
  | { estado: 'error'; mensaje: string };
