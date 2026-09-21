/**
 * Traduce un error de la base a un mensaje para la administración.
 *
 * Las funciones de la migración 0019 lanzan sus errores con un SQLSTATE propio y un mensaje ya
 * redactado en español para quien administra, así que en esos casos el texto se muestra tal
 * cual: es más preciso que cualquier frase genérica ("La función tiene entradas vendidas")
 * y vive junto a la regla que lo provoca, no duplicado acá.
 *
 * Lo que no sea un error previsto no se muestra crudo: un "permission denied for table" o un
 * stack de Postgres no le dice nada a quien está programando funciones.
 */

/** Errores que la base lanza a propósito, con mensaje pensado para mostrarse */
const CON_MENSAJE_PROPIO = new Set([
  '22023', // parámetro inválido
  'P0002', // la fila no existe
  '55000', // el estado actual no admite la operación
]);

export interface ErrorDeBase {
  code?: string;
  message: string;
}

export function mensajeDeError(error: ErrorDeBase): string {
  const codigo = error.code ?? '';

  if (CON_MENSAJE_PROPIO.has(codigo)) {
    return error.message;
  }

  switch (codigo) {
    case '42501':
      // Es lo que devuelve el chequeo de rol de las funciones, y también la ausencia de GRANT
      return 'No tenés permiso para hacer esto: es una tarea de la administración.';
    case '23P01':
      // La constraint de no solapamiento (0006). El algoritmo la evita; llegar acá significa
      // que otra alta ganó la carrera por la misma sala entre la búsqueda y la escritura.
      return 'Esa sala se ocupó justo ahora en ese horario. Probá de nuevo.';
    case '23505':
      return 'Ya existe una sala con ese nombre.';
    default:
      return 'No pudimos completar la operación. Probá de nuevo.';
  }
}
