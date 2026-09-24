/**
 * El código de la orden como imagen QR (data URL PNG). La librería se importa recién acá, así
 * no entra en el bundle de quien todavía no llegó a ver su entrada.
 *
 * Nivel de corrección "M": tolera una entrada arrugada o una pantalla con reflejo, y sigue
 * siendo un QR chico que un lector de mano resuelve rápido.
 */
export async function qrComoImagen(codigo: string, ladoEnPixeles = 320): Promise<string> {
  const modulo = await import('qrcode');

  // `qrcode` es CommonJS. Al empaquetar para producción, esbuild lo expone como `default` y el
  // namespace queda sin `toDataURL`; en los tests (Vitest) las funciones sí están en el namespace.
  // Sin este desvío el QR falla solo en el build desplegado.
  const QRCode = modulo.default ?? modulo;

  return QRCode.toDataURL(codigo, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: ladoEnPixeles,
  });
}
