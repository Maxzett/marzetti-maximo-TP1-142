import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectorHora } from './selector-hora';

describe('SelectorHora', () => {
  let fixture: ComponentFixture<SelectorHora>;

  const opciones = () =>
    [...fixture.nativeElement.querySelectorAll('.opcion')] as HTMLButtonElement[];

  const porTexto = (texto: string) =>
    opciones().find((boton) => boton.textContent?.trim() === texto)!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SelectorHora] }).compileComponents();
    fixture = TestBed.createComponent(SelectorHora);
    await fixture.whenStable();
  });

  // Modo libre: el alta de funciones del admin
  it('muestra las 24 horas y los minutos del paso, sin scroll', () => {
    fixture.componentRef.setInput('pasoMinutos', 15);

    expect(opciones()).toHaveLength(24 + 4);
  });

  it('arma la hora combinando las dos cuadrículas', async () => {
    porTexto('18').click();
    await fixture.whenStable();

    // Sin minutos elegidos todavía, asume en punto
    expect(fixture.componentInstance.valor()).toBe('18:00');

    porTexto('45').click();
    await fixture.whenStable();

    expect(fixture.componentInstance.valor()).toBe('18:45');
  });

  it('respeta el paso de minutos', async () => {
    fixture.componentRef.setInput('pasoMinutos', 30);
    await fixture.whenStable();

    expect(porTexto('30')).toBeDefined();
    expect(opciones()).toHaveLength(24 + 2);
  });

  // Modo lista: la compra, donde solo existen los horarios programados
  it('con opciones muestra solo esos horarios', async () => {
    fixture.componentRef.setInput('opciones', ['18:40', '21:10', '23:30']);
    await fixture.whenStable();

    expect(opciones()).toHaveLength(3);

    porTexto('21:10').click();
    await fixture.whenStable();

    expect(fixture.componentInstance.valor()).toBe('21:10');
    // aria-checked y no aria-pressed: son alternativas de lo mismo, no botones de dos estados
    expect(porTexto('21:10').getAttribute('aria-checked')).toBe('true');
    expect(porTexto('18:40').getAttribute('aria-checked')).toBe('false');
  });

  it('avisa cuando ese día no hay funciones', async () => {
    fixture.componentRef.setInput('opciones', []);
    await fixture.whenStable();

    expect((fixture.nativeElement.querySelector('.vacio') as HTMLElement).textContent).toContain(
      'No hay funciones',
    );
  });

  const teclear = async (etiquetaDelGrupo: string, key: string) => {
    const grupo = fixture.nativeElement.querySelector(
      `[role="radiogroup"][aria-label="${etiquetaDelGrupo}"]`,
    ) as HTMLElement;
    grupo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await fixture.whenStable();
  };

  /*
   * Antes había que apretar Tab veinticuatro veces para llegar de las 00 a las 23. Ahora cada
   * cuadrícula es una sola parada de Tab y adentro mandan las flechas, que además eligen:
   * es el teclado del radiogroup de WAI-ARIA.
   */
  describe('teclado', () => {
    it('cada grupo es una sola parada de Tab', async () => {
      await fixture.whenStable();

      const tabulables = opciones().filter((boton) => boton.tabIndex === 0);
      // Uno por cuadrícula: la primera hora y el primer minuto, porque todavía no se eligió nada
      expect(tabulables).toHaveLength(2);
      expect(tabulables[0].textContent?.trim()).toBe('00');
    });

    it('las flechas mueven y eligen en el mismo gesto', async () => {
      await teclear('Hora', 'ArrowRight');
      expect(fixture.componentInstance.valor()).toBe('01:00');

      await teclear('Hora', 'ArrowLeft');
      expect(fixture.componentInstance.valor()).toBe('00:00');
    });

    // La cuadrícula de horas es de seis columnas: una fila son seis horas
    it('salta una fila entera con las flechas verticales', async () => {
      await teclear('Hora', 'ArrowDown');
      expect(fixture.componentInstance.valor()).toBe('06:00');

      await teclear('Hora', 'ArrowUp');
      expect(fixture.componentInstance.valor()).toBe('00:00');
    });

    it('va a los bordes con Home y End', async () => {
      await teclear('Hora', 'End');
      expect(fixture.componentInstance.valor()).toBe('23:00');

      await teclear('Hora', 'Home');
      expect(fixture.componentInstance.valor()).toBe('00:00');
    });

    // Como en un grupo de radios nativo: de la última se pasa a la primera
    it('da la vuelta en los bordes', async () => {
      await teclear('Hora', 'ArrowLeft');
      expect(fixture.componentInstance.valor()).toBe('23:00');

      await teclear('Hora', 'ArrowRight');
      expect(fixture.componentInstance.valor()).toBe('00:00');
    });

    it('mueve el foco al botón que acaba de elegir', async () => {
      await teclear('Hora', 'ArrowRight');

      expect((document.activeElement as HTMLElement).textContent?.trim()).toBe('01');
    });

    it('la cuadrícula de minutos se recorre aparte de la de horas', async () => {
      await teclear('Minutos', 'ArrowRight');
      expect(fixture.componentInstance.valor()).toBe('00:15');

      await teclear('Hora', 'ArrowRight');
      // Cambiar de hora no pierde los minutos ya elegidos
      expect(fixture.componentInstance.valor()).toBe('01:15');
    });

    /*
     * Con paso de 15 entran cuatro minutos en una sola fila: no hay nada arriba ni abajo,
     * así que la flecha vertical se queda donde está en vez de dar una vuelta que el ojo
     * no puede seguir. Marcar el que ya estaba enfocado sí es lo que hace un radio nativo.
     */
    it('no salta a otro minuto cuando todos entran en una fila', async () => {
      await teclear('Minutos', 'ArrowDown');
      expect(fixture.componentInstance.valor()).toBe('00:00');

      // La horizontal sí se mueve, porque ahí sí hay opciones al lado
      await teclear('Minutos', 'ArrowRight');
      expect(fixture.componentInstance.valor()).toBe('00:15');

      await teclear('Minutos', 'ArrowDown');
      expect(fixture.componentInstance.valor()).toBe('00:15');
    });

    it('en la lista de horarios arriba y abajo valen lo mismo que izquierda y derecha', async () => {
      fixture.componentRef.setInput('opciones', ['18:40', '21:10', '23:30']);
      await fixture.whenStable();

      await teclear('Elegí un horario', 'ArrowDown');
      expect(fixture.componentInstance.valor()).toBe('21:10');

      await teclear('Elegí un horario', 'ArrowUp');
      expect(fixture.componentInstance.valor()).toBe('18:40');
    });

    it('frena el scroll de la página al usar las flechas', async () => {
      const grupo = fixture.nativeElement.querySelector('[aria-label="Hora"]') as HTMLElement;
      const evento = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      grupo.dispatchEvent(evento);

      expect(evento.defaultPrevented).toBe(true);
    });
  });
});
