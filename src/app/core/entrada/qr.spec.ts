import { qrComoImagen } from './qr';

describe('qrComoImagen', () => {
  it('devuelve un PNG en data URL', async () => {
    const imagen = await qrComoImagen('8EEDB649A1B646698A52');

    expect(imagen.startsWith('data:image/png;base64,')).toBe(true);
  });
});
