import { TestBed } from '@angular/core/testing';
import { PanelCuenta } from './panel-cuenta';

async function montar(titulo?: string): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(PanelCuenta);
  if (titulo) {
    fixture.componentRef.setInput('titulo', titulo);
  }
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('PanelCuenta', () => {
  it('es un aside nombrado por su título', async () => {
    const elemento = await montar('Creá tu cuenta');
    const panel = elemento.querySelector('aside')!;
    const titulo = elemento.querySelector('h2')!;

    expect(titulo.textContent).toContain('Creá tu cuenta');
    expect(panel.getAttribute('aria-labelledby')).toBe(titulo.id);
  });

  it('lista las ventajas de tener cuenta', async () => {
    const elemento = await montar();
    const titulos = [...elemento.querySelectorAll('.ventaja-titulo')].map((p) => p.textContent);

    expect(titulos).toContain('Puntos en cada compra');
    expect(titulos).toContain('Cancelación con crédito');
  });

  it('los dibujos son decorativos', async () => {
    const elemento = await montar();
    const dibujos = [...elemento.querySelectorAll('.bombilla, .guirnalda')];

    expect(dibujos.length).toBeGreaterThan(0);
    expect(dibujos.every((d) => d.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
