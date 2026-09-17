import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Campo } from './campo';

describe('Campo', () => {
  let fixture: ComponentFixture<Campo>;

  const entrada = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Campo] }).compileComponents();
    fixture = TestBed.createComponent(Campo);
    fixture.componentRef.setInput('etiqueta', 'Mail');
    await fixture.whenStable();
  });

  it('ata la etiqueta con el input', () => {
    const etiqueta = fixture.nativeElement.querySelector('label') as HTMLLabelElement;

    expect(etiqueta.htmlFor).toBe(entrada().id);
    expect(etiqueta.textContent).toContain('Mail');
  });

  it('describe el campo con la ayuda cuando no hay error', async () => {
    fixture.componentRef.setInput('ayuda', 'Te mandamos el QR acá');
    await fixture.whenStable();

    const ayuda = fixture.nativeElement.querySelector('.ayuda') as HTMLElement;

    expect(entrada().getAttribute('aria-describedby')).toBe(ayuda.id);
    expect(entrada().getAttribute('aria-invalid')).toBeNull();
  });

  // El error reemplaza a la ayuda: dos textos a la vez se contradicen
  it('reemplaza la ayuda por el error y marca el campo como inválido', async () => {
    fixture.componentRef.setInput('ayuda', 'Te mandamos el QR acá');
    fixture.componentRef.setInput('error', 'Falta el dominio del mail');
    await fixture.whenStable();

    const error = fixture.nativeElement.querySelector('.error') as HTMLElement;

    expect(fixture.nativeElement.querySelector('.ayuda')).toBeNull();
    expect(entrada().getAttribute('aria-describedby')).toBe(error.id);
    expect(entrada().getAttribute('aria-invalid')).toBe('true');
  });

  it('actualiza el valor al escribir', async () => {
    entrada().value = 'maxi@correo.com';
    entrada().dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(fixture.componentInstance.valor()).toBe('maxi@correo.com');
  });
});
