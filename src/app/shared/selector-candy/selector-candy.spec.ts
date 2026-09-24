import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CatalogoDeCandy } from '../../core/models/candy';
import { SelectorCandy } from './selector-candy';

const catalogo: CatalogoDeCandy = {
  categorias: [
    { id: 'c1', nombre: 'Pochoclos', orden: 1 },
    { id: 'c2', nombre: 'Bebidas', orden: 2 },
    { id: 'c3', nombre: 'Helados', orden: 3 },
  ],
  productos: [
    {
      id: 'p1',
      categoria_id: 'c1',
      nombre: 'Pochoclo grande',
      descripcion: 'Salado o dulce',
      imagen_url: null,
      precio: 6500,
    },
    {
      id: 'p2',
      categoria_id: 'c2',
      nombre: 'Gaseosa 500 ml',
      descripcion: '',
      imagen_url: null,
      precio: 2800,
    },
  ],
  combos: [
    {
      id: 'k1',
      nombre: 'Combo Candy',
      descripcion: '',
      imagen_url: null,
      precio: 6900,
      destacado: false,
      combo_items: [
        { incluye_entrada: false, cantidad: 1, productos: { nombre: 'Pochoclo mediano' } },
      ],
    },
    {
      id: 'k2',
      nombre: 'Combo Entrada',
      descripcion: '',
      imagen_url: null,
      precio: 9800,
      destacado: true,
      combo_items: [
        { incluye_entrada: true, cantidad: 1, productos: null },
        { incluye_entrada: false, cantidad: 1, productos: { nombre: 'Pochoclo mediano' } },
      ],
    },
  ],
  recompensas: [],
};

async function montar(butacas = 2): Promise<ComponentFixture<SelectorCandy>> {
  const fixture = TestBed.createComponent(SelectorCandy);
  fixture.componentRef.setInput('catalogo', catalogo);
  fixture.componentRef.setInput('butacas', butacas);
  await fixture.whenStable();
  return fixture;
}

const raiz = (f: ComponentFixture<SelectorCandy>) => f.nativeElement as HTMLElement;
const boton = (f: ComponentFixture<SelectorCandy>, nombre: string, accion: 'Agregar' | 'Quitar') =>
  raiz(f).querySelector<HTMLButtonElement>(
    `button[aria-label="${accion} una unidad de ${nombre}"]`,
  )!;

describe('SelectorCandy', () => {
  it('muestra los combos destacados primero y con la marca escrita', async () => {
    const fixture = await montar();
    const nombres = [...raiz(fixture).querySelectorAll('#titulo-combos ~ .lista .nombre')].map(
      (n) => n.textContent!.trim(),
    );

    expect(nombres[0]).toContain('Combo Entrada');
    expect(nombres[0]).toContain('Destacado');
    expect(nombres[1]).toBe('Combo Candy');
  });

  it('agrupa los productos por categoría y omite las que no tienen productos', async () => {
    const fixture = await montar();
    const titulos = [...raiz(fixture).querySelectorAll('h3')].map((h) => h.textContent!.trim());

    expect(titulos).toEqual(['Combos', 'Pochoclos', 'Bebidas']);
  });

  it('sumar un producto lo agrega a la selección y restarlo hasta cero lo quita', async () => {
    const fixture = await montar();

    boton(fixture, 'Pochoclo grande', 'Agregar').click();
    boton(fixture, 'Pochoclo grande', 'Agregar').click();
    expect(fixture.componentInstance.productos().get('p1')).toBe(2);

    boton(fixture, 'Pochoclo grande', 'Quitar').click();
    boton(fixture, 'Pochoclo grande', 'Quitar').click();
    expect(fixture.componentInstance.productos().has('p1')).toBe(false);
  });

  it('un combo con entrada no puede superar las butacas reservadas', async () => {
    const fixture = await montar(1);
    const agregar = () => boton(fixture, 'Combo Entrada', 'Agregar');

    agregar().click();
    await fixture.whenStable();
    expect(fixture.componentInstance.combos().get('k2')).toBe(1);

    agregar().click();
    expect(fixture.componentInstance.combos().get('k2')).toBe(1);
    expect(agregar().getAttribute('aria-disabled')).toBe('true');
  });

  it('un combo sin entrada no consume butacas', async () => {
    const fixture = await montar(1);

    boton(fixture, 'Combo Candy', 'Agregar').click();
    await fixture.whenStable();
    boton(fixture, 'Combo Candy', 'Agregar').click();

    expect(fixture.componentInstance.combos().get('k1')).toBe(2);
  });

  it('avisa qué consume un combo con entrada', async () => {
    const fixture = await montar();

    expect(raiz(fixture).textContent).toContain('Usa una de tus butacas');
  });
});
