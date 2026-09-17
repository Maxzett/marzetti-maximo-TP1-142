import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NIVEL_AA, contraste, leerTokens, luminancia, mezclar } from './contraste';

describe('contraste', () => {
  it('mide los extremos conocidos de la escala', () => {
    expect(contraste('#ffffff', '#000000')).toBe(21);
    expect(contraste('#f2b233', '#f2b233')).toBe(1);
  });

  it('no depende del orden de los colores', () => {
    expect(contraste('#120e0b', '#f5ede2')).toBe(contraste('#f5ede2', '#120e0b'));
  });

  it('acepta el hexadecimal corto y el numeral opcional', () => {
    expect(luminancia('#fff')).toBe(luminancia('ffffff'));
  });

  it('avisa cuando el valor no es un color hexadecimal', () => {
    expect(() => luminancia('var(--acento)')).toThrow();
  });
});

describe('mezclar', () => {
  it('con opacidad 1 devuelve el color de adelante y con 0 el de atrás', () => {
    expect(mezclar('#b5a492', '#1d1613', 1)).toBe('#b5a492');
    expect(mezclar('#b5a492', '#1d1613', 0)).toBe('#1d1613');
  });

  it('a media opacidad cae entre los dos', () => {
    const medio = contraste(mezclar('#b5a492', '#1d1613', 0.5), '#1d1613');
    expect(medio).toBeGreaterThan(1);
    expect(medio).toBeLessThan(contraste('#b5a492', '#1d1613'));
  });
});

/*
 * Estos casos no copian los valores de los tokens: leen styles.css, que es donde se definen.
 * Si alguien cambia una variable y rompe el contraste, el test se entera solo.
 */
describe('los tokens del sistema cumplen AA', () => {
  // Ruta desde la raíz del proyecto: el test corre empaquetado, así que import.meta.url
  // no apunta al archivo en disco sino a la URL que sirve el runner
  const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');
  const tokens = leerTokens(css);

  const color = (nombre: string): string => {
    const valor = tokens.get(nombre);
    expect(valor, `styles.css no define ${nombre}`).toBeDefined();
    return valor!;
  };

  /*
   * Cada fila es un par que existe de verdad en la interfaz, con la superficie sobre la que
   * se apoya. La mayoría de los componentes viven sobre --superficie, no sobre --fondo:
   * medir todo contra el fondo daría un número optimista que la pantalla no muestra nunca.
   */
  const PARES: readonly {
    que: string;
    frente: string;
    fondo: string;
    umbral: number;
    opacidad?: number;
  }[] = [
    { que: 'texto de cuerpo', frente: '--texto', fondo: '--fondo', umbral: NIVEL_AA.texto },
    {
      que: 'texto sobre tarjeta',
      frente: '--texto',
      fondo: '--superficie',
      umbral: NIVEL_AA.texto,
    },
    {
      que: 'metadato sobre tarjeta',
      frente: '--texto-tenue',
      fondo: '--superficie',
      umbral: NIVEL_AA.texto,
    },
    {
      que: 'metadato sobre celda elevada',
      frente: '--texto-tenue',
      fondo: '--superficie-alta',
      umbral: NIVEL_AA.texto,
    },
    { que: 'enlace y acento', frente: '--acento', fondo: '--fondo', umbral: NIVEL_AA.texto },
    {
      que: 'texto del botón primario',
      frente: '--texto-sobre-acento',
      fondo: '--acento',
      umbral: NIVEL_AA.texto,
    },
    {
      que: 'botón primario en hover',
      frente: '--texto-sobre-acento',
      fondo: '--bombilla',
      umbral: NIVEL_AA.texto,
    },
    {
      que: 'texto sobre butaca roja',
      frente: '--texto-sobre-rojo',
      fondo: '--rojo-butaca',
      umbral: NIVEL_AA.texto,
    },
    {
      que: 'error del campo',
      frente: '--rojo-claro',
      fondo: '--superficie',
      umbral: NIVEL_AA.texto,
    },
    {
      que: 'día sin función, que sigue siendo enfocable',
      frente: '--texto-tenue',
      fondo: '--superficie',
      umbral: NIVEL_AA.texto,
    },
    {
      que: 'día de otro mes, que sigue siendo clicable',
      frente: '--texto-tenue',
      fondo: '--superficie',
      umbral: NIVEL_AA.texto,
    },
    { que: 'anillo de foco', frente: '--acento', fondo: '--fondo', umbral: NIVEL_AA.noTexto },
    {
      que: 'anillo de foco sobre un diálogo',
      frente: '--acento',
      fondo: '--superficie',
      umbral: NIVEL_AA.noTexto,
    },
    {
      que: 'borde punteado de hoy',
      frente: '--acento-hondo',
      fondo: '--superficie',
      umbral: NIVEL_AA.noTexto,
    },
    {
      que: 'borde de control',
      frente: '--borde-fuerte',
      fondo: '--fondo',
      umbral: NIVEL_AA.noTexto,
    },
  ];

  it.each(PARES)('$que · $frente sobre $fondo', ({ frente, fondo, umbral, opacidad }) => {
    const fondoReal = color(fondo);
    const frenteReal =
      opacidad === undefined ? color(frente) : mezclar(color(frente), fondoReal, opacidad);

    expect(contraste(frenteReal, fondoReal)).toBeGreaterThanOrEqual(umbral);
  });
});
