import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectorFecha } from './selector-fecha';

describe('SelectorFecha', () => {
  let fixture: ComponentFixture<SelectorFecha>;

  const celda = (iso: string) =>
    fixture.nativeElement.querySelector(`[data-iso="${iso}"]`) as HTMLButtonElement | null;

  const titulo = () => (fixture.nativeElement.querySelector('.periodo') as HTMLElement).textContent;

  const opcion = (texto: string) =>
    ([...fixture.nativeElement.querySelectorAll('.opcion')] as HTMLButtonElement[]).find(
      (boton) => boton.textContent?.trim() === texto,
    );

  // Se despacha en la raíz porque el keydown vive ahí: las tres vistas comparten teclado
  const teclear = async (key: string, shiftKey = false) => {
    const raiz = fixture.nativeElement.querySelector('.selector') as HTMLElement;
    raiz.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
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

  describe('teclado en la vista de meses', () => {
    beforeEach(async () => {
      fixture.componentRef.setInput('vistaInicial', 'meses');
      await fixture.whenStable();
    });

    it('se mueve de a un mes con las flechas horizontales', async () => {
      // Arranca en septiembre, el mes de la fecha elegida
      expect(opcion('sept')!.tabIndex).toBe(0);

      await teclear('ArrowRight');
      expect(opcion('oct')!.tabIndex).toBe(0);
      expect(opcion('sept')!.tabIndex).toBe(-1);
    });

    // La cuadrícula es de tres columnas: una fila son tres meses
    it('salta una fila entera con las flechas verticales', async () => {
      await teclear('ArrowUp');
      expect(opcion('jun')!.tabIndex).toBe(0);

      await teclear('ArrowDown');
      expect(opcion('sept')!.tabIndex).toBe(0);
    });

    it('va a enero y a diciembre con Home y End', async () => {
      await teclear('Home');
      expect(opcion('ene')!.tabIndex).toBe(0);

      await teclear('End');
      expect(opcion('dic')!.tabIndex).toBe(0);
    });

    it('cambia de año con PageUp y PageDown', async () => {
      await teclear('PageDown');
      expect(titulo()).toContain('2027');

      await teclear('PageUp');
      expect(titulo()).toContain('2026');
    });

    // Mismo motivo que en la grilla de días: con disabled el recorrido quedaría varado
    it('deja atravesar con el teclado los meses sin funciones', async () => {
      fixture.componentRef.setInput('fechasHabilitadas', ['2026-09-24']);
      await fixture.whenStable();

      expect(opcion('oct')!.getAttribute('aria-disabled')).toBe('true');
      expect(opcion('oct')!.hasAttribute('disabled')).toBe(false);

      await teclear('ArrowRight');
      expect(opcion('oct')!.tabIndex).toBe(0);

      // Pero sigue sin poder elegirse
      opcion('oct')!.click();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('[role="grid"]')).toBeNull();
    });
  });

  describe('teclado en la vista de años', () => {
    beforeEach(async () => {
      fixture.componentRef.setInput('vistaInicial', 'anios');
      await fixture.whenStable();
    });

    it('se mueve de a un año con las flechas horizontales', async () => {
      expect(opcion('2026')!.tabIndex).toBe(0);

      await teclear('ArrowLeft');
      expect(opcion('2025')!.tabIndex).toBe(0);
    });

    it('salta tres años con las flechas verticales', async () => {
      await teclear('ArrowUp');
      expect(opcion('2023')!.tabIndex).toBe(0);
    });

    // La página va de 2016 a 2027
    it('va a los bordes de la página con Home y End', async () => {
      await teclear('Home');
      expect(opcion('2016')!.tabIndex).toBe(0);

      await teclear('End');
      expect(opcion('2027')!.tabIndex).toBe(0);
    });

    it('cambia de página con PageDown', async () => {
      await teclear('PageDown');
      expect(titulo()).toContain('2028');
    });
  });

  // El botón de período abre y cierra otra vista: es información que el lector necesita
  it('cuenta con aria-expanded si está en una vista de salto', async () => {
    const periodo = () => fixture.nativeElement.querySelector('.periodo') as HTMLButtonElement;
    expect(periodo().getAttribute('aria-expanded')).toBe('false');

    periodo().click();
    await fixture.whenStable();

    expect(periodo().getAttribute('aria-expanded')).toBe('true');
  });
});
