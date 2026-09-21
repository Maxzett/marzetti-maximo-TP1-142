/**
 * Modelos de salas, butacas y funciones (RF-12 a RF-23).
 *
 * Igual que en pelicula.ts, los campos que vienen de una tabla van en snake_case: son los
 * nombres de las columnas de Postgres y supabase-js devuelve la fila tal cual.
 */

/** RF-13, RF-14 y RF-15. Es lo que decide la silueta que dibuja el mapa, no solo el color */
export type TipoUbicacion = 'estandar' | 'silla_ruedas' | 'vip';

export const TIPOS_DE_UBICACION: readonly TipoUbicacion[] = ['estandar', 'silla_ruedas', 'vip'];

export interface Sala {
  id: string;
  nombre: string;
  /** Una sala dada de baja deja de recibir funciones, pero las pasadas la siguen referenciando */
  activa: boolean;
}

export interface Butaca {
  id: string;
  /** De 'A' a 'T' (RF-12) */
  fila: string;
  /** 1, 2 o 3: el bloque de la fila, separado del vecino por un pasillo */
  columna: number;
  /** Numeración corrida dentro de la fila, de 1 a 28 (o a 14 en J y K) */
  numero: number;
  tipo: TipoUbicacion;
}

/** RF-19 */
export type FormatoFuncion = '2D' | '3D' | '4D' | '5D';
export const FORMATOS_DE_FUNCION: readonly FormatoFuncion[] = ['2D', '3D', '4D', '5D'];

export type IdiomaFuncion = 'castellano' | 'subtitulada';
export const IDIOMAS_DE_FUNCION: readonly IdiomaFuncion[] = ['castellano', 'subtitulada'];

/** Fila de `funciones` con la película y la sala ya resueltas por el JOIN */
export interface Funcion {
  id: string;
  pelicula_id: string;
  sala_id: string;
  /** Instante de comienzo, ISO 8601. Se muestra siempre en la hora del cine, no en la del navegador */
  inicio: string;
  formato: FormatoFuncion;
  idioma: IdiomaFuncion;
  precio_base: number;
  activa: boolean;
  pelicula: { titulo: string; duracion_minutos: number };
  sala: { nombre: string };
}

/** Lo que el administrador completa para programar funciones (RF-20) */
export interface DatosProgramacion {
  peliculaId: string;
  /** 'AAAA-MM-DD', en la fecha del cine */
  desde: string;
  hasta: string;
  /** Días de la semana como en ISO 8601: 1 = lunes … 7 = domingo */
  dias: readonly number[];
  /** 'HH:MM', en la hora del cine */
  hora: string;
  formato: FormatoFuncion;
  idioma: IdiomaFuncion;
  precioBase: number;
}

/** Lo que se puede cambiar de una función ya programada (RF-23) */
export interface DatosModificacion {
  /** Instante de comienzo, ISO 8601 con zona */
  inicio: string;
  formato: FormatoFuncion;
  idioma: IdiomaFuncion;
  precioBase: number;
}

export interface FuncionCreada {
  id: string;
  inicio: string;
  sala_id: string;
  sala: string;
}

/**
 * Una fecha para la que no hubo sala libre (RF-22, D-05), con los horarios cercanos en los
 * que sí la habría. Las sugerencias no son una reserva: son una pista para volver a pedirlo.
 */
export interface ConflictoDeSala {
  fecha: string;
  inicio: string;
  sugerencias: string[];
}

/**
 * Resultado de programar. El alta es todo o nada: si una sola fecha no tiene sala, `sin_sala`
 * trae el detalle y no se creó ninguna.
 */
export type ResultadoProgramacion =
  | { estado: 'creadas'; creadas: FuncionCreada[] }
  | { estado: 'sin_sala'; conflictos: ConflictoDeSala[] }
  | { estado: 'error'; mensaje: string };

export type ResultadoModificacion =
  | { estado: 'modificada'; sala: string }
  | { estado: 'sin_sala'; conflictos: ConflictoDeSala[] }
  | { estado: 'error'; mensaje: string };
