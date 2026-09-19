import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { DatosRegistro } from '../../core/models/perfil';
import { Auth } from '../../core/services/auth';
import { SelectorFecha } from '../../shared/selector-fecha/selector-fecha';
import { Registrarme } from './registrarme';

describe('Registrarme', () => {
  let fixture: ComponentFixture<Registrarme>;
  let registrar: ReturnType<typeof vi.fn>;
  let navegar: ReturnType<typeof vi.spyOn>;

  const formulario = () => fixture.nativeElement.querySelector('form') as HTMLFormElement;
  const entradas = () =>
    Array.from(fixture.nativeElement.querySelectorAll('input')) as HTMLInputElement[];
  const listas = () =>
    Array.from(fixture.nativeElement.querySelectorAll('select')) as HTMLSelectElement[];
  const textoDeErrores = () =>
    Array.from(fixture.nativeElement.querySelectorAll('.error'))
      .map((n) => (n as HTMLElement).textContent?.trim())
      .join(' | ');

  /** Orden de los <input> en el formulario: mail, contraseña, nombre, apellido, vacaciones */
  async function escribir(indice: number, texto: string): Promise<void> {
    const entrada = entradas()[indice];
    entrada.value = texto;
    entrada.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function elegir(indice: number, valor: string): Promise<void> {
    const lista = listas()[indice];
    lista.value = valor;
    lista.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  /** Empuja la fecha por el model() del selector, que es su API pública */
  async function elegirFecha(iso: string): Promise<void> {
    const selector = fixture.debugElement.query(By.directive(SelectorFecha))
      .componentInstance as SelectorFecha;
    selector.valor.set(iso);
    await fixture.whenStable();
  }

  async function completarTodo(): Promise<void> {
    await escribir(0, 'ana@ejemplo.com');
    await escribir(1, 'secreta123');
    await escribir(2, 'Ana');
    await escribir(3, 'Gómez');
    await escribir(4, '21');
    await elegir(0, 'O+');
    await elegir(1, 'verdes');
    await elegirFecha('1990-05-14');
  }

  async function enviar(): Promise<void> {
    formulario().dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    registrar = vi.fn(async () => null);

    await TestBed.configureTestingModule({
      imports: [Registrarme],
      providers: [provideRouter([]), { provide: Auth, useValue: { registrar } }],
    }).compileComponents();

    fixture = TestBed.createComponent(Registrarme);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // RF-38: el registro pide siete campos, más la contraseña de la cuenta
  it('presenta los siete campos del registro', () => {
    // mail, contraseña, nombre, apellido y días de vacaciones
    expect(entradas()).toHaveLength(5);
    // tipo de sangre y color de ojos
    expect(listas()).toHaveLength(2);
    // fecha de nacimiento, con el selector propio de la F2 (RNF-08)
    expect(fixture.debugElement.query(By.directive(SelectorFecha))).not.toBeNull();
  });

  it('no muestra errores antes del primer intento de envío', () => {
    expect(fixture.nativeElement.querySelectorAll('.error')).toHaveLength(0);
  });

  it('marca todos los campos que faltan y no llama a la base', async () => {
    await enviar();

    const errores = textoDeErrores();

    expect(errores).toContain('Escribí tu mail.');
    expect(errores).toContain('La contraseña necesita al menos 6 caracteres.');
    expect(errores).toContain('Escribí tu nombre.');
    expect(errores).toContain('Escribí tu apellido.');
    expect(errores).toContain('Elegí tu fecha de nacimiento.');
    expect(errores).toContain('Elegí tu tipo de sangre.');
    expect(errores).toContain('Elegí tu color de ojos.');
    expect(errores).toContain('Escribí cuántos días de vacaciones tenés por año.');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('rechaza un mail sin dominio', async () => {
    await completarTodo();
    await escribir(0, 'ana@');
    await enviar();

    expect(textoDeErrores()).toContain('Ese mail no parece válido.');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('rechaza una contraseña de menos de 6 caracteres, que es el mínimo de Supabase', async () => {
    await completarTodo();
    await escribir(1, '12345');
    await enviar();

    expect(textoDeErrores()).toContain('La contraseña necesita al menos 6 caracteres.');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('rechaza días de vacaciones fuera del rango 0 a 365', async () => {
    await completarTodo();
    await escribir(4, '400');
    await enviar();

    expect(textoDeErrores()).toContain('Tiene que ser un número entre 0 y 365.');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('acepta cero días de vacaciones: es un valor válido, no un campo vacío', async () => {
    await completarTodo();
    await escribir(4, '0');
    await enviar();

    expect(registrar).toHaveBeenCalledOnce();
    expect((registrar.mock.calls[0][0] as DatosRegistro).diasVacaciones).toBe(0);
  });

  // El selector nunca ofrece una fecha futura, pero el tope queda explícito
  it('no deja elegir una fecha posterior a hoy', () => {
    const selector = fixture.debugElement.query(By.directive(SelectorFecha))
      .componentInstance as SelectorFecha;
    const hoy = new Date().toISOString().slice(0, 10);

    expect(selector.maximo()).toBe(hoy);
  });

  it('manda los siete campos y navega al perfil', async () => {
    await completarTodo();
    await enviar();

    expect(registrar).toHaveBeenCalledWith({
      email: 'ana@ejemplo.com',
      password: 'secreta123',
      nombre: 'Ana',
      apellido: 'Gómez',
      fechaNacimiento: '1990-05-14',
      tipoSangre: 'O+',
      colorOjos: 'verdes',
      diasVacaciones: 21,
    });
    expect(navegar).toHaveBeenCalledWith('/perfil');
  });

  it('muestra el error de la base sin navegar', async () => {
    registrar.mockResolvedValue('Ya existe una cuenta con ese mail.');

    await completarTodo();
    await enviar();

    expect(fixture.nativeElement.textContent).toContain('Ya existe una cuenta con ese mail.');
    expect(navegar).not.toHaveBeenCalled();
  });

  // RF-38.1 y RNF-11: el trato con el usuario se dice en la pantalla, no en la letra chica
  it('avisa que los tres datos sin uso funcional no los ve nadie más', () => {
    expect(fixture.nativeElement.textContent).toContain('Estos tres datos los ves solo vos');
  });

  // El formulario es largo: sin resumen, el primer error puede quedar fuera de pantalla
  it('muestra un resumen enfocable cuando el envío falla (WCAG 3.3.1)', async () => {
    await enviar();

    const resumen = fixture.nativeElement.querySelector('.resumen') as HTMLElement;

    expect(resumen).not.toBeNull();
    expect(resumen.tabIndex).toBe(-1);
  });
});
