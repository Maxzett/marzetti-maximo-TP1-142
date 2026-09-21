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

  describe('multilínea', () => {
    const area = () => fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    beforeEach(async () => {
      fixture.componentRef.setInput('filas', 4);
      await fixture.whenStable();
    });

    it('con filas dibuja un textarea en lugar del input', () => {
      expect(area()).not.toBeNull();
      expect(area().rows).toBe(4);
      expect(entrada()).toBeNull();
    });

    it('ata la etiqueta con el textarea', () => {
      const etiqueta = fixture.nativeElement.querySelector('label') as HTMLLabelElement;

      expect(etiqueta.htmlFor).toBe(area().id);
    });

    it('actualiza el valor al escribir', async () => {
      area().value = 'Muy buena';
      area().dispatchEvent(new Event('input'));
      await fixture.whenStable();

      expect(fixture.componentInstance.valor()).toBe('Muy buena');
    });

    it('marca el error y lo enlaza igual que el input', async () => {
      fixture.componentRef.setInput('error', 'Muy largo');
      await fixture.whenStable();

      const error = fixture.nativeElement.querySelector('.error') as HTMLElement;
      expect(area().getAttribute('aria-invalid')).toBe('true');
      expect(area().getAttribute('aria-describedby')).toBe(error.id);
    });
  });

  describe('largo máximo', () => {
    it('sin tope no muestra contador', () => {
      expect(fixture.nativeElement.querySelector('.contador')).toBeNull();
    });

    it('con tope muestra cuántos caracteres van y frena el tipeo en el navegador', async () => {
      fixture.componentRef.setInput('filas', 3);
      fixture.componentRef.setInput('largoMaximo', 500);
      fixture.componentInstance.valor.set('hola');
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.contador')?.textContent).toContain('4 / 500');
      expect(fixture.nativeElement.querySelector('textarea')?.getAttribute('maxlength')).toBe(
        '500',
      );
    });
  });

  // El describedby solo sirve si el foco está en el campo; el alert cubre el error del submit
  it('anuncia el error con role alert', async () => {
    fixture.componentRef.setInput('error', 'Falta el dominio del mail');
    await fixture.whenStable();

    const error = fixture.nativeElement.querySelector('.error') as HTMLElement;
    expect(error.getAttribute('role')).toBe('alert');
  });
});
