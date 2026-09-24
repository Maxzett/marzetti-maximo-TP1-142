import { desdeIso } from '../../shared/selector-fecha/fechas';

/**
 * Edad cumplida en una fecha dada, ambas 'AAAA-MM-DD'. Null si alguna no es una fecha válida.
 * Es la misma cuenta que hace la base con age(): se mide a la fecha de la FUNCIÓN y no a la de
 * hoy (RN-04), así quien cumple 13 el mismo día puede entrar. Acá solo adelanta el aviso en
 * la pantalla; el que rechaza de verdad es crear_orden.
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

/** RN-04: sin fecha declarada o con una edad menor a la restricción, no se puede comprar */
export function puedeComprar(
  restriccion: 0 | 13 | 18,
  nacimiento: string | null,
  diaDeLaFuncion: string,
): boolean {
  if (restriccion === 0) {
    return true;
  }

  const edad = nacimiento ? edadALaFecha(nacimiento, diaDeLaFuncion) : null;
  return edad !== null && edad >= restriccion;
}
