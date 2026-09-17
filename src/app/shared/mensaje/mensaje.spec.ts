import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Mensaje } from './mensaje';

describe('Mensaje', () => {
  let fixture: ComponentFixture<Mensaje>;

  const caja = () => fixture.nativeElement.querySelector('.mensaje') as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Mensaje] }).compileComponents();
    fixture = TestBed.createComponent(Mensaje);
    await fixture.whenStable();
  });

  // Un error interrumpe al lector de pantalla; un aviso espera su turno
  it('usa role alert solo para el error', async () => {
    expect(caja().getAttribute('role')).toBe('status');

    fixture.componentRef.setInput('tono', 'error');
    await fixture.whenStable();

    expect(caja().getAttribute('role')).toBe('alert');
  });

  it('antepone la palabra del tono, para no depender del color', async () => {
    fixture.componentRef.setInput('tono', 'exito');
    await fixture.whenStable();

    expect(caja().textContent).toContain('Listo:');
  });
});
