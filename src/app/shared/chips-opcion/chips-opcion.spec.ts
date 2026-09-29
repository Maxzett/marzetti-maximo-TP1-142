import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChipsOpcion } from './chips-opcion';

describe('ChipsOpcion', () => {
  let fixture: ComponentFixture<ChipsOpcion>;

  const chips = () => [...fixture.nativeElement.querySelectorAll('.chip')] as HTMLButtonElement[];

  const porEtiqueta = (etiqueta: string) =>
    chips().find((boton) => boton.textContent?.trim() === etiqueta)!;

  const opciones = [
    { valor: 'a', etiqueta: 'Hoy 28/9' },
    { valor: 'b', etiqueta: 'Mañana 29/9' },
    { valor: 'c', etiqueta: 'Mié 30/9' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChipsOpcion] }).compileComponents();
    fixture = TestBed.createComponent(ChipsOpcion);
    fixture.componentRef.setInput('opciones', opciones);
    fixture.componentRef.setInput('etiqueta', 'Día de la función');
    await fixture.whenStable();
  });

  it('muestra un chip por opción, con su etiqueta como texto', () => {
    expect(chips()).toHaveLength(3);
    expect(porEtiqueta('Hoy 28/9')).toBeDefined();
  });

  it('el grupo es un radiogroup nombrado por la etiqueta que se ve', () => {
    const elemento = fixture.nativeElement as HTMLElement;
    const grupo = elemento.querySelector('[role="radiogroup"]') as HTMLElement;
    const etiqueta = elemento.querySelector(`#${grupo.getAttribute('aria-labelledby')}`);

    expect(etiqueta?.textContent?.trim()).toBe('Día de la función');
    expect(etiqueta?.classList).toContain('etiqueta');
  });

  it('clic en un chip fija el valor', async () => {
    porEtiqueta('Mañana 29/9').click();
    await fixture.whenStable();

    expect(fixture.componentInstance.valor()).toBe('b');
  });

  // aria-checked y no aria-pressed: son alternativas de lo mismo, no botones de dos estados
  it('aria-checked solo en el chip elegido', async () => {
    fixture.componentRef.setInput('valor', 'b');
    await fixture.whenStable();

    expect(porEtiqueta('Mañana 29/9').getAttribute('aria-checked')).toBe('true');
    expect(porEtiqueta('Hoy 28/9').getAttribute('aria-checked')).toBe('false');
  });

  it('el check solo se ve en el chip elegido', async () => {
    fixture.componentRef.setInput('valor', 'b');
    await fixture.whenStable();

    expect(porEtiqueta('Mañana 29/9').querySelector('svg')).toBeTruthy();
    expect(porEtiqueta('Hoy 28/9').querySelector('svg')).toBeFalsy();
  });

  it('sin opciones muestra un mensaje en vez de romper', async () => {
    fixture.componentRef.setInput('opciones', []);
    await fixture.whenStable();

    expect((fixture.nativeElement.querySelector('.vacio') as HTMLElement).textContent).toContain(
      'No hay opciones',
    );
  });

  const teclear = async (key: string) => {
    const grupo = fixture.nativeElement.querySelector('[role="radiogroup"]') as HTMLElement;
    const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    grupo.dispatchEvent(evento);
    await fixture.whenStable();
    return evento;
  };

  describe('teclado', () => {
    it('una sola parada de Tab, en la primera opción si nada se eligió', async () => {
      const tabulables = chips().filter((boton) => boton.tabIndex === 0);
      expect(tabulables).toHaveLength(1);
      expect(tabulables[0].textContent?.trim()).toBe('Hoy 28/9');
    });

    it('las flechas mueven y eligen en el mismo gesto', async () => {
      // Sin nada elegido, el recorrido arranca en la primera opción ('a')
      await teclear('ArrowRight');
      expect(fixture.componentInstance.valor()).toBe('b');

      await teclear('ArrowRight');
      expect(fixture.componentInstance.valor()).toBe('c');
    });

    // Como en un grupo de radios nativo: de la última se pasa a la primera
    it('da la vuelta en los bordes', async () => {
      fixture.componentRef.setInput('valor', 'c');
      await fixture.whenStable();

      await teclear('ArrowRight');
      expect(fixture.componentInstance.valor()).toBe('a');
    });

    it('Home y End van a los extremos', async () => {
      await teclear('End');
      expect(fixture.componentInstance.valor()).toBe('c');

      await teclear('Home');
      expect(fixture.componentInstance.valor()).toBe('a');
    });

    it('mueve el foco al chip recién elegido', async () => {
      await teclear('ArrowRight');
      expect((document.activeElement as HTMLElement).textContent?.trim()).toBe('Mañana 29/9');
    });

    it('frena el scroll de la página al usar las flechas', async () => {
      const evento = await teclear('ArrowRight');
      expect(evento.defaultPrevented).toBe(true);
    });
  });
});
