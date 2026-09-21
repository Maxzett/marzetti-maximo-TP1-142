import { Butaca, TipoUbicacion } from '../models/sala';

/**
 * Una sala con la distribución real de la base (RF-12 a RF-15, D-01), armada en memoria.
 * No se usa en la aplicación: sirve para los tests y para el catálogo vivo `/sistema`, que
 * necesitan un mapa completo sin depender de que haya un proyecto de Supabase detrás.
 *
 *   A–I y L–Q  estándar      4 + 20 + 4 = 28   × 15 filas = 420
 *   J y K      silla_ruedas  2 + 10 + 2 = 14   ×  2 filas =  28
 *   R, S, T    vip           4 + 20 + 4 = 28   ×  3 filas =  84
 */
export function salaDeMuestra(): Butaca[] {
  const butacas: Butaca[] = [];

  for (let indice = 0; indice < 20; indice++) {
    const fila = String.fromCharCode(65 + indice);
    const tipo: TipoUbicacion =
      fila === 'J' || fila === 'K' ? 'silla_ruedas' : indice >= 17 ? 'vip' : 'estandar';
    const bloques = tipo === 'silla_ruedas' ? [2, 10, 2] : [4, 20, 4];
    let numero = 1;

    bloques.forEach((cantidad, posicion) => {
      for (let i = 0; i < cantidad; i++) {
        butacas.push({ id: `${fila}${numero}`, fila, columna: posicion + 1, numero, tipo });
        numero += 1;
      }
    });
  }

  return butacas;
}
