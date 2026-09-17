import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Chip } from './chip';

describe('Chip', () => {
  let fixture: ComponentFixture<Chip>;

  const boton = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Chip] }).compileComponents();
    fixture = TestBed.createComponent(Chip);
    await fixture.whenStable();
  });

  it('empieza inactivo y lo dice con aria-pressed', () => {
    expect(boton().getAttribute('aria-pressed')).toBe('false');
  });

  it('alterna el estado al hacer clic', async () => {
    boton().click();
    await fixture.whenStable();

    expect(fixture.componentInstance.activo()).toBe(true);
    expect(boton().getAttribute('aria-pressed')).toBe('true');
    // El activo no depende solo del color: agrega el tilde
    expect(fixture.nativeElement.querySelector('svg')).not.toBeNull();
  });

  it('no alterna cuando está deshabilitado', async () => {
    fixture.componentRef.setInput('deshabilitado', true);
    await fixture.whenStable();

    boton().click();
    await fixture.whenStable();

    expect(fixture.componentInstance.activo()).toBe(false);
  });
});
