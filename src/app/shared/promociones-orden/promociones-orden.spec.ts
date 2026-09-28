import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Recompensa } from '../../core/models/candy';
import { DesgloseDeOrden, Saldos } from '../../core/models/orden';
import { PromocionesOrden } from './promociones-orden';

const SALDOS: Saldos = {
  puntos: 30000,
  credito: 2000,
  bienvenida: { codigo: 'BIENVENIDA', tipo_descuento: 'porcentaje', valor: 20 },
  cupon_edad: { codigo: 'PLATINO50', tipo_descuento: 'porcentaje', valor: 25, edad_minima: 50 },
};

const RECOMPENSAS: Recompensa[] = [
  { id: 'r1', nombre: 'Gaseosa gratis', tipo: 'producto', producto_id: 'p1', costo_puntos: 28000 },
  { id: 'r2', nombre: 'Entrada gratis', tipo: 'entrada', producto_id: null, costo_puntos: 65000 },
];

function montar(entradas: Record<string, unknown> = {}): ComponentFixture<PromocionesOrden> {
  const fixture = TestBed.createComponent(PromocionesOrden);
  for (const [nombre, valor] of Object.entries({
    saldos: SALDOS,
    haySesion: true,
    recompensas: RECOMPENSAS,
    ...entradas,
  })) {
    fixture.componentRef.setInput(nombre, valor);
  }
  fixture.detectChanges();
  return fixture;
}

const texto = (f: ComponentFixture<PromocionesOrden>) =>
  (f.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';

function boton(f: ComponentFixture<PromocionesOrden>, contiene: string): HTMLButtonElement {
  return [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
    b.textContent?.includes(contiene),
  ) as HTMLButtonElement;
}

describe('PromocionesOrden', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ofrece el cupón de bienvenida y el de edad, y avisa cuál se eligió', () => {
    const fixture = montar();
    const elegido = vi.fn();
    fixture.componentInstance.usarCupon.subscribe(elegido);

    expect(texto(fixture)).toContain('cupón de bienvenida de 20 %');
    expect(texto(fixture)).toContain('Por ser mayor de 50 años tenés el cupón PLATINO50');

    boton(fixture, 'Usar cupón PLATINO50').click();
    expect(elegido).toHaveBeenCalledWith('PLATINO50');
  });

  it('con un cupón ya aplicado no sugiere otro: van de a uno', () => {
    const desglose = {
      cupon: { codigo: 'BIENVENIDA', tipo_descuento: 'porcentaje', valor: 20 },
    } as DesgloseDeOrden;
    const fixture = montar({ desglose });

    expect(texto(fixture)).not.toContain('Usar mi cupón');
    expect(texto(fixture)).not.toContain('PLATINO50');
    expect(boton(fixture, 'Quitar cupón')).toBeDefined();
  });

  it('ofrece solo las recompensas que alcanzan con los puntos', () => {
    const fixture = montar();
    const opciones = [...(fixture.nativeElement as HTMLElement).querySelectorAll('option')].map(
      (o) => o.value,
    );

    expect(opciones).toContain('r1');
    expect(opciones).not.toContain('r2');
  });

  it('sin sesión invita a crear una cuenta en vez de ofrecer crédito o canjes', () => {
    const fixture = montar({ haySesion: false, saldos: null });

    expect(texto(fixture)).toContain('Con una cuenta acumulás 1 punto por peso');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('input[type="checkbox"]'),
    ).toBeNull();
  });
});
