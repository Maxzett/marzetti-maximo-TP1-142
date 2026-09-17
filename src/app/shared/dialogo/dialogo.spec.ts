import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dialogo } from './dialogo';

describe('Dialogo', () => {
  let fixture: ComponentFixture<Dialogo>;

  const dialogo = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Dialogo] }).compileComponents();
    fixture = TestBed.createComponent(Dialogo);
    fixture.componentRef.setInput('titulo', 'Butacas VIP');
    await fixture.whenStable();
  });

  it('arranca cerrado', () => {
    expect(fixture.componentInstance.abierto()).toBe(false);
    expect(dialogo().open).toBe(false);
  });

  // aria-labelledby y no aria-label: el título ya está escrito, no hace falta repetirlo
  it('usa el título visible como nombre accesible', () => {
    const titulo = fixture.nativeElement.querySelector('.titulo') as HTMLElement;

    expect(dialogo().getAttribute('aria-labelledby')).toBe(titulo.id);
    expect(titulo.textContent).toContain('Butacas VIP');
  });

  it('avisa cuando lo cierra el navegador, por ejemplo con Escape', async () => {
    let cerrados = 0;
    fixture.componentInstance.cerrado.subscribe(() => cerrados++);

    dialogo().dispatchEvent(new Event('close'));
    await fixture.whenStable();

    expect(cerrados).toBe(1);
    expect(fixture.componentInstance.abierto()).toBe(false);
  });
});
