import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Auth } from '../../core/services/auth';
import { Ingresar } from './ingresar';

describe('Ingresar', () => {
  let fixture: ComponentFixture<Ingresar>;
  let ingresar: ReturnType<typeof vi.fn>;
  let navegar: ReturnType<typeof vi.spyOn>;

  const formulario = () => fixture.nativeElement.querySelector('form') as HTMLFormElement;
  const entradas = () =>
    Array.from(fixture.nativeElement.querySelectorAll('input')) as HTMLInputElement[];
  const errores = () =>
    Array.from(fixture.nativeElement.querySelectorAll('.error')).map((n) =>
      (n as HTMLElement).textContent?.trim(),
    );

  async function escribir(indice: number, texto: string): Promise<void> {
    const entrada = entradas()[indice];
    entrada.value = texto;
    entrada.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function enviar(): Promise<void> {
    formulario().dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    ingresar = vi.fn(async () => null);

    await TestBed.configureTestingModule({
      imports: [Ingresar],
      providers: [provideRouter([]), { provide: Auth, useValue: { ingresar } }],
    }).compileComponents();

    fixture = TestBed.createComponent(Ingresar);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Marcar en rojo un formulario que ni se empezó a completar es hostil
  it('no muestra errores antes del primer intento de envío', () => {
    expect(errores()).toHaveLength(0);
  });

  it('marca los campos vacíos al intentar enviar y no llama a la base', async () => {
    await enviar();

    expect(errores()).toContain('Escribí tu mail.');
    expect(errores()).toContain('Escribí tu contraseña.');
    expect(ingresar).not.toHaveBeenCalled();
  });

  it('manda el mail sin espacios sobrantes', async () => {
    await escribir(0, '  ana@ejemplo.com  ');
    await escribir(1, 'secreta123');
    await enviar();

    expect(ingresar).toHaveBeenCalledWith('ana@ejemplo.com', 'secreta123');
  });

  it('lleva al perfil cuando el ingreso sale bien', async () => {
    await escribir(0, 'ana@ejemplo.com');
    await escribir(1, 'secreta123');
    await enviar();

    expect(navegar).toHaveBeenCalledWith('/perfil');
  });

  // El guard sesionIniciada guarda el destino en volverA para devolver a la pantalla pedida
  it('vuelve a la pantalla que el guard había interrumpido', async () => {
    fixture.componentRef.setInput('volverA', '/perfil/entradas');
    await escribir(0, 'ana@ejemplo.com');
    await escribir(1, 'secreta123');
    await enviar();

    expect(navegar).toHaveBeenCalledWith('/perfil/entradas');
  });

  it('muestra el mensaje traducido cuando las credenciales no coinciden y no navega', async () => {
    ingresar.mockResolvedValue('El mail o la contraseña no coinciden.');

    await escribir(0, 'ana@ejemplo.com');
    await escribir(1, 'mal');
    await enviar();

    const mensaje = fixture.nativeElement.querySelector('app-mensaje') as HTMLElement;

    expect(mensaje.textContent).toContain('El mail o la contraseña no coinciden.');
    expect(navegar).not.toHaveBeenCalled();
  });
});
