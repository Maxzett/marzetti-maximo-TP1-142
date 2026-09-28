import { desdeIso } from '../../shared/selector-fecha/fechas';

/**
 * RN-04 revisada: quien no tiene la edad de la película puede comprar si va con un adulto, y eso
 * se pide como un mínimo de entradas en la misma compra (la suya y la de quien lo acompaña).
 */
export const MINIMO_CON_ACOMPANANTE = 2;

/**
 * Edad cumplida en una fecha dada, ambas 'AAAA-MM-DD'. Null si alguna no es una fecha válida.
 * Es la misma cuenta que hace la base con age(): se mide a la fecha de la FUNCIÓN y no a la de
 * hoy (RN-04), así quien cumple 13 el mismo día puede entrar.
 */
export function edadALaFecha(nacimiento: string, fecha: string): number | null {
  const n = desdeIso(nacimiento);
  const f = desdeIso(fecha);

  if (!n || !f) {
    return null;
  }

  const cumplioEsteAnio = f.mes > n.mes || (f.mes === n.mes && f.dia >= n.dia);
  return f.anio - n.anio - (cumplioEsteAnio ? 0 : 1);
}

/**
 * Con cuenta: si la persona no llega a la edad de la película el día de la función. Sin fecha
 * válida se la trata como menor, que es lo prudente: la base tampoco la deja pasar.
 */
export function esMenorParaLaFuncion(
  restriccion: 0 | 13 | 18,
  nacimiento: string | null,
  diaDeLaFuncion: string,
): boolean {
  if (restriccion === 0) {
    return false;
  }

  const edad = nacimiento ? edadALaFecha(nacimiento, diaDeLaFuncion) : null;
  return edad === null || edad < restriccion;
}

/** Lo que impide seguir con la compra por la edad, o null si nada lo impide */
export type MotivoDeEdad = 'sin_declarar' | 'minimo_dos';

/**
 * La regla entera en un solo lugar. `menor` es true si va con un adulto, false si tiene la
 * edad, y null si todavía no se sabe: la compra anónima que no firmó ninguna de las dos casillas
 * (D-02). Acá solo adelanta el aviso en la pantalla; el que rechaza de verdad es crear_orden.
 */
export function motivoDeEdad(
  restriccion: 0 | 13 | 18,
  cantidad: number,
  menor: boolean | null,
): MotivoDeEdad | null {
  if (restriccion === 0) {
    return null;
  }

  if (menor === null) {
    return 'sin_declarar';
  }

  return menor && cantidad < MINIMO_CON_ACOMPANANTE ? 'minimo_dos' : null;
}
