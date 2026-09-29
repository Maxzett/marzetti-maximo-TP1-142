import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CampoFecha } from './campo-fecha';

describe('CampoFecha', () => {
  let fixture: ComponentFixture<CampoFecha>;

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
    await TestBed.configureTestingModule({ imports: [CampoFecha] }).compileComponents();
    fixture = TestBed.createComponent(CampoFecha);
    fixture.componentRef.setInput('etiqueta', 'Fecha de nacimiento');
    await fixture.whenStable();
  });

  it('nunca usa <input type=date> ni <select>: RNF-08 los prohíbe', () => {
    expect(input().type).toBe('text');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  it('pide teclado numérico sin ser un input de tipo date', () => {
    expect(input().getAttribute('inputmode')).toBe('numeric');
  });

  it('inserta barras mientras se tipea', async () => {
    await escribir('15102026');
    expect(input().value).toBe('15/10/2026');
  });

  it('convierte a ISO al completar una fecha válida', async () => {
    await escribir('15102026');
    expect(fixture.componentInstance.valor()).toBe('2026-10-15');
  });

  it('una fecha que no existe no actualiza el valor y muestra error', async () => {
    await escribir('31022026');
    expect(fixture.componentInstance.valor()).toBe('');
    expect(error()?.textContent).toContain('válida');
  });

  it('fuera de rango no actualiza el valor y explica el límite', async () => {
    fixture.componentRef.setInput('minimo', '1920-01-01');
    fixture.componentRef.setInput('maximo', '2020-01-01');
    await fixture.whenStable();

    await escribir('01011900');
    expect(fixture.componentInstance.valor()).toBe('');
    expect(error()?.textContent).toContain('entre el');
  });

  it('no muestra error mientras la fecha está incompleta', async () => {
    await escribir('15');
    expect(error()).toBeNull();
  });

  it('un valor puesto desde afuera se refleja como texto DD/MM/AAAA', async () => {
    fixture.componentRef.setInput('valor', '2026-09-24');
    await fixture.whenStable();

    expect(input().value).toBe('24/09/2026');
  });

  it('vacío no muestra error por su cuenta: "obligatorio" lo decide la pantalla', async () => {
    fixture.componentRef.setInput('requerido', true);
    await fixture.whenStable();

    expect(error()).toBeNull();
  });

  it('muestra el error que le pasa la pantalla', async () => {
    fixture.componentRef.setInput('error', 'Elegí tu fecha de nacimiento.');
    await fixture.whenStable();

    expect(error()?.textContent).toContain('Elegí tu fecha de nacimiento.');
  });

  it('el error propio (formato/rango) tiene prioridad sobre uno vacío de la pantalla', async () => {
    await escribir('31022026');
    expect(error()?.textContent).toContain('válida');
  });

  it('borrar todo deja el valor vacío', async () => {
    await escribir('15102026');
    await escribir('');

    expect(fixture.componentInstance.valor()).toBe('');
  });

  // Regresión: tipear letras o dígitos de más sobre una fecha ya completa dejaba el
  // sobrante pegado en pantalla porque el texto filtrado no "cambiaba" para Angular
  it('letras y dígitos de más tipeados sobre una fecha completa no quedan en pantalla', async () => {
    await tipear('15102026');
    expect(input().value).toBe('15/10/2026');

    await tipear('xyz9999');
    expect(input().value).toBe('15/10/2026');
    expect(fixture.componentInstance.valor()).toBe('2026-10-15');
  });
});
