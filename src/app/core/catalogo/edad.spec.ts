import { describirEdad } from './edad';

describe('describirEdad', () => {
  it('0 es apta para todo público', () => {
    expect(describirEdad(0)).toEqual({ corto: 'ATP', largo: 'Apta para todo público' });
  });

  it('13 y 18 dicen la edad, en el chip y en el texto largo', () => {
    expect(describirEdad(13)).toEqual({ corto: '+13', largo: 'Mayores de 13 años' });
    expect(describirEdad(18)).toEqual({ corto: '+18', largo: 'Mayores de 18 años' });
  });
});
