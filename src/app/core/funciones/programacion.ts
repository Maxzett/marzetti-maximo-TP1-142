import { desdeIso, esIsoValida, sumarDias } from '../../shared/selector-fecha/fechas';

/**
 * Cálculos de la programación de funciones (RF-19 a RF-23).
 *
 * Todo se calcula en la hora del cine. El servidor corre en UTC y el navegador puede estar en
 * cualquier zona: una función "a las 18:00" es a las 18:00 de Buenos Aires para el que
 * programa, para el que compra y para el empleado que la valida. Por eso las horas se
 * formatean con la zona explícita y nunca con la del navegador.
 */

export const ZONA_DEL_CINE = 'America/Argentina/Buenos_Aires';

/**
 * Buenos Aires es UTC-3 todo el año: Argentina no usa horario de verano desde 2009. Se fija
 * acá, en un solo lugar, para armar el instante de una función a partir de fecha y hora.
 */
const DESFASE_DEL_CINE = '-03:00';

/** RN-01: minutos que la sala queda ocupada después de terminar la película */
export const MINUTOS_DE_SEPARACION = 30;

/** Los días de la semana como los numera ISO 8601 y como los recibe la base: 1 = lunes … 7 = domingo */
export const DIAS_DE_LA_SEMANA: readonly { numero: number; corto: string; largo: string }[] = [
  { numero: 1, corto: 'Lun', largo: 'Lunes' },
  { numero: 2, corto: 'Mar', largo: 'Martes' },
  { numero: 3, corto: 'Mié', largo: 'Miércoles' },
  { numero: 4, corto: 'Jue', largo: 'Jueves' },
  { numero: 5, corto: 'Vie', largo: 'Viernes' },
  { numero: 6, corto: 'Sáb', largo: 'Sábado' },
  { numero: 7, corto: 'Dom', largo: 'Domingo' },
];

/** El mismo tope que aplica la base a un período: un año más un día, ambos extremos incluidos */
const MAXIMO_DE_DIAS = 367;

/** Día de la semana de una fecha 'AAAA-MM-DD', de 1 (lunes) a 7 (domingo). Null si no es una fecha */
export function diaDeLaSemana(iso: string): number | null {
  const fecha = desdeIso(iso);

  if (!fecha) {
    return null;
  }

  // getUTCDay() da 0 para el domingo; ISO lo cuenta como el 7
  const dia = new Date(Date.UTC(fecha.anio, fecha.mes, fecha.dia)).getUTCDay();
  return dia === 0 ? 7 : dia;
}

/**
 * Las fechas en las que caería una programación: cada día del período que pertenece a uno de
 * los días elegidos. Es lo que la pantalla muestra como "se van a crear N funciones" antes de
 * enviar; la que decide de verdad es la base, que cuenta lo mismo.
 */
export function fechasDeProgramacion(
  desde: string,
  hasta: string,
  dias: readonly number[],
): string[] {
  if (!esIsoValida(desde) || !esIsoValida(hasta) || hasta < desde || dias.length === 0) {
    return [];
  }

  const fechas: string[] = [];
  let actual = desde;

  for (let vuelta = 0; actual <= hasta && vuelta < MAXIMO_DE_DIAS; vuelta++) {
    const dia = diaDeLaSemana(actual);

    if (dia !== null && dias.includes(dia)) {
      fechas.push(actual);
    }

    actual = sumarDias(actual, 1);
  }

  return fechas;
}

/**
 * Hasta qué hora ocupa una función la sala, con los 30 minutos de separación (RN-01).
 * `diaSiguiente` avisa que la función termina pasada la medianoche: 23:00 con una película de
 * dos horas es la 01:30 del día siguiente, y sin el aviso parecería que termina antes de empezar.
 */
export function finDeOcupacion(
  hora: string,
  duracionMinutos: number,
): { hora: string; diaSiguiente: boolean } | null {
  const partes = /^(\d{2}):(\d{2})$/.exec(hora);

  if (!partes) {
    return null;
  }

  const inicio = Number(partes[1]) * 60 + Number(partes[2]);
  const fin = inicio + duracionMinutos + MINUTOS_DE_SEPARACION;
  const dentroDelDia = fin % (24 * 60);

  return {
    hora: `${String(Math.floor(dentroDelDia / 60)).padStart(2, '0')}:${String(dentroDelDia % 60).padStart(2, '0')}`,
    diaSiguiente: fin >= 24 * 60,
  };
}

/** Partes de un instante en la hora del cine. Intl es lo único que sabe de zonas horarias */
function partesLocales(iso: string): Record<string, string> | null {
  const instante = new Date(iso);

  if (Number.isNaN(instante.getTime())) {
    return null;
  }

  const formato = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA_DEL_CINE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // h23 y no hour12: false, que en algunos motores escribe la medianoche como "24:00"
    hourCycle: 'h23',
  });

  return Object.fromEntries(
    formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );
}

/** 'HH:MM' de un instante, en la hora del cine. Vacío si el texto no es una fecha */
export function horaLocal(iso: string): string {
  const partes = partesLocales(iso);
  return partes ? `${partes['hour']}:${partes['minute']}` : '';
}

/** 'AAAA-MM-DD' de un instante, en la fecha del cine. Vacío si el texto no es una fecha */
export function fechaLocal(iso: string): string {
  const partes = partesLocales(iso);
  return partes ? `${partes['year']}-${partes['month']}-${partes['day']}` : '';
}

/** El instante de una función a partir de la fecha y la hora del cine, listo para mandar a la base */
export function instanteDeFuncion(fecha: string, hora: string): string {
  return `${fecha}T${hora}:00${DESFASE_DEL_CINE}`;
}

/** "vie 25/09 · 18:00": cómo se lee un horario en las listas y en las sugerencias */
export function describirInicio(iso: string): string {
  const fecha = fechaLocal(iso);
  const dia = diaDeLaSemana(fecha);

  if (!fecha || dia === null) {
    return '';
  }

  const corto = DIAS_DE_LA_SEMANA[dia - 1].corto.toLowerCase();
  const [, mes, numero] = fecha.split('-');

  return `${corto} ${numero}/${mes} · ${horaLocal(iso)}`;
}
