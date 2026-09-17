import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Spinner } from './spinner';

describe('Spinner', () => {
  let fixture: ComponentFixture<Spinner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Spinner] }).compileComponents();
    fixture = TestBed.createComponent(Spinner);
    await fixture.whenStable();
  });

  // El anillo es decorativo: sin este texto el lector de pantalla no anuncia nada
  it('anuncia la etiqueta con role status', async () => {
    fixture.componentRef.setInput('etiqueta', 'Buscando funciones');
    await fixture.whenStable();

    const spinner = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;

    expect(spinner.textContent).toContain('Buscando funciones');
  });
});
