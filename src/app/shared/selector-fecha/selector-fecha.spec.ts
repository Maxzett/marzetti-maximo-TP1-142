import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectorFecha } from './selector-fecha';

describe('SelectorFecha', () => {
  let fixture: ComponentFixture<SelectorFecha>;

  const celda = (iso: string) =>
    fixture.nativeElement.querySelector(`[data-iso="${iso}"]`) as HTMLButtonElement | null;

  const titulo = () => (fixture.nativeElement.querySelector('.periodo') as HTMLElement).textContent;

  const teclear = async (key: string, shiftKey = false) => {
    const grilla = fixture.nativeElement.querySelector('[role="grid"]') as HTMLElement;
    grilla.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SelectorFecha] }).compileComponents();
    fixture = TestBed.createComponent(SelectorFecha);
    fixture.componentRef.setInput('valor', '2026-09-24');
    await fixture.whenStable();
  });

  it('abre en el mes de la fecha elegida y la marca', () => {
    expect(titulo()).toContain('septiembre');
    expect(celda('2026-09-24')!.classList.contains('dia--elegida')).toBe(true);
    expect(celda('2026-09-24')!.getAttribute('aria-selected')).toBe('true');
  });

  // Seis semanas siempre: así la grilla no cambia de alto al pasar de mes
  it('dibuja seis semanas completas, con los días de los meses vecinos', () => {
    // :not(.encabezado) deja afuera la fila de iniciales de los días
    expect(fixture.nativeElement.querySelectorAll('.fila:not(.encabezado)')).toHaveLength(6);
    expect(celda('2026-08-31')!.classList.contains('dia--otro-mes')).toBe(true);
  });

  it('elige un día al hacer clic', async () => {
    celda('2026-09-28')!.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.valor()).toBe('2026-09-28');
  });

  it('mueve el foco con las flechas sin elegir nada', async () => {
    await teclear('ArrowRight');

    // Moverse no elige: el valor sigue donde estaba
    expect(fixture.componentInstance.valor()).toBe('2026-09-24');
    expect(celda('2026-09-25')!.tabIndex).toBe(0);
    expect(celda('2026-09-24')!.tabIndex).toBe(-1);
  });

  it('salta de mes con PageDown y de año con Shift', async () => {
    await teclear('PageDown');
    expect(titulo()).toContain('octubre');

    await teclear('PageUp', true);
    expect(titulo()).toContain('2025');
  });

  it('va al principio y al final de la semana con Home y End', async () => {
    // El 24 de septiembre de 2026 fue jueves
    await teclear('Home');
    expect(celda('2026-09-21')!.tabIndex).toBe(0);

    await teclear('End');
    expect(celda('2026-09-27')!.tabIndex).toBe(0);
  });

  it('marca como no disponible lo que queda fuera del rango', async () => {
    fixture.componentRef.setInput('minimo', '2026-09-20');
    fixture.componentRef.setInput('maximo', '2026-09-26');
    await fixture.whenStable();

    expect(celda('2026-09-19')!.getAttribute('aria-disabled')).toBe('true');
    expect(celda('2026-09-22')!.getAttribute('aria-disabled')).toBe('false');
    expect(celda('2026-09-27')!.getAttribute('aria-disabled')).toBe('true');
  });

  // El caso de la compra: solo los días que tienen función
  it('con lista de fechas habilitadas solo deja elegir esas', async () => {
    fixture.componentRef.setInput('fechasHabilitadas', ['2026-09-24', '2026-09-26']);
    await fixture.whenStable();

    expect(celda('2026-09-24')!.getAttribute('aria-disabled')).toBe('false');
    expect(celda('2026-09-25')!.getAttribute('aria-disabled')).toBe('true');

    celda('2026-09-25')!.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.valor()).toBe('2026-09-24');
  });

  /**
   * Con disabled el navegador no deja enfocar el botón y el foco se caía al body al pasar por
   * un día sin función: el teclado quedaba varado a mitad del mes.
   */
  it('deja recorrer con el teclado los días sin función', async () => {
    fixture.componentRef.setInput('fechasHabilitadas', ['2026-09-24']);
    await fixture.whenStable();

    await teclear('ArrowRight');

    expect(celda('2026-09-25')!.hasAttribute('disabled')).toBe(false);
    expect(celda('2026-09-25')!.tabIndex).toBe(0);
  });

  // El caso de la fecha de nacimiento: llegar a 1998 sin 300 clics
  it('baja a la vista de años y vuelve eligiendo año y mes', async () => {
    fixture.componentRef.setInput('vistaInicial', 'anios');
    await fixture.whenStable();

    const opciones = () =>
      [...fixture.nativeElement.querySelectorAll('.opcion')] as HTMLButtonElement[];

    // Las páginas de años van de a 12 arrancando en un múltiplo: 2026 cae en 2016 – 2027
    expect(titulo()).toContain('2016');

    const anio2026 = opciones().find((boton) => boton.textContent?.trim() === '2026')!;
    anio2026.click();
    await fixture.whenStable();

    // Tras elegir el año pasa a los meses
    expect(titulo()).toContain('2026');

    opciones()[0].click();
    await fixture.whenStable();

    expect(titulo()).toContain('enero');
  });
});
