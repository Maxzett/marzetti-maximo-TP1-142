import { formatearDuracion } from './duracion';

describe('formatearDuracion', () => {
  it('escribe horas y minutos, con los minutos en dos cifras', () => {
    expect(formatearDuracion(112)).toBe('1 h 52 min');
    expect(formatearDuracion(128)).toBe('2 h 08 min');
  });

  it('una hora justa no dice "0 min"', () => {
    expect(formatearDuracion(120)).toBe('2 h');
  });

  it('menos de una hora queda en minutos', () => {
    expect(formatearDuracion(45)).toBe('45 min');
  });
});
