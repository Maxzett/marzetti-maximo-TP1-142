import { formatearPrecio, formatearPuntos, leerImporte } from './precio';

/** Intl separa el símbolo con un espacio duro que varía según el motor: se compara sin espacios */
const sinEspacios = (texto: string) => texto.replace(/\s/g, '');

describe('formatearPrecio', () => {
  it('escribe los pesos con punto de miles y sin decimales si el importe es entero', () => {
    expect(sinEspacios(formatearPrecio(6500))).toBe('$6.500');
  });

  it('conserva los centavos cuando los hay', () => {
    expect(sinEspacios(formatearPrecio(6500.5))).toBe('$6.500,50');
  });

  it('el cero es un precio válido y se escribe', () => {
    expect(sinEspacios(formatearPrecio(0))).toBe('$0');
  });
});

describe('formatearPuntos', () => {
  it('separa los miles, también en los números de cuatro dígitos', () => {
    expect(formatearPuntos(65000)).toBe('65.000');
    expect(formatearPuntos(4500)).toBe('4.500');
    expect(formatearPuntos(150)).toBe('150');
  });
});

describe('leerImporte', () => {
  it('acepta punto o coma decimal y redondea a centavos', () => {
    expect(leerImporte('6500')).toBe(6500);
    expect(leerImporte('6500.5')).toBe(6500.5);
    expect(leerImporte('6500,50')).toBe(6500.5);
    expect(leerImporte('10,999')).toBe(11);
    expect(leerImporte(' 0 ')).toBe(0);
  });

  it('rechaza vacío, negativos y texto', () => {
    expect(leerImporte('')).toBeNull();
    expect(leerImporte('   ')).toBeNull();
    expect(leerImporte('-1')).toBeNull();
    expect(leerImporte('mil')).toBeNull();
  });
});
