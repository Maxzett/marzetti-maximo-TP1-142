import { describirUso, esCodigoValido, normalizarCodigo } from './codigo';

describe('normalizarCodigo', () => {
  it('pasa a mayúscula y quita espacios y guiones, como se dicta un código', () => {
    expect(normalizarCodigo(' 8eed b649-a1b6 4669 8a52 ')).toBe('8EEDB649A1B646698A52');
  });

  it('si el QR trae la dirección de la entrada, toma el código', () => {
    expect(normalizarCodigo('https://cine.example/entrada/8eedb649a1b646698a52?x=1')).toBe(
      '8EEDB649A1B646698A52',
    );
  });

  it('deja el código ya normalizado como estaba', () => {
    expect(normalizarCodigo('8EEDB649A1B646698A52')).toBe('8EEDB649A1B646698A52');
  });
});

describe('esCodigoValido', () => {
  it('acepta 20 hexadecimales en mayúscula', () => {
    expect(esCodigoValido('8EEDB649A1B646698A52')).toBe(true);
  });

  it('rechaza un código incompleto, largo o con letras fuera de la A-F', () => {
    expect(esCodigoValido('8EEDB649A1B646698A5')).toBe(false);
    expect(esCodigoValido('8EEDB649A1B646698A521')).toBe(false);
    expect(esCodigoValido('8EEDB649A1B646698A5Z')).toBe(false);
    expect(esCodigoValido('')).toBe(false);
  });

  it('no acepta minúsculas: primero se normaliza', () => {
    expect(esCodigoValido('8eedb649a1b646698a52')).toBe(false);
  });
});

describe('describirUso', () => {
  it('dice cuándo, en la hora del cine, y por quién (RN-05)', () => {
    // 00:40 UTC del domingo es 21:40 del sábado en Buenos Aires
    expect(describirUso({ usado_at: '2026-09-27T00:40:00Z', usado_por: 'Ana G.' })).toBe(
      'Usado el sáb 26/09 · 21:40 por Ana G.',
    );
  });

  it('si la cuenta de quien validó ya no existe, dice solo cuándo', () => {
    expect(describirUso({ usado_at: '2026-09-27T00:40:00Z', usado_por: null })).toBe(
      'Usado el sáb 26/09 · 21:40.',
    );
  });

  it('un tramo sin usar no tiene descripción', () => {
    expect(describirUso({ usado_at: null, usado_por: null })).toBe('');
  });
});
