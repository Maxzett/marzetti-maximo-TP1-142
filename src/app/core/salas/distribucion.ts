import { Butaca, TIPOS_DE_UBICACION, TipoUbicacion } from '../models/sala';

/** Una fila del mapa: el tipo de ubicación es el mismo en todas sus butacas (RF-13 a RF-15) */
export interface FilaMapa {
  fila: string;
  tipo: TipoUbicacion;
  /** Los tres bloques de la fila, separados por los dos pasillos, de izquierda a derecha */
  bloques: Butaca[][];
}

export type ConteoPorTipo = Record<TipoUbicacion, number> & { total: number };

/** Texto de cada tipo: lo usan la leyenda, el resumen accesible y las pantallas de admin */
export const NOMBRE_DE_TIPO: Record<TipoUbicacion, string> = {
  estandar: 'Estándar',
  silla_ruedas: 'Silla de ruedas',
  vip: 'VIP',
};

/**
 * Ordena las butacas como se dibujan: por fila de la A a la T, y dentro de cada fila en sus
 * tres bloques. La base las devuelve en cualquier orden, así que no se puede dibujar tal cual.
 *
 * Las filas J y K tienen bloques de 2, 10 y 2 y las demás de 4, 20 y 4 (D-01): el mapa no lo
 * asume, agrupa por la columna que trae cada butaca, así que una distribución distinta se
 * dibujaría bien sin tocar esta función.
 */
export function armarMapa(butacas: readonly Butaca[]): FilaMapa[] {
  const porFila = new Map<string, Butaca[]>();

  for (const butaca of butacas) {
    const grupo = porFila.get(butaca.fila);

    if (grupo) {
      grupo.push(butaca);
    } else {
      porFila.set(butaca.fila, [butaca]);
    }
  }

  return [...porFila.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fila, deLaFila]) => {
      const bloques: Butaca[][] = [[], [], []];

      for (const butaca of deLaFila) {
        // Una columna fuera de 1 a 3 no existe en la base (CHECK), pero si llegara igual no
        // debe tirar el mapa entero: se ubica en el bloque más cercano.
        const indice = Math.min(2, Math.max(0, butaca.columna - 1));
        bloques[indice].push(butaca);
      }

      for (const bloque of bloques) {
        bloque.sort((a, b) => a.numero - b.numero);
      }

      return { fila, tipo: deLaFila[0].tipo, bloques };
    });
}

/** Cuántas ubicaciones hay de cada tipo. Para la sala estándar: 420, 28 y 84, en total 532 */
export function contarPorTipo(butacas: readonly Butaca[]): ConteoPorTipo {
  const conteo: ConteoPorTipo = { estandar: 0, silla_ruedas: 0, vip: 0, total: 0 };

  for (const butaca of butacas) {
    if (TIPOS_DE_UBICACION.includes(butaca.tipo)) {
      conteo[butaca.tipo] += 1;
      conteo.total += 1;
    }
  }

  return conteo;
}
