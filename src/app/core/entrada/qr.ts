/**
 * El código de la orden como imagen QR (data URL PNG). La librería se importa recién acá, así
 * no entra en el bundle de quien todavía no llegó a ver su entrada.
 *
 * Nivel de corrección "M": tolera una entrada arrugada o una pantalla con reflejo, y sigue
 * siendo un QR chico que un lector de mano resuelve rápido.
 */
export async function qrComoImagen(codigo: string, ladoEnPixeles = 320): Promise<string> {
  const QRCode = await import('qrcode');

  return QRCode.toDataURL(codigo, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: ladoEnPixeles,
  });
}
