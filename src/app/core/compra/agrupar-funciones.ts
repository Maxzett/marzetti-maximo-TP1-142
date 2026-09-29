import { sumarDias } from '../../shared/selector-fecha/fechas';
import { fechaLocal, horaLocal } from '../funciones/programacion';
import {
  FORMATOS_DE_FUNCION,
  FormatoFuncion,
  Funcion,
  IDIOMAS_DE_FUNCION,
  IdiomaFuncion,
} from '../models/sala';

/**
 * Cuántos días hacia adelante se ofrecen para comprar: hoy y los siete siguientes (hoy 29/09,
 * hasta el 06/10). Es la cartelera de la semana, como la publica un cine, aunque la programación
 * cargada llegue más lejos. Coincide con la preventa, que abre siete días antes del estreno: el
 * día que abre, el estreno ya entra en la ventana.
 */
export const DIAS_A_LA_VISTA = 7;

/** Las funciones de hoy a `DIAS_A_LA_VISTA` días, en la fecha del cine */
export function funcionesALaVista(funciones: readonly Funcion[], hoy: string): Funcion[] {
  const hasta = sumarDias(hoy, DIAS_A_LA_VISTA);
  return funciones.filter((f) => fechaLocal(f.inicio) <= hasta);
}

/** Lo que el espectador filtra: null es "cualquiera" */
export interface FiltroDeVersion {
  formato: FormatoFuncion | null;
  idioma: IdiomaFuncion | null;
}

export function filtrarPorVersion(
  funciones: readonly Funcion[],
  filtro: FiltroDeVersion,
): Funcion[] {
  return funciones.filter(
    (f) =>
      (filtro.formato === null || f.formato === filtro.formato) &&
      (filtro.idioma === null || f.idioma === filtro.idioma),
  );
}

/** Los formatos que hay, en el orden de siempre (2D, 3D, 4D…) y no en el que llegaron */
export function formatosDisponibles(funciones: readonly Funcion[]): FormatoFuncion[] {
  return FORMATOS_DE_FUNCION.filter((formato) => funciones.some((f) => f.formato === formato));
}

export function idiomasDisponibles(funciones: readonly Funcion[]): IdiomaFuncion[] {
  return IDIOMAS_DE_FUNCION.filter((idioma) => funciones.some((f) => f.idioma === idioma));
}

export function textoDeIdioma(idioma: IdiomaFuncion): string {
  return idioma === 'castellano' ? 'Castellano' : 'Subtitulada';
}

/** Los días con al menos una función, sin repetir y en orden: alimenta `fechasHabilitadas` */
export function diasConFunciones(funciones: readonly Funcion[]): string[] {
  return [...new Set(funciones.map((f) => fechaLocal(f.inicio)))].sort();
}

/** Las funciones de un día, por horario */
export function funcionesDelDia(funciones: readonly Funcion[], fecha: string): Funcion[] {
  return funciones
    .filter((f) => fechaLocal(f.inicio) === fecha)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Los horarios de un día sin repetir: alimenta `opciones` del selector de hora */
export function horasDelDia(funciones: readonly Funcion[], fecha: string): string[] {
  return [...new Set(funcionesDelDia(funciones, fecha).map((f) => horaLocal(f.inicio)))];
}

/**
 * Las funciones de un horario. Puede haber más de una a la misma hora en salas distintas, y
 * en ese caso se distinguen por formato e idioma (describirVersion), que es lo que el
 * espectador elige: la sala la asigna el cine (RF-21).
 */
export function funcionesEnHora(
  funciones: readonly Funcion[],
  fecha: string,
  hora: string,
): Funcion[] {
  return funcionesDelDia(funciones, fecha).filter((f) => horaLocal(f.inicio) === hora);
}

export function describirVersion(funcion: Pick<Funcion, 'formato' | 'idioma'>): string {
  return `${funcion.formato} · ${textoDeIdioma(funcion.idioma)}`;
}
