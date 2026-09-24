import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DesgloseDeOrden } from '../../core/models/orden';
import { Desglose } from './desglose';

function desglose(cambios: Partial<DesgloseDeOrden> = {}): DesgloseDeOrden {
  return {
    subtotal: 20000,
    descuento_cupon: 0,
    credito_aplicado: 0,
    total: 20000,
    puntos_a_ganar: 20000,
    puntos_canje: 0,
    cupon: null,
    tiene_vip: false,
    entradas: [
      { butaca_id: 'a', fila: 'A', numero: 1, tipo: 'estandar', precio: 6500 },
      { butaca_id: 'r', fila: 'R', numero: 5, tipo: 'vip', precio: 8500 },
    ],
    productos: [
      {
        producto_id: 'p',
        nombre: 'Pochoclo grande',
        cantidad: 1,
        precio_unitario: 5000,
        por_canje: false,
      },
    ],
    combos: [],
    ...cambios,
  };
}

async function montar(
  d: DesgloseDeOrden,
  mostrarPuntos = false,
): Promise<{ fixture: ComponentFixture<Desglose>; texto: string }> {
  const fixture = TestBed.createComponent(Desglose);
  fixture.componentRef.setInput('desglose', d);
  fixture.componentRef.setInput('mostrarPuntos', mostrarPuntos);
  await fixture.whenStable();
  // Intl escribe un espacio de no separación entre el $ y el número: se normaliza
  const texto = (fixture.nativeElement as HTMLElement)
    .textContent!.replace(/ /g, ' ')
    .replace(/\s+/g, ' ');
  return { fixture, texto };
}

describe('Desglose', () => {
  it('lista cada entrada, marcando la VIP con texto', async () => {
    const { texto } = await montar(desglose());

    expect(texto).toContain('Entrada A1');
    expect(texto).toContain('Entrada R5 · VIP');
    expect(texto).toContain('1 × Pochoclo grande');
  });

  it('sin cupón ni crédito no repite el subtotal: es igual al total', async () => {
    const { texto } = await montar(desglose());

    expect(texto).not.toContain('Subtotal');
    expect(texto).toMatch(/Total a pagar\s*\$\s*20\.000/);
  });

  it('con cupón y crédito muestra cada paso en el orden de D-06', async () => {
    const { texto } = await montar(
      desglose({
        descuento_cupon: 4000,
        credito_aplicado: 3000,
        total: 13000,
        cupon: { codigo: 'BIENVENIDA', tipo_descuento: 'porcentaje', valor: 20 },
      }),
    );

    expect(texto.indexOf('Subtotal')).toBeLessThan(texto.indexOf('Cupón BIENVENIDA (20 %)'));
    expect(texto.indexOf('Cupón')).toBeLessThan(texto.indexOf('Crédito de tu cuenta'));
    expect(texto.indexOf('Crédito')).toBeLessThan(texto.indexOf('Total a pagar'));
    expect(texto).toMatch(/−\s*\$\s*4\.000/);
  });

  it('un producto canjeado dice "Gratis" y por qué', async () => {
    const { texto } = await montar(
      desglose({
        productos: [
          {
            producto_id: 'p',
            nombre: 'Pochoclo grande',
            cantidad: 1,
            precio_unitario: 0,
            por_canje: true,
          },
        ],
      }),
    );

    expect(texto).toContain('canjeado con puntos');
    expect(texto).toContain('Gratis');
  });

  it('anuncia los puntos solo con cuenta y solo si son más de cero', async () => {
    expect((await montar(desglose(), false)).texto).not.toContain('sumás');
    expect((await montar(desglose(), true)).texto).toContain('sumás 20.000 puntos');
    expect((await montar(desglose({ puntos_a_ganar: 0 }), true)).texto).not.toContain('sumás');
  });
});
