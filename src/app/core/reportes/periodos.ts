import { fechaLocal } from '../funciones/programacion';
import { Periodo } from '../models/reportes';
import { desdeIso, nombreMes, sumarDias, sumarMeses } from '../../shared/selector-fecha/fechas';

/**
 * Semanas y meses del gráfico de películas más vistas (RF-59).
 *
 * La semana es la ISO, de lunes a domingo, que es la que usa date_trunc('week') en la base:
 * si el cliente y la base contaran semanas distintas, el rótulo diría un período y las barras
 * serían de otro. Todo en texto 'AAAA-MM-DD', igual que el selector de fecha.
 */

/** Hoy en la fecha del cine, no en la del navegador: el reporte es del cine */
export function hoyEnElCine(ahora: Date = new Date()): string {
  return fechaLocal(ahora.toISOString());
}

/** Primer día del período que contiene la fecha: el lunes de su semana o el 1 de su mes */
export function inicioDelPeriodo(periodo: Periodo, iso: string): string {
  const fecha = desdeIso(iso);

  if (!fecha) {
    return iso;
  }

  if (periodo === 'mes') {
    return iso.slice(0, 8) + '01';
  }

  // getUTCDay(): 0 = domingo. Hasta el lunes anterior hay (dia + 6) % 7 días
  const dia = new Date(Date.UTC(fecha.anio, fecha.mes, fecha.dia)).getUTCDay();
  return sumarDias(iso, -((dia + 6) % 7));
}

/** Último día del período, incluido */
export function finDelPeriodo(periodo: Periodo, iso: string): string {
  const inicio = inicioDelPeriodo(periodo, iso);
  return periodo === 'semana' ? sumarDias(inicio, 6) : sumarDias(sumarMeses(inicio, 1), -1);
}

/** El período anterior (pasos < 0) o siguiente (pasos > 0), representado por su primer día */
export function moverPeriodo(periodo: Periodo, iso: string, pasos: number): string {
  const inicio = inicioDelPeriodo(periodo, iso);
  return periodo === 'semana' ? sumarDias(inicio, 7 * pasos) : sumarMeses(inicio, pasos);
}

/**
 * "Semana del 21 al 27 de septiembre de 2026", "Semana del 28 de septiembre al 4 de octubre
 * de 2026" o "Septiembre de 2026". Es el rótulo del gráfico y el nombre de la tabla para
 * lectores de pantalla, así que dice el período completo y no un número de semana.
 */
export function describirPeriodo(periodo: Periodo, iso: string): string {
  const inicio = desdeIso(inicioDelPeriodo(periodo, iso));
  const fin = desdeIso(finDelPeriodo(periodo, iso));

  if (!inicio || !fin) {
    return '';
  }

  if (periodo === 'mes') {
    const mes = nombreMes(inicio.mes);
    return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} de ${inicio.anio}`;
  }

  const desde =
    inicio.anio !== fin.anio
      ? `${inicio.dia} de ${nombreMes(inicio.mes)} de ${inicio.anio}`
      : inicio.mes !== fin.mes
        ? `${inicio.dia} de ${nombreMes(inicio.mes)}`
        : `${inicio.dia}`;

  return `Semana del ${desde} al ${fin.dia} de ${nombreMes(fin.mes)} de ${fin.anio}`;
}
