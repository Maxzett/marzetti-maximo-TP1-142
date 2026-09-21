import { Butaca } from '../models/sala';
import { armarMapa, contarPorTipo } from './distribucion';
import { salaDeMuestra as sala } from './muestra';

describe('contarPorTipo', () => {
  it('cuenta la sala completa: 420 estándar, 28 de silla de ruedas y 84 VIP', () => {
    expect(contarPorTipo(sala())).toEqual({
      estandar: 420,
      silla_ruedas: 28,
      vip: 84,
      total: 532,
    });
  });

  it('con la sala vacía devuelve ceros, no undefined', () => {
    expect(contarPorTipo([])).toEqual({ estandar: 0, silla_ruedas: 0, vip: 0, total: 0 });
  });
});

describe('armarMapa', () => {
  it('arma las 20 filas de la A a la T aunque lleguen mezcladas', () => {
    const desordenadas = [...sala()].reverse();
    const filas = armarMapa(desordenadas).map((f) => f.fila);

    expect(filas).toEqual('ABCDEFGHIJKLMNOPQRST'.split(''));
  });

  it('cada fila tiene tres bloques, con 4, 20 y 4 butacas en las estándar', () => {
    const fila = armarMapa(sala()).find((f) => f.fila === 'A')!;

    expect(fila.bloques.map((b) => b.length)).toEqual([4, 20, 4]);
  });

  it('J y K son de silla de ruedas y tienen 2, 10 y 2 (D-01)', () => {
    const mapa = armarMapa(sala());

    for (const letra of ['J', 'K']) {
      const fila = mapa.find((f) => f.fila === letra)!;

      expect(fila.tipo).toBe('silla_ruedas');
      expect(fila.bloques.map((b) => b.length)).toEqual([2, 10, 2]);
    }
  });

  it('R, S y T son VIP y las demás no', () => {
    const vip = armarMapa(sala())
      .filter((f) => f.tipo === 'vip')
      .map((f) => f.fila);

    expect(vip).toEqual(['R', 'S', 'T']);
  });

  it('ordena las butacas de cada bloque por número', () => {
    const fila = armarMapa([...sala()].reverse()).find((f) => f.fila === 'A')!;

    expect(fila.bloques[1].map((b) => b.numero)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 5),
    );
  });

  it('una columna fuera de rango se ubica en el bloque más cercano en vez de romper el mapa', () => {
    const rara: Butaca = { id: 'x', fila: 'A', columna: 9, numero: 1, tipo: 'estandar' };

    expect(armarMapa([rara])[0].bloques.map((b) => b.length)).toEqual([0, 0, 1]);
  });

  it('sin butacas no hay filas', () => {
    expect(armarMapa([])).toEqual([]);
  });
});
