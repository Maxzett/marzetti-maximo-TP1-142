import { describirInicio } from '../funciones/programacion';
import { formatearPrecio } from '../formato/precio';
import { EntradaComprada } from '../models/orden';
import { NOMBRE_DE_TIPO } from '../salas/distribucion';

/**
 * Leyenda de RF-29: toda entrada de una película con restricción de edad lo dice impreso.
 * Sale de acá para que la pantalla y el PDF digan exactamente lo mismo.
 */
export function leyendaDeAcompanante(entrada: Pick<EntradaComprada, 'restriccion_edad'>): string {
  return entrada.restriccion_edad > 0
    ? `Película para mayores de ${entrada.restriccion_edad} años. El espectador debe ir acompañado por un adulto.`
    : '';
}

/** "A1, A2 y R5": las butacas como se leen en voz alta y se imprimen en una línea */
export function listarButacas(butacas: EntradaComprada['butacas']): string {
  const nombres = butacas.map((b) => `${b.fila}${b.numero}`);

  return nombres.length <= 1
    ? nombres.join('')
    : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/**
 * Los datos de la entrada como pares rótulo/valor, en el orden en que se leen. La pantalla los
 * muestra en una lista y el PDF los imprime línea por línea: una sola fuente para las dos.
 */
export function datosDeLaEntrada(entrada: EntradaComprada): { rotulo: string; valor: string }[] {
  return [
    { rotulo: 'Película', valor: entrada.pelicula },
    {
      rotulo: 'Función',
      valor: `${describirInicio(entrada.inicio)} · ${entrada.formato} · ${entrada.idioma}`,
    },
    { rotulo: 'Sala', valor: entrada.sala },
    { rotulo: 'Butacas', valor: listarButacas(entrada.butacas) },
    ...entrada.butacas
      .filter((b) => b.tipo !== 'estandar')
      .map((b) => ({
        rotulo: `${b.fila}${b.numero}`,
        valor: `${NOMBRE_DE_TIPO[b.tipo]} · ${formatearPrecio(b.precio)}`,
      })),
    { rotulo: 'Total', valor: formatearPrecio(entrada.total) },
  ];
}

/** Nombre del archivo descargado: el código lo identifica y no lleva caracteres raros */
export function nombreDelPdf(entrada: Pick<EntradaComprada, 'codigo'>): string {
  return `entrada-${entrada.codigo.toLowerCase()}.pdf`;
}
