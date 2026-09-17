/**
 * Cálculo de contraste de WCAG 2.1.
 *
 * Existe para que los ratios del sistema visual dejen de ser un comentario al lado del token
 * y pasen a ser algo que se mide: el mismo cálculo lo usan el test que recorre styles.css
 * y la tabla de la página /sistema.
 *
 * Son funciones puras, sin nada de Angular, como fechas.ts en el selector de fecha.
 */

/** Umbrales del nivel AA. El AAA (7:1) queda fuera: la consigna pide AA */
export const NIVEL_AA = {
  /** Texto normal, menos de 18,66 px en negrita o 24 px normal */
  texto: 4.5,
  /** Texto grande */
  textoGrande: 3,
  /** Bordes, íconos, anillos de foco y cualquier cosa que no sea texto (SC 1.4.11) */
  noTexto: 3,
} as const;

export interface CanalesRgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Acepta '#rrggbb' y '#rgb', con o sin numeral y con espacios alrededor: los valores llegan
 * tanto de styles.css como de getComputedStyle(), que devuelve el token tal cual se escribió.
 */
export function aRgb(hex: string): CanalesRgb {
  const limpio = hex.trim().replace('#', '');

  const completo =
    limpio.length === 3
      ? limpio
          .split('')
          .map((caracter) => caracter + caracter)
          .join('')
      : limpio;

  if (!/^[0-9a-f]{6}$/i.test(completo)) {
    throw new Error(`No es un color hexadecimal: "${hex}"`);
  }

  return {
    r: parseInt(completo.slice(0, 2), 16),
    g: parseInt(completo.slice(2, 4), 16),
    b: parseInt(completo.slice(4, 6), 16),
  };
}

/** Luminancia relativa: el canal se linealiza antes de pesarlo, porque sRGB viene con gamma */
export function luminancia(hex: string): number {
  const { r, g, b } = aRgb(hex);

  const lineal = (canal: number): number => {
    const proporcion = canal / 255;
    return proporcion <= 0.03928 ? proporcion / 12.92 : ((proporcion + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

/**
 * Ratio entre dos colores, siempre ≥ 1 y sin importar el orden.
 * Se redondea a un decimal porque es la precisión con la que se informa el contraste.
 */
export function contraste(unColor: string, otroColor: string): number {
  const a = luminancia(unColor);
  const b = luminancia(otroColor);
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);

  return Math.round(((claro + 0.05) / (oscuro + 0.05)) * 10) / 10;
}

/**
 * Compone un color semitransparente sobre su fondo y devuelve el hexadecimal resultante.
 * Hace falta porque un `opacity` en CSS no baja solo la "intensidad": cambia el color real
 * que ve el ojo, y ese es el que hay que medir.
 */
export function mezclar(frente: string, fondo: string, opacidad: number): string {
  const a = aRgb(frente);
  const b = aRgb(fondo);

  const canal = (deFrente: number, deFondo: number): string =>
    Math.round(deFrente * opacidad + deFondo * (1 - opacidad))
      .toString(16)
      .padStart(2, '0');

  return `#${canal(a.r, b.r)}${canal(a.g, b.g)}${canal(a.b, b.b)}`;
}

/** Lee los custom properties del bloque :root de una hoja de estilos, como texto */
export function leerTokens(css: string): Map<string, string> {
  const raiz = /:root\s*\{([\s\S]*?)\}/.exec(css);

  if (!raiz) {
    throw new Error('La hoja de estilos no tiene un bloque :root');
  }

  const tokens = new Map<string, string>();

  for (const [, nombre, valor] of raiz[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(nombre, valor.trim());
  }

  return tokens;
}
