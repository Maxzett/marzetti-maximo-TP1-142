import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Tarjeta } from './tarjeta';

describe('Tarjeta', () => {
  let fixture: ComponentFixture<Tarjeta>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Tarjeta] }).compileComponents();
    fixture = TestBed.createComponent(Tarjeta);
    await fixture.whenStable();
  });

  it('marca la variante destacada', async () => {
    const caja = () => fixture.nativeElement.querySelector('.tarjeta') as HTMLElement;

    expect(caja().classList.contains('tarjeta--destacada')).toBe(false);

    fixture.componentRef.setInput('destacada', true);
    await fixture.whenStable();

    expect(caja().classList.contains('tarjeta--destacada')).toBe(true);
  });
});
