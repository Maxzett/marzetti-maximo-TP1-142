import { TestBed } from '@angular/core/testing';
import { LineaDelPedido } from '../../core/compra/candy';
import { Pedido } from './pedido';

async function montar(lineas: LineaDelPedido[], butacas: string[] = []): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(Pedido);
  fixture.componentRef.setInput('lineas', lineas);
  fixture.componentRef.setInput('butacas', butacas);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('Pedido', () => {
  it('lista el candy elegido con su cantidad', async () => {
    const elemento = await montar([
      { id: 'c', nombre: 'Combo pareja', cantidad: 2 },
      { id: 'p', nombre: 'Pochoclo grande', cantidad: 1 },
    ]);

    const renglones = [...elemento.querySelectorAll('.lineas li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(renglones).toEqual(['2 × Combo pareja', '1 × Pochoclo grande']);
    expect(elemento.querySelector('.vacio')).toBeNull();
  });

  it('sin candy elegido lo dice, en vez de dejar una lista vacía', async () => {
    const elemento = await montar([]);

    expect(elemento.querySelector('.lineas')).toBeNull();
    expect(elemento.querySelector('.vacio')?.textContent).toContain('Todavía no sumaste nada');
  });

  it('muestra las butacas solo cuando las hay', async () => {
    const sinButacas = await montar([]);
    expect(sinButacas.querySelector('.butacas')).toBeNull();

    const conButacas = await montar([], ['F7', 'R3 · VIP']);
    const chips = [...conButacas.querySelectorAll('.butacas li')].map((li) => li.textContent);
    expect(chips).toEqual(['F7', 'R3 · VIP']);
  });

  it('sin candy bar no muestra ese bloque', async () => {
    const fixture = TestBed.createComponent(Pedido);
    fixture.componentRef.setInput('lineas', []);
    fixture.componentRef.setInput('butacas', ['F7']);
    fixture.componentRef.setInput('mostrarCandy', false);
    await fixture.whenStable();
    const elemento = fixture.nativeElement as HTMLElement;

    expect(elemento.textContent).not.toContain('Candy bar');
    expect(elemento.querySelector('.vacio')).toBeNull();
  });
});
