import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OpcionSeleccion, Seleccion } from './seleccion';

const OPCIONES: readonly OpcionSeleccion[] = [
  { valor: 'A+', texto: 'A positivo' },
  { valor: 'O-', texto: 'O negativo' },
];

describe('Seleccion', () => {
  let fixture: ComponentFixture<Seleccion>;

  const lista = () => fixture.nativeElement.querySelector('select') as HTMLSelectElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Seleccion] }).compileComponents();
    fixture = TestBed.createComponent(Seleccion);
    fixture.componentRef.setInput('etiqueta', 'Tipo de sangre');
    fixture.componentRef.setInput('opciones', OPCIONES);
    await fixture.whenStable();
  });

  it('ata la etiqueta con el select', () => {
    const etiqueta = fixture.nativeElement.querySelector('label') as HTMLLabelElement;

    expect(etiqueta.htmlFor).toBe(lista().id);
    expect(etiqueta.textContent).toContain('Tipo de sangre');
  });

  // La opción vacía evita que el campo arranque con un valor que nadie eligió
  it('dibuja la opción vacía además de las recibidas', () => {
    const opciones = lista().querySelectorAll('option');

    expect(opciones.length).toBe(OPCIONES.length + 1);
    expect(opciones[0].value).toBe('');
    expect(opciones[1].textContent).toContain('A positivo');
  });

  it('actualiza el valor al elegir', async () => {
    lista().value = 'O-';
    lista().dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(fixture.componentInstance.valor()).toBe('O-');
  });

  it('describe el campo con la ayuda cuando no hay error', async () => {
    fixture.componentRef.setInput('ayuda', 'Nos lo pidió el cine');
    await fixture.whenStable();

    const ayuda = fixture.nativeElement.querySelector('.ayuda') as HTMLElement;

    expect(lista().getAttribute('aria-describedby')).toBe(ayuda.id);
    expect(lista().getAttribute('aria-invalid')).toBeNull();
  });

  // Mismo criterio que <app-campo>: el error reemplaza a la ayuda, no se suma
  it('reemplaza la ayuda por el error y marca el campo como inválido', async () => {
    fixture.componentRef.setInput('ayuda', 'Nos lo pidió el cine');
    fixture.componentRef.setInput('error', 'Elegí tu tipo de sangre.');
    await fixture.whenStable();

    const error = fixture.nativeElement.querySelector('.error') as HTMLElement;

    expect(fixture.nativeElement.querySelector('.ayuda')).toBeNull();
    expect(lista().getAttribute('aria-describedby')).toBe(error.id);
    expect(lista().getAttribute('aria-invalid')).toBe('true');
    expect(error.getAttribute('role')).toBe('alert');
  });

  // El error no se comunica solo con el borde rojo (RNF-10)
  it('acompaña el error con un ícono además del color', async () => {
    fixture.componentRef.setInput('error', 'Elegí tu tipo de sangre.');
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.error svg')).not.toBeNull();
  });
});
