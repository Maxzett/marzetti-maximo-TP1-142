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

  it('no dispara dos veces la misma compra mientras carga', async () => {
    let veces = 0;
    fixture.componentInstance.presionado.subscribe(() => veces++);
    fixture.componentRef.setInput('cargando', true);
    await fixture.whenStable();

    boton().click();

    expect(veces).toBe(0);
  });

  /*
   * El disabled nativo le saca el foco al botón y lo manda al <body>: quien navega con
   * teclado se queda sin referencia justo cuando algo está pasando.
   */
  it('conserva el foco mientras carga y avisa que está trabajando', async () => {
    boton().focus();
    fixture.componentRef.setInput('cargando', true);
    await fixture.whenStable();

    expect(document.activeElement).toBe(boton());
    expect(boton().disabled).toBe(false);
    expect(boton().getAttribute('aria-disabled')).toBe('true');
    expect(boton().getAttribute('aria-busy')).toBe('true');
  });

  // El deshabilitado de verdad sí usa disabled: no hay nada en curso que valga la pena seguir
  it('usa el disabled nativo cuando está deshabilitado', async () => {
    fixture.componentRef.setInput('deshabilitado', true);
    await fixture.whenStable();

    expect(boton().disabled).toBe(true);
    expect(boton().getAttribute('aria-busy')).toBeNull();
  });

  /*
   * Con aria-disabled el clic llega igual, y en un type="submit" arrastraría el envío del
   * formulario. Se corta con preventDefault, que también tapa el Enter, porque el navegador
   * lo convierte en clic.
   */
  it('frena el envío del formulario mientras carga', async () => {
    fixture.componentRef.setInput('tipo', 'submit');
    fixture.componentRef.setInput('cargando', true);
    await fixture.whenStable();

    const clic = new MouseEvent('click', { bubbles: true, cancelable: true });
    boton().dispatchEvent(clic);

    expect(clic.defaultPrevented).toBe(true);
  });
});
