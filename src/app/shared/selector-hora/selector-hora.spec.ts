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
    expect(porTexto('21:10').getAttribute('aria-pressed')).toBe('true');
  });

  it('avisa cuando ese día no hay funciones', async () => {
    fixture.componentRef.setInput('opciones', []);
    await fixture.whenStable();

    expect((fixture.nativeElement.querySelector('.vacio') as HTMLElement).textContent).toContain(
      'No hay funciones',
    );
  });
});
