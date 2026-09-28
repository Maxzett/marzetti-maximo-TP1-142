import { formatearPrecio } from '../formato/precio';
import { DiaDeFacturacion } from '../models/reportes';
import {
  COLUMNAS_DE_FACTURACION,
  describirRango,
  fechaCorta,
  totalesDeFacturacion,
} from './facturacion';

/**
 * Exportación del reporte de facturación a PDF y a Excel (RF-58), armada en el navegador como
 * el PDF de la entrada: no hay servidor que genere archivos.
 *
 * jsPDF y SheetJS se importan recién al exportar. Son las dos dependencias más pesadas del
 * proyecto y el admin puede mirar el reporte en pantalla sin descargar ninguna de las dos.
 *
 * El Excel lleva los montos como números y no como texto: quien lo abre tiene que poder sumar,
 * filtrar y graficar sin convertir nada. El formato de pesos es el de la celda, no el del valor.
 */

export async function generarPdfFacturacion(
  dias: readonly DiaDeFacturacion[],
  desde: string,
  hasta: string,
  generado: Date = new Date(),
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margen = 15;
  const derecha = 210 - margen;
  const anchoDia = 36;
  const anchoColumna = (derecha - margen - anchoDia) / COLUMNAS_DE_FACTURACION.length;
  const altoFila = 7;
  let y = 20;

  // Borde derecho de cada columna numérica: los números se alinean a la derecha
  const bordeDe = (indice: number) => margen + anchoDia + anchoColumna * (indice + 1) - 2;

  const cabecera = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('DÍA', margen + 2, y);
    COLUMNAS_DE_FACTURACION.forEach((columna, i) =>
      doc.text(columna.titulo.toUpperCase(), bordeDe(i), y, { align: 'right' }),
    );
    y += 2;
    doc.setLineWidth(0.4);
    doc.line(margen, y, derecha, y);
    y += altoFila - 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  };

  const fila = (
    rotulo: string,
    valores: DiaDeFacturacion | ReturnType<typeof totalesDeFacturacion>,
  ) => {
    doc.text(rotulo, margen + 2, y);
    COLUMNAS_DE_FACTURACION.forEach((columna, i) => {
      const valor = valores[columna.clave];
      doc.text(columna.dinero ? formatearPrecio(valor) : String(valor), bordeDe(i), y, {
        align: 'right',
      });
    });
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CINE EMEZETA', margen, y);
  y += 7;
  doc.setFontSize(12);
  doc.text('Reporte de facturación', margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Período: ${describirRango(desde, hasta)}`, margen, y);
  y += 5;
  doc.text(
    `Generado el ${generado.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`,
    margen,
    y,
  );
  y += 10;

  cabecera();

  for (const dia of dias) {
    // Una fila más el total tienen que entrar antes del pie: si no, página nueva con su cabecera
    if (y > 297 - margen - altoFila * 2) {
      doc.addPage();
      y = 20;
      cabecera();
    }

    fila(fechaCorta(dia.dia), dia);
    y += altoFila;
  }

  doc.setLineWidth(0.4);
  doc.line(margen, y - altoFila + 2, derecha, y - altoFila + 2);
  y += 1;
  doc.setFont('helvetica', 'bold');
  fila('TOTAL', totalesDeFacturacion(dias));
  y += altoFila * 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const notas = [
    'Cobrado: lo que entró por el medio de pago. Incluye las compras canceladas después, porque la cancelación no devuelve dinero: acredita crédito.',
    'Pagado con crédito: ya se había cobrado en la compra que originó el crédito, por eso no se suma a Cobrado.',
    'Entradas: las de compras vigentes. Una cancelación libera la butaca.',
  ];
  for (const nota of notas) {
    for (const linea of doc.splitTextToSize(nota, derecha - margen) as string[]) {
      doc.text(linea, margen, y);
      y += 3.8;
    }
  }

  return doc.output('blob');
}

export async function generarExcelFacturacion(
  dias: readonly DiaDeFacturacion[],
  desde: string,
  hasta: string,
): Promise<Blob> {
  const XLSX = await import('xlsx');

  const totales = totalesDeFacturacion(dias);
  const filas: (string | number)[][] = [
    ['Día', ...COLUMNAS_DE_FACTURACION.map((columna) => columna.titulo)],
    ...dias.map((dia) => [
      fechaCorta(dia.dia),
      ...COLUMNAS_DE_FACTURACION.map((c) => dia[c.clave]),
    ]),
    ['Total', ...COLUMNAS_DE_FACTURACION.map((c) => totales[c.clave])],
  ];

  const hoja = XLSX.utils.aoa_to_sheet(filas);

  // Formato de pesos en las celdas de dinero: el valor sigue siendo un número
  COLUMNAS_DE_FACTURACION.forEach((columna, i) => {
    if (!columna.dinero) {
      return;
    }

    for (let fila = 1; fila < filas.length; fila++) {
      const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: i + 1 })];
      if (celda) {
        celda.z = '"$" #,##0.00';
      }
    }
  });

  hoja['!cols'] = [{ wch: 12 }, ...COLUMNAS_DE_FACTURACION.map(() => ({ wch: 18 }))];

  const libro = XLSX.utils.book_new();
  libro.Props = { Title: `Facturación ${describirRango(desde, hasta)}`, Author: 'Cine Emezeta' };
  XLSX.utils.book_append_sheet(libro, hoja, 'Facturación');

  const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

  return new Blob([datos], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Descarga un archivo generado en el navegador, con el mismo enlace temporal que la entrada */
export function descargarArchivo(archivo: Blob, nombre: string): void {
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
