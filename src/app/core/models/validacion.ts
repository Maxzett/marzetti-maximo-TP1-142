import { EntradaComprada } from './orden';

/** Los dos consumos independientes del mismo QR (D-03, RN-05) */
export type Tramo = 'entrada' | 'candy';

/** Cuándo y quién usó un tramo. Los dos en null mientras sigue disponible */
export interface UsoDeTramo {
  usado_at: string | null;
  /** "Ana G.": nombre e inicial del apellido de quien lo validó */
  usado_por: string | null;
}

/** De una hora antes del inicio al fin de la película (migración 0023) */
export interface VentanaDeValidacion {
  desde: string;
  hasta: string;
  estado: 'antes' | 'abierta' | 'terminada';
}

/**
 * Lo que devuelve consultar_orden_personal: la misma entrada que ve el cliente, sin el mail
 * (al personal no le sirve), más el estado de cada tramo y la ventana en la que se puede validar.
 * `tramos.candy` es null si la compra no incluye candy: no hay tramo que consumir.
 */
export interface OrdenParaPersonal extends Omit<EntradaComprada, 'email'> {
  tramos: { entrada: UsoDeTramo; candy: UsoDeTramo | null };
  ventana: VentanaDeValidacion;
}

/** Por qué la base rechazó una validación. Cada uno es un caso de negocio, no un error */
export type MotivoDeRechazo =
  'no_existe' | 'estado' | 'sin_candy' | 'fuera_de_ventana' | 'ya_usado';

export type ConsultaDeOrden =
  { estado: 'encontrada'; orden: OrdenParaPersonal } | { estado: 'error'; mensaje: string };

export type ResultadoDeValidacion =
  | { estado: 'validada'; tramo: Tramo; uso: UsoDeTramo }
  | {
      estado: 'rechazada';
      motivo: MotivoDeRechazo;
      mensaje: string;
      /** Solo con motivo ya_usado: cuándo y por quién (RN-05) */
      uso: UsoDeTramo | null;
    }
  | { estado: 'error'; mensaje: string };
