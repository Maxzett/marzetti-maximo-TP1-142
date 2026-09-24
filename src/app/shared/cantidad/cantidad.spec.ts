import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cantidad } from './cantidad';

async function montar(valor = 0, maximo = 3): Promise<ComponentFixture<Cantidad>> {
  const fixture = TestBed.createComponent(Cantidad);
  fixture.componentRef.setInput('etiqueta', 'Pochoclo grande');
  fixture.componentRef.setInput('valor', valor);
  fixture.componentRef.setInput('maximo', maximo);
  await fixture.whenStable();
  return fixture;
}

function botones(fixture: ComponentFixture<Cantidad>): HTMLButtonElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
}

describe('Cantidad', () => {
  it('suma y resta de a una unidad', async () => {
    const fixture = await montar(1);
    const [restar, sumar] = botones(fixture);

    sumar.click();
    expect(fixture.componentInstance.valor()).toBe(2);
    restar.click();
    restar.click();
    expect(fixture.componentInstance.valor()).toBe(0);
  });

  it('no baja del mínimo ni pasa del máximo', async () => {
    const fixture = await montar(0, 1);
    const [restar, sumar] = botones(fixture);

    restar.click();
    expect(fixture.componentInstance.valor()).toBe(0);
    sumar.click();
    sumar.click();
    expect(fixture.componentInstance.valor()).toBe(1);
  });

  it('marca los topes con aria-disabled y no con disabled, para no perder el foco', async () => {
    const fixture = await montar(0);
    const [restar, sumar] = botones(fixture);

    expect(restar.getAttribute('aria-disabled')).toBe('true');
    expect(restar.disabled).toBe(false);
    expect(sumar.getAttribute('aria-disabled')).toBeNull();
  });

  it('los botones dicen qué cuentan, no solo "+" y "−"', async () => {
    const fixture = await montar();
    const [restar, sumar] = botones(fixture);

    expect(restar.getAttribute('aria-label')).toBe('Quitar una unidad de Pochoclo grande');
    expect(sumar.getAttribute('aria-label')).toBe('Agregar una unidad de Pochoclo grande');
  });
});
