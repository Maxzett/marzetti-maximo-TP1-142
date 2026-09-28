import { crearLectorQr } from './lector-qr';

type ConDetector = { BarcodeDetector?: unknown };

function instalarDetector(formatos: string[], leidos: string[]) {
  const detect = vi.fn(async () => leidos.map((rawValue) => ({ rawValue })));

  class DetectorFalso {
    static getSupportedFormats = async () => formatos;
    readonly opciones: unknown;
    constructor(opciones: unknown) {
      this.opciones = opciones;
    }
    detect = detect;
  }

  (globalThis as ConDetector).BarcodeDetector = DetectorFalso;
  return detect;
}

describe('crearLectorQr', () => {
  afterEach(() => {
    delete (globalThis as ConDetector).BarcodeDetector;
    vi.restoreAllMocks();
  });

  it('usa el detector nativo cuando el navegador lo trae y lee QR', async () => {
    const detect = instalarDetector(['ean_13', 'qr_code'], ['8EEDB649A1B646698A52']);
    const video = document.createElement('video');

    const lector = await crearLectorQr();

    expect(await lector.leer(video)).toBe('8EEDB649A1B646698A52');
    expect(detect).toHaveBeenCalledWith(video);
  });

  it('con el detector nativo, un cuadro sin QR es null', async () => {
    instalarDetector(['qr_code'], []);

    expect(await (await crearLectorQr()).leer(document.createElement('video'))).toBeNull();
  });

  it('si el detector nativo no lee QR, cae en jsQR', async () => {
    const detect = instalarDetector(['ean_13'], ['no debería leerse']);
    // jsdom no dibuja: se simula un lienzo sin contexto, y sin cuadro de video no hay lectura
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const lector = await crearLectorQr();

    expect(await lector.leer(document.createElement('video'))).toBeNull();
    expect(detect).not.toHaveBeenCalled();
  });

  it('sin detector nativo usa jsQR, y un video todavía sin imagen no se lee', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const lector = await crearLectorQr();

    expect(await lector.leer(document.createElement('video'))).toBeNull();
  });
});
