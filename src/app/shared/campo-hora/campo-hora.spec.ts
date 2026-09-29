import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CampoHora } from './campo-hora';

describe('CampoHora', () => {
  let fixture: ComponentFixture<CampoHora>;

  const input = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const error = () => fixture.nativeElement.querySelector('.error') as HTMLElement | null;

  const escribir = async (texto: string) => {
    const elemento = input();
    elemento.value = texto;
    elemento.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  /** Simula tipear letra por letra, como hace el navegador: cada tecla se agrega al value ya puesto */
  const tipear = async (texto: string) => {
    for (const caracter of texto) {
      const elemento = input();
      elemento.value = elemento.value + caracter;
      elemento.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CampoHora] }).compileComponents();
    fixture = TestBed.createComponent(CampoHora);
    fixture.componentRef.setInput('etiqueta', 'Horario de comienzo');
    await fixture.whenStable();
  });

  it('nunca usa <input type=time> ni <select>: RNF-08 los prohíbe', () => {
    expect(input().type).toBe('text');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  it('inserta los dos puntos mientras se tipea', async () => {
    await escribir('1845');
    expect(input().value).toBe('18:45');
  });

  it('fija el valor con un horario válido', async () => {
    await escribir('1845');
    expect(fixture.componentInstance.valor()).toBe('18:45');
  });

  it('rechaza una hora fuera de 00-23', async () => {
    await escribir('2545');
    expect(fixture.componentInstance.valor()).toBe('');
    expect(error()?.textContent).toContain('válido');
  });

  it('con paso de minutos, rechaza lo que no es múltiplo', async () => {
    fixture.componentRef.setInput('pasoMinutos', 15);
    await fixture.whenStable();

    await escribir('1807');
    expect(fixture.componentInstance.valor()).toBe('');
    expect(error()?.textContent).toContain('cada 15 minutos');

    await escribir('1815');
    expect(fixture.componentInstance.valor()).toBe('18:15');
  });

  it('sin pasoMinutos, cualquier minuto vale', async () => {
    await escribir('1807');
    expect(fixture.componentInstance.valor()).toBe('18:07');
  });

  it('no muestra error mientras el horario está incompleto', async () => {
    await escribir('18');
    expect(error()).toBeNull();
  });

  it('vacío no muestra error por su cuenta: "obligatorio" lo decide la pantalla', async () => {
    fixture.componentRef.setInput('requerido', true);
    await fixture.whenStable();

    expect(error()).toBeNull();
  });

  it('muestra el error que le pasa la pantalla', async () => {
    fixture.componentRef.setInput('error', 'Elegí el horario.');
    await fixture.whenStable();

    expect(error()?.textContent).toContain('Elegí el horario.');
  });

  // Regresión: tipear letras o dígitos de más sobre un horario ya completo dejaba el
  // sobrante pegado en pantalla porque el texto filtrado no "cambiaba" para Angular
  it('letras y dígitos de más tipeados sobre un horario completo no quedan en pantalla', async () => {
    await tipear('1845');
    expect(input().value).toBe('18:45');

    await tipear('xyz9999');
    expect(input().value).toBe('18:45');
    expect(fixture.componentInstance.valor()).toBe('18:45');
  });
});
