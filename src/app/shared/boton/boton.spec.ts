import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Boton } from './boton';

describe('Boton', () => {
  let fixture: ComponentFixture<Boton>;

  const boton = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Boton] }).compileComponents();
    fixture = TestBed.createComponent(Boton);
    await fixture.whenStable();
  });

  it('aplica la clase de la variante', async () => {
    fixture.componentRef.setInput('variante', 'borde');
    await fixture.whenStable();

    expect(boton().className).toContain('boton--borde');
  });

  it('emite presionado al hacer clic', async () => {
    let veces = 0;
    fixture.componentInstance.presionado.subscribe(() => veces++);

    boton().click();

    expect(veces).toBe(1);
  });

  it('queda inerte mientras carga, para no disparar dos veces la misma compra', async () => {
    fixture.componentRef.setInput('cargando', true);
    await fixture.whenStable();

    expect(boton().disabled).toBe(true);
  });
});
