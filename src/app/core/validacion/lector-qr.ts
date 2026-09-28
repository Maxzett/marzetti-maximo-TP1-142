import { InjectionToken } from '@angular/core';

/**
 * Lee un QR de un cuadro de video (RF-51, RF-52).
 *
 * Dos caminos con la misma forma:
 * - `BarcodeDetector`, la API nativa del navegador (Chrome y Android): no descarga nada y
 *   decodifica en el motor del navegador, que es más rápido que cualquier librería.
 * - `jsQR` como respaldo donde no existe (Safari, Firefox). Se importa recién acá, así queda en
 *   su propio archivo: ni quien compra ni el empleado con Chrome lo descargan.
 *
 * Queda aislado del componente para poder reemplazarlo en los tests: jsdom no tiene cámara.
 */
export interface LectorQr {
  /** El texto del QR que se ve en el cuadro actual, o null si no hay ninguno legible */
  leer(video: HTMLVideoElement): Promise<string | null>;
}

/**
 * Cómo consigue el escáner su lector. Es un token con fábrica por defecto para que los tests
 * lo reemplacen con `providers` sin tocar el componente, igual que se reemplazan los servicios.
 */
export const CREAR_LECTOR_QR = new InjectionToken<() => Promise<LectorQr>>('CREAR_LECTOR_QR', {
  factory: () => crearLectorQr,
});

/** Lo mínimo de BarcodeDetector que se usa. TypeScript todavía no lo trae en lib.dom */
interface DetectorDeCodigos {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

interface ClaseDetector {
  new (opciones: { formats: string[] }): DetectorDeCodigos;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * El cuadro se achica a este ancho antes de pasárselo a jsQR: un QR en una pantalla de celular
 * se lee igual a 640 px, y decodificar un cuadro de 1920 en JavaScript traba la interfaz.
 */
const ANCHO_DE_LECTURA = 640;

export async function crearLectorQr(): Promise<LectorQr> {
  const Detector = (globalThis as { BarcodeDetector?: ClaseDetector }).BarcodeDetector;

  if (Detector) {
    try {
      // Que exista la clase no garantiza que lea QR: en algunos sistemas no trae ningún formato
      if ((await Detector.getSupportedFormats()).includes('qr_code')) {
        return lectorNativo(new Detector({ formats: ['qr_code'] }));
      }
    } catch {
      // Si el detector nativo falla al arrancar, se sigue con jsQR
    }
  }

  return lectorJsQr();
}

function lectorNativo(detector: DetectorDeCodigos): LectorQr {
  return {
    async leer(video) {
      const codigos = await detector.detect(video);
      return codigos[0]?.rawValue ?? null;
    },
  };
}

async function lectorJsQr(): Promise<LectorQr> {
  const modulo = await import('jsqr');

  // `jsqr` es CommonJS: al empaquetar para producción la función queda en `default`, y según
  // el entorno puede venir envuelta una vez más. El mismo desvío que necesitó `qrcode` en la F6.
  const envoltorio = modulo as unknown as { default: unknown };
  const jsQR = (
    typeof envoltorio.default === 'function'
      ? envoltorio.default
      : (envoltorio.default as { default: unknown }).default
  ) as typeof modulo.default;

  const lienzo = document.createElement('canvas');
  // willReadFrequently: se lee el lienzo en cada cuadro, y así el navegador lo deja en memoria
  const contexto = lienzo.getContext('2d', { willReadFrequently: true });

  return {
    async leer(video) {
      if (!contexto || !video.videoWidth || !video.videoHeight) {
        return null;
      }

      const escala = Math.min(1, ANCHO_DE_LECTURA / video.videoWidth);
      const ancho = Math.round(video.videoWidth * escala);
      const alto = Math.round(video.videoHeight * escala);

      lienzo.width = ancho;
      lienzo.height = alto;
      contexto.drawImage(video, 0, 0, ancho, alto);

      const imagen = contexto.getImageData(0, 0, ancho, alto);
      // dontInvert: el QR de la entrada es oscuro sobre claro; probar el invertido duplica el costo
      const resultado = jsQR(imagen.data, ancho, alto, { inversionAttempts: 'dontInvert' });

      return resultado?.data ?? null;
    },
  };
}
