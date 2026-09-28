import { DiaDeFacturacion } from '../models/reportes';
import { formatearLargo } from '../../shared/selector-fecha/fechas';

/**
 * El reporte de facturación (RF-57) en la forma que lo usan la pantalla y las dos
 * exportaciones (RF-58). Una sola fuente para las columnas: la tabla, el PDF y el Excel
 * dicen lo mismo en el mismo orden, y nadie suma los totales por su cuenta.
 *
 * Solo lleva cifras agregadas por día: ni mails ni nombres de clientes, y nada de
 * perfiles_sensibles (RNF-11). Un archivo exportado sale del sistema y no se puede recuperar.
 */

export type TotalesDeFacturacion = Omit<DiaDeFacturacion, 'dia'>;

/** Columnas del reporte. `dinero` decide el formato: pesos o cantidad */
export const COLUMNAS_DE_FACTURACION: readonly {
  clave: keyof TotalesDeFacturacion;
  titulo: string;
  dinero: boolean;
}[] = [
  { clave: 'ordenes', titulo: 'Órdenes', dinero: false },
  { clave: 'entradas', titulo: 'Entradas', dinero: false },
  { clave: 'cobrado', titulo: 'Cobrado', dinero: true },
  { clave: 'credito', titulo: 'Pagado con crédito', dinero: true },
  { clave: 'descuentos', titulo: 'Descuentos', dinero: true },
  { clave: 'canceladas', titulo: 'Canceladas', dinero: false },
];

export function totalesDeFacturacion(dias: readonly DiaDeFacturacion[]): TotalesDeFacturacion {
  const totales: TotalesDeFacturacion = {
    ordenes: 0,
    entradas: 0,
    cobrado: 0,
    credito: 0,
    descuentos: 0,
    canceladas: 0,
  };

  for (const dia of dias) {
    for (const { clave } of COLUMNAS_DE_FACTURACION) {
      totales[clave] += dia[clave];
    }
  }

  // Los montos son numeric(10, 2): sumar en coma flotante deja colas como 0,30000000000000004
  totales.cobrado = redondear(totales.cobrado);
  totales.credito = redondear(totales.credito);
  totales.descuentos = redondear(totales.descuentos);

  return totales;
}

/** "del 21 al 27/09/2026", para el título de los archivos y de la tabla */
export function describirRango(desde: string, hasta: string): string {
  return desde === hasta
    ? formatearLargo(desde)
    : `del ${formatearLargo(desde)} al ${formatearLargo(hasta)}`;
}

/** "facturacion_2026-09-21_2026-09-27": sin espacios ni tildes, así lo acepta cualquier sistema */
export function nombreDelArchivo(desde: string, hasta: string): string {
  return `facturacion_${desde}_${hasta}`;
}

/** "27/09/2026": el día como se escribe en una planilla argentina */
export function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

function redondear(importe: number): number {
  return Math.round(importe * 100) / 100;
}
