import { describirInicio } from '../funciones/programacion';
import { UsoDeTramo } from '../models/validacion';

/**
 * El código de una orden: 20 caracteres hexadecimales en mayúscula, tomados de un UUID
 * (migración 0020). Es lo que lleva el QR y lo que se tipea a mano si el lector falla (RF-53).
 */
const FORMATO_DEL_CODIGO = /^[0-9A-F]{20}$/;

/**
 * Deja el código como lo guarda la base. Quien lo tipea a mano lo dicta de a grupos ("8EED
 * B649 ...") o con guiones, en minúscula; y si alguna vez el QR trae la dirección de la entrada
 * en lugar del código solo, se toma lo que va después de /entrada/.
 */
export function normalizarCodigo(texto: string): string {
  const enlace = /\/entrada\/([^/?#\s]+)/i.exec(texto);
  const codigo = enlace ? enlace[1] : texto;

  return codigo.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Si vale la pena preguntarle a la base. No valida nada de verdad —eso lo hace la base—, solo
 * evita una vuelta de red con un código al que le falta una letra y da un error más preciso.
 */
export function esCodigoValido(codigo: string): boolean {
  return FORMATO_DEL_CODIGO.test(codigo);
}

/**
 * "Usado el sáb 27/09 · 21:40 por Ana G.": lo que RN-05 pide mostrar ante un segundo intento.
 * Es una oración completa, con su punto: el nombre ya termina en punto por la inicial, y
 * agregarle otro afuera escribiría "Ana G..".
 */
export function describirUso(uso: UsoDeTramo): string {
  if (!uso.usado_at) {
    return '';
  }

  const cuando = describirInicio(uso.usado_at);
  const oracion = uso.usado_por ? `Usado el ${cuando} por ${uso.usado_por}` : `Usado el ${cuando}`;

  return oracion.endsWith('.') ? oracion : `${oracion}.`;
}
