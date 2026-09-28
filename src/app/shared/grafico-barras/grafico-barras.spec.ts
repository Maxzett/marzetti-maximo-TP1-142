import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatoDeBarra, GraficoBarras } from './grafico-barras';

async function montar(
  datos: DatoDeBarra[],
  unidad: [string, string] = ['entrada', 'entradas'],
): Promise<ComponentFixture<GraficoBarras>> {
  const fixture = TestBed.createComponent(GraficoBarras);
  fixture.componentRef.setInput('titulo', 'Semana del 21 al 27 de septiembre de 2026');
  fixture.componentRef.setInput('datos', datos);
  fixture.componentRef.setInput('unidad', unidad);
  await fixture.whenStable();
  return fixture;
}

const raiz = (fixture: ComponentFixture<GraficoBarras>) => fixture.nativeElement as HTMLElement;

describe('GraficoBarras', () => {
  it('es una figura con su título y una lista ordenada', async () => {
    const fixture = await montar([{ etiqueta: 'Dune', valor: 12 }]);

    expect(raiz(fixture).querySelector('figure figcaption')?.textContent).toContain(
      'Semana del 21',
    );
    expect(raiz(fixture).querySelectorAll('ol > li')).toHaveLength(1);
  });

  it('cada renglón dice su valor con la unidad escrita, no solo con el largo (RNF-10)', async () => {
    const fixture = await montar([
      { etiqueta: 'Dune', valor: 12 },
      { etiqueta: 'Coco', valor: 1 },
    ]);
    const filas = [...raiz(fixture).querySelectorAll('li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(filas[0]).toContain('Dune');
    expect(filas[0]).toContain('12 entradas');
    expect(filas[1]).toContain('1 entrada');
    expect(filas[1]).not.toContain('1 entradas');
  });

  it('la barra es decorativa y proporcional al máximo', async () => {
    const fixture = await montar([
      { etiqueta: 'Dune', valor: 10 },
      { etiqueta: 'Coco', valor: 5 },
    ]);
    const rellenos = [...raiz(fixture).querySelectorAll<HTMLElement>('.relleno')];

    expect(rellenos[0].style.inlineSize).toBe('100%');
    expect(rellenos[1].style.inlineSize).toBe('50%');
    expect(raiz(fixture).querySelector('.pista')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('un valor chico contra uno grande sigue viéndose', async () => {
    const fixture = await montar([
      { etiqueta: 'Dune', valor: 1000 },
      { etiqueta: 'Coco', valor: 1 },
    ]);
    const rellenos = [...raiz(fixture).querySelectorAll<HTMLElement>('.relleno')];

    expect(rellenos[1].style.inlineSize).toBe('2%');
  });

  it('sin datos lo dice en vez de dibujar una lista vacía', async () => {
    const fixture = await montar([]);
    fixture.componentRef.setInput('vacio', 'No hay ventas en este período.');
    await fixture.whenStable();

    expect(raiz(fixture).querySelector('ol')).toBeNull();
    expect(raiz(fixture).textContent).toContain('No hay ventas en este período.');
  });
});
