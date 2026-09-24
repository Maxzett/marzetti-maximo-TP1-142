import { fechaLocal, horaLocal } from '../funciones/programacion';
import { Funcion } from '../models/sala';

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
  return `${funcion.formato} · ${funcion.idioma === 'castellano' ? 'Castellano' : 'Subtitulada'}`;
}
