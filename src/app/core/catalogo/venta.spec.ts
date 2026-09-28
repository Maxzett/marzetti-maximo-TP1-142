import { estadoDeVenta, esProxima, ordenarProximas, ventaDesde } from './venta';

const HOY = '2026-09-28';

describe('ventaDesde', () => {
  it('sin fecha de estreno se vende desde siempre', () => {
    expect(ventaDesde({ fecha_estreno: null, precio_preventa: null })).toBeNull();
  });

  it('sin preventa abre el día del estreno', () => {
    expect(ventaDesde({ fecha_estreno: '2026-10-15', precio_preventa: null })).toBe('2026-10-15');
  });

  it('con preventa abre siete días antes, aunque cruce de mes', () => {
    expect(ventaDesde({ fecha_estreno: '2026-10-03', precio_preventa: 3000 })).toBe('2026-09-26');
  });

  it('una preventa de $0 sigue siendo preventa', () => {
    expect(ventaDesde({ fecha_estreno: '2026-10-15', precio_preventa: 0 })).toBe('2026-10-08');
  });
});

describe('estadoDeVenta', () => {
  it('antes de abrir no está a la venta ni en preventa', () => {
    expect(estadoDeVenta({ fecha_estreno: '2026-10-20', precio_preventa: 3000 }, HOY)).toEqual({
      aLaVenta: false,
      desde: '2026-10-13',
      enPreventa: false,
    });
  });

  it('el día que abre la preventa ya se vende a precio de preventa', () => {
    expect(estadoDeVenta({ fecha_estreno: '2026-10-05', precio_preventa: 3000 }, HOY)).toEqual({
      aLaVenta: true,
      desde: HOY,
      enPreventa: true,
    });
  });

  it('el día del estreno termina la preventa (RF-50)', () => {
    expect(estadoDeVenta({ fecha_estreno: HOY, precio_preventa: 3000 }, HOY).enPreventa).toBe(
      false,
    );
    expect(estadoDeVenta({ fecha_estreno: HOY, precio_preventa: 3000 }, HOY).aLaVenta).toBe(true);
  });

  it('sin preventa, el día antes del estreno todavía no se vende', () => {
    expect(
      estadoDeVenta({ fecha_estreno: '2026-09-29', precio_preventa: null }, HOY).aLaVenta,
    ).toBe(false);
  });

  it('una película en cartelera está a la venta', () => {
    expect(estadoDeVenta({ fecha_estreno: null, precio_preventa: null }, HOY)).toEqual({
      aLaVenta: true,
      desde: null,
      enPreventa: false,
    });
  });
});

describe('esProxima y ordenarProximas', () => {
  const peliculas = [
    { titulo: 'Zeta', fecha_estreno: '2026-10-10' },
    { titulo: 'Alfa', fecha_estreno: '2026-10-10' },
    { titulo: 'Beta', fecha_estreno: '2026-10-01' },
    { titulo: 'Hoy', fecha_estreno: HOY },
    { titulo: 'Sin fecha', fecha_estreno: null },
  ];

  it('la del estreno de hoy ya es de cartelera', () => {
    expect(esProxima({ fecha_estreno: HOY }, HOY)).toBe(false);
    expect(esProxima({ fecha_estreno: '2026-09-29' }, HOY)).toBe(true);
  });

  it('deja solo las futuras, por fecha y después por título', () => {
    expect(ordenarProximas(peliculas, HOY).map((p) => p.titulo)).toEqual(['Beta', 'Alfa', 'Zeta']);
  });
});
