/**
 * Cálculos de fecha para el selector.
 *
 * Las fechas viajan como texto 'AAAA-MM-DD' y no como Date: un Date lleva hora y zona
 * horaria, y en Argentina (UTC-3) construir `new Date('2026-09-24')` da el 23 a las 21:00,
 * o sea el día anterior. Con texto eso no puede pasar, y además dos fechas se comparan con
 * < y > directamente porque el formato ordena igual que el calendario.
 *
 * Adentro se calcula en UTC por el mismo motivo: UTC no tiene horario de verano ni saltos.
 */

const LOCALE = 'es-AR';

export interface FechaSimple {
  anio: number;
  /** 0 = enero, como en Date */
  mes: number;
  dia: number;
}

export function aIso(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, '0')}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function desdeIso(iso: string): FechaSimple | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);

  if (!partes) {
    return null;
  }

  const anio = Number(partes[1]);
  const mes = Number(partes[2]) - 1;
  const dia = Number(partes[3]);
  const fecha = new Date(Date.UTC(anio, mes, dia));

  // Date corrige solo un 31 de febrero y devolvería el 3 de marzo: eso no es la fecha que escribieron
  const esReal =
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes && fecha.getUTCDate() === dia;

  return esReal ? { anio, mes, dia } : null;
}

export function esIsoValida(iso: string): boolean {
  return desdeIso(iso) !== null;
}

/** Hoy en la zona del navegador: "hoy" es un concepto local, no UTC */
export function hoyIso(): string {
  const ahora = new Date();
  return aIso(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

export function diasDelMes(anio: number, mes: number): number {
  // Día 0 del mes siguiente es el último del mes pedido
  return new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
}

/**
 * Cuántas celdas vacías van antes del día 1.
 * getUTCDay() devuelve 0 para domingo; acá la semana arranca el lunes, así que se rota.
 */
export function desplazamientoPrimerDia(anio: number, mes: number): number {
  return (new Date(Date.UTC(anio, mes, 1)).getUTCDay() + 6) % 7;
}

export function sumarDias(iso: string, dias: number): string {
  const fecha = desdeIso(iso);

  if (!fecha) {
    return iso;
  }

  const movida = new Date(Date.UTC(fecha.anio, fecha.mes, fecha.dia + dias));
  return aIso(movida.getUTCFullYear(), movida.getUTCMonth(), movida.getUTCDate());
}

/**
 * Suma meses conservando el día cuando se puede.
 * El 31 de enero más un mes no es el 3 de marzo: se recorta al 28 o 29 de febrero.
 */
export function sumarMeses(iso: string, meses: number): string {
  const fecha = desdeIso(iso);

  if (!fecha) {
    return iso;
  }

  const destino = new Date(Date.UTC(fecha.anio, fecha.mes + meses, 1));
  const anio = destino.getUTCFullYear();
  const mes = destino.getUTCMonth();

  return aIso(anio, mes, Math.min(fecha.dia, diasDelMes(anio, mes)));
}

/** Recorta una fecha al rango permitido. Comparar texto alcanza porque el formato ordena solo */
export function limitar(iso: string, minimo: string, maximo: string): string {
  if (minimo && iso < minimo) {
    return minimo;
  }

  if (maximo && iso > maximo) {
    return maximo;
  }

  return iso;
}

export function dentroDelRango(iso: string, minimo: string, maximo: string): boolean {
  return (!minimo || iso >= minimo) && (!maximo || iso <= maximo);
}

export function nombreMes(mes: number, estilo: 'long' | 'short' = 'long'): string {
  const formato = new Intl.DateTimeFormat(LOCALE, { month: estilo, timeZone: 'UTC' });
  return formato.format(new Date(Date.UTC(2020, mes, 1)));
}

/** Iniciales de lunes a domingo, con el nombre completo para el lector de pantalla */
export function diasDeLaSemana(): { corto: string; largo: string }[] {
  const corto = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', timeZone: 'UTC' });
  const largo = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: 'UTC' });

  // 5 de enero de 2026 fue lunes
  return Array.from({ length: 7 }, (_, indice) => {
    const dia = new Date(Date.UTC(2026, 0, 5 + indice));
    return { corto: corto.format(dia).replace('.', ''), largo: largo.format(dia) };
  });
}

/** "jueves, 24 de septiembre de 2026", para el resumen y para los lectores de pantalla */
export function formatearLargo(iso: string): string {
  const fecha = desdeIso(iso);

  if (!fecha) {
    return '';
  }

  const formato = new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return formato.format(new Date(Date.UTC(fecha.anio, fecha.mes, fecha.dia)));
}
