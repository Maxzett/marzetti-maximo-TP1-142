import { EntradaComprada } from '../models/orden';
import { datosDeLaEntrada, leyendaDeAcompanante } from './entrada';

/**
 * Genera el PDF de la entrada (RF-27) con los datos, el código QR y, si corresponde, la leyenda
 * de adulto acompañante (RF-29). Se arma en el navegador: no hay servidor que lo haga.
 *
 * jsPDF pesa bastante y solo hace falta al descargar, así que se importa recién ahí: quien compra
 * y mira su entrada en pantalla no lo descarga hasta que toca el botón.
 *
 * El QR contiene solo el código de la orden. Ese código es lo que el empleado escanea o tipea
 * (RF-51, RF-53) y lo que la base valida: los datos del PDF son para leer, no para confiar.
 */
export async function generarPdf(entrada: EntradaComprada, qr: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  // Tamaño de una entrada (ancho de un ticket), no de una hoja A4 con casi todo en blanco
  const doc = new jsPDF({ unit: 'mm', format: [90, 170] });
  const margen = 8;
  const ancho = 90 - margen * 2;
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('CINE EMEZETA', 45, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Entrada', 45, y, { align: 'center' });
  y += 4;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margen, y, 90 - margen, y);
  y += 6;

  for (const dato of datosDeLaEntrada(entrada)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(dato.rotulo.toUpperCase(), margen, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    for (const linea of doc.splitTextToSize(dato.valor, ancho) as string[]) {
      doc.text(linea, margen, y);
      y += 4.5;
    }

    y += 1.5;
  }

  const leyenda = leyendaDeAcompanante(entrada);

  if (leyenda) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    for (const linea of doc.splitTextToSize(leyenda, ancho) as string[]) {
      doc.text(linea, margen, y);
      y += 4.5;
    }

    y += 2;
  }

  doc.line(margen, y, 90 - margen, y);
  y += 4;

  const lado = 50;
  doc.addImage(qr, 'PNG', (90 - lado) / 2, y, lado, lado);
  y += lado + 6;

  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.text(entrada.codigo, 45, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Mostrá este código en la puerta. Sirve una sola vez para entrar.', 45, y, {
    align: 'center',
    maxWidth: ancho,
  });

  return doc.output('blob');
}
