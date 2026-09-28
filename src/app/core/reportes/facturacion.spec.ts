import { DiaDeFacturacion } from '../models/reportes';
import {
  COLUMNAS_DE_FACTURACION,
  describirRango,
  fechaCorta,
  nombreDelArchivo,
  totalesDeFacturacion,
} from './facturacion';

const dia = (fecha: string, cambios: Partial<DiaDeFacturacion> = {}): DiaDeFacturacion => ({
  dia: fecha,
  ordenes: 0,
  entradas: 0,
  cobrado: 0,
  credito: 0,
  descuentos: 0,
  canceladas: 0,
  ...cambios,
});

describe('facturacion', () => {
  it('suma cada columna del período', () => {
    const totales = totalesDeFacturacion([
      dia('2026-09-26', { ordenes: 2, entradas: 3, cobrado: 13000, credito: 500, canceladas: 1 }),
      dia('2026-09-27', { ordenes: 1, entradas: 2, cobrado: 9800, descuentos: 1960 }),
    ]);

    expect(totales).toEqual({
      ordenes: 3,
      entradas: 5,
      cobrado: 22800,
      credito: 500,
      descuentos: 1960,
      canceladas: 1,
    });
  });

  it('los centavos no dejan colas de coma flotante', () => {
    const totales = totalesDeFacturacion([
      dia('2026-09-26', { cobrado: 0.1 }),
      dia('2026-09-27', { cobrado: 0.2 }),
    ]);

    expect(totales.cobrado).toBe(0.3);
  });

  it('un período sin días da todo en cero', () => {
    expect(totalesDeFacturacion([]).cobrado).toBe(0);
  });

  it('las columnas no incluyen ningún dato de personas (RNF-11)', () => {
    const claves = COLUMNAS_DE_FACTURACION.map((c) => c.clave as string);

    expect(claves).not.toContain('email');
    expect(claves.every((clave) => !/sangre|ojos|vacaciones|nombre/.test(clave))).toBe(true);
  });

  it('fecha corta, rango y nombre de archivo', () => {
    expect(fechaCorta('2026-09-27')).toBe('27/09/2026');
    expect(describirRango('2026-09-27', '2026-09-27')).toContain('27 de septiembre de 2026');
    expect(describirRango('2026-09-21', '2026-09-27')).toMatch(/^del .*21.* al .*27/);
    expect(nombreDelArchivo('2026-09-21', '2026-09-27')).toBe('facturacion_2026-09-21_2026-09-27');
  });
});
