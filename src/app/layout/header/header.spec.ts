import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Perfil, RolUsuario } from '../../core/models/perfil';
import { Auth } from '../../core/services/auth';
import { Header } from './header';

const PERFIL: Perfil = {
  id: 'uuid-1',
  email: 'ana@ejemplo.com',
  nombre: 'Ana',
  apellido: 'Gómez',
  fecha_nacimiento: '1990-05-14',
  rol: 'cliente',
  creado_at: '2026-09-18T12:00:00Z',
};

const salir = vi.fn(async () => undefined);

async function montar(rol: RolUsuario | null): Promise<ComponentFixture<Header>> {
  const perfil = rol ? { ...PERFIL, rol } : null;

  await TestBed.configureTestingModule({
    imports: [Header],
    // routerLink necesita un router configurado
    providers: [
      provideRouter([]),
      {
        provide: Auth,
        useValue: {
          haySesion: signal(rol !== null),
          perfil: signal(perfil),
          esPersonal: signal(rol === 'empleado' || rol === 'admin'),
          esAdmin: signal(rol === 'admin'),
          salir,
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Header);
  await fixture.whenStable();
  return fixture;
}

describe('Header', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    salir.mockClear();
  });

  describe('navegación principal', () => {
    const enlaces = (fixture: ComponentFixture<Header>) =>
      Array.from(fixture.nativeElement.querySelectorAll('nav a') as NodeListOf<HTMLAnchorElement>);

    it('lleva a la cartelera y al catálogo completo', async () => {
      const fixture = await montar(null);

      const destinos = enlaces(fixture).map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
      expect(destinos).toEqual([
        ['Cartelera', '/'],
        ['Películas', '/peliculas'],
      ]);
    });

    it('funciona igual con la sesión abierta', async () => {
      const fixture = await montar('cliente');

      expect(enlaces(fixture).map((a) => a.getAttribute('href'))).toContain('/peliculas');
    });
  });

  it('ofrece Ingresar cuando no hay sesión', async () => {
    const fixture = await montar(null);
    const enlace = fixture.nativeElement.querySelector('.ingresar') as HTMLAnchorElement;

    expect(enlace).not.toBeNull();
    expect(enlace.getAttribute('href')).toBe('/ingresar');
    expect(fixture.nativeElement.querySelector('.cuenta')).toBeNull();
  });

  it('saluda por el nombre y enlaza al perfil cuando hay sesión', async () => {
    const fixture = await montar('cliente');
    const enlace = fixture.nativeElement.querySelector('.cuenta__nombre') as HTMLAnchorElement;

    expect(enlace.textContent).toContain('Ana');
    expect(enlace.getAttribute('href')).toBe('/perfil');
    expect(fixture.nativeElement.querySelector('.ingresar')).toBeNull();
  });

  // El aviso de compra anónima vale con sesión y sin ella (RF-26, D-04)
  it('mantiene el aviso de compra sin cuenta con la sesión abierta', async () => {
    const fixture = await montar('cliente');

    expect(fixture.nativeElement.querySelector('.aviso')).not.toBeNull();
  });

  it('no muestra distintivo de rol a un cliente', async () => {
    const fixture = await montar('cliente');

    expect(fixture.nativeElement.querySelector('.cuenta__rol')).toBeNull();
  });

  // RNF-10: el rol se dice con palabras, no solo con un color distinto
  it('nombra el rol del personal por escrito', async () => {
    const empleado = await montar('empleado');
    expect(
      (empleado.nativeElement.querySelector('.cuenta__rol') as HTMLElement).textContent,
    ).toContain('Empleado');

    TestBed.resetTestingModule();

    const admin = await montar('admin');
    expect(
      (admin.nativeElement.querySelector('.cuenta__rol') as HTMLElement).textContent,
    ).toContain('Administración');
  });

  // El acceso al panel aparece según el rol, pero es una ayuda de interfaz: lo que protege
  // los datos son las funciones de la base (RNF-09)
  it('lleva al panel de administración solo al administrador', async () => {
    const admin = await montar('admin');
    const enlace = admin.nativeElement.querySelector('a.cuenta__rol') as HTMLAnchorElement;

    expect(enlace.getAttribute('href')).toBe('/admin');
  });

  it('el empleado ve su rótulo pero no un enlace al panel de administración', async () => {
    const empleado = await montar('empleado');

    expect(empleado.nativeElement.querySelector('a.cuenta__rol')).toBeNull();
    expect(empleado.nativeElement.querySelector('.cuenta__rol')).not.toBeNull();
    expect(empleado.nativeElement.querySelector('a[href="/admin"]')).toBeNull();
  });

  it('cierra la sesión y vuelve a la portada', async () => {
    const fixture = await montar('cliente');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const boton = fixture.nativeElement.querySelector('.cuenta button') as HTMLButtonElement;
    boton.click();
    await fixture.whenStable();

    expect(salir).toHaveBeenCalledOnce();
    expect(navegar).toHaveBeenCalledWith('/');
  });
});
