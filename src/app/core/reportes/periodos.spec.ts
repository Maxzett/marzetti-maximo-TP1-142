import {
  describirPeriodo,
  finDelPeriodo,
  hoyEnElCine,
  inicioDelPeriodo,
  moverPeriodo,
} from './periodos';

describe('periodos', () => {
  describe('hoyEnElCine', () => {
    it('usa la fecha de Buenos Aires, no la de UTC', () => {
      // 01:30 UTC del 28 es todavía el 27 a las 22:30 en el cine
      expect(hoyEnElCine(new Date('2026-09-28T01:30:00Z'))).toBe('2026-09-27');
    });
  });

  describe('semana ISO, de lunes a domingo', () => {
    it('un domingo pertenece a la semana que empezó el lunes anterior', () => {
      expect(inicioDelPeriodo('semana', '2026-09-27')).toBe('2026-09-21');
      expect(finDelPeriodo('semana', '2026-09-27')).toBe('2026-09-27');
    });

    it('un lunes es el inicio de su propia semana', () => {
      expect(inicioDelPeriodo('semana', '2026-09-21')).toBe('2026-09-21');
    });

    it('la semana puede cruzar de mes y de año', () => {
      expect(inicioDelPeriodo('semana', '2027-01-01')).toBe('2026-12-28');
      expect(finDelPeriodo('semana', '2026-12-28')).toBe('2027-01-03');
    });

    it('moverse una semana va de lunes a lunes', () => {
      expect(moverPeriodo('semana', '2026-09-24', 1)).toBe('2026-09-28');
      expect(moverPeriodo('semana', '2026-09-24', -1)).toBe('2026-09-14');
    });
  });

  describe('mes calendario', () => {
    it('va del 1 al último día, febrero bisiesto incluido', () => {
      expect(inicioDelPeriodo('mes', '2026-09-27')).toBe('2026-09-01');
      expect(finDelPeriodo('mes', '2026-09-27')).toBe('2026-09-30');
      expect(finDelPeriodo('mes', '2028-02-10')).toBe('2028-02-29');
    });

    it('moverse un mes desde el 31 no salta un mes', () => {
      expect(moverPeriodo('mes', '2026-01-31', 1)).toBe('2026-02-01');
      expect(moverPeriodo('mes', '2026-01-15', -1)).toBe('2025-12-01');
    });
  });

  describe('describirPeriodo', () => {
    it('dice la semana completa, con un solo mes si no cruza', () => {
      expect(describirPeriodo('semana', '2026-09-24')).toBe(
        'Semana del 21 al 27 de septiembre de 2026',
      );
    });

    it('nombra los dos meses si la semana cruza', () => {
      expect(describirPeriodo('semana', '2026-09-30')).toBe(
        'Semana del 28 de septiembre al 4 de octubre de 2026',
      );
    });

    it('nombra los dos años si la semana cruza de año', () => {
      expect(describirPeriodo('semana', '2026-12-31')).toBe(
        'Semana del 28 de diciembre de 2026 al 3 de enero de 2027',
      );
    });

    it('el mes va con mayúscula inicial', () => {
      expect(describirPeriodo('mes', '2026-09-24')).toBe('Septiembre de 2026');
    });
  });
});
