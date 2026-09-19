import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Perfil as ModeloPerfil, PerfilSensible } from '../../core/models/perfil';
import { Auth } from '../../core/services/auth';
import { Perfil } from './perfil';

const PERFIL: ModeloPerfil = {
  id: 'uuid-1',
  email: 'ana@ejemplo.com',
  nombre: 'Ana',
  apellido: 'Gómez',
  fecha_nacimiento: '1990-05-14',
  rol: 'cliente',
  creado_at: '2026-09-18T12:00:00Z',
};

const SENSIBLES: PerfilSensible = {
  perfil_id: 'uuid-1',
  tipo_sangre: 'O+',
  color_ojos: 'verdes',
  dias_vacaciones: 21,
};

async function montar(
  perfil: ModeloPerfil | null,
  sensibles: PerfilSensible | null,
): Promise<ComponentFixture<Perfil>> {
  await TestBed.configureTestingModule({
    imports: [Perfil],
    providers: [
      {
        provide: Auth,
        useValue: {
          perfil: signal(perfil),
          rol: signal(perfil?.rol ?? null),
          cargarDatosSensibles: vi.fn(async () => sensibles),
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Perfil);
  await fixture.whenStable();
  return fixture;
}

describe('Perfil', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('muestra nombre, mail y fecha de nacimiento del titular', async () => {
    const fixture = await montar(PERFIL, SENSIBLES);
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Ana Gómez');
    expect(texto).toContain('ana@ejemplo.com');
    // formatearLargo la escribe en castellano, no en ISO
    expect(texto).toContain('1990');
  });

  it('traduce el rol a un nombre que se entiende', async () => {
    const fixture = await montar({ ...PERFIL, rol: 'admin' }, SENSIBLES);

    expect(fixture.nativeElement.textContent).toContain('Administración');
  });

  // RF-38.1: son los únicos datos del sistema que solo ve su titular
  it('muestra los tres datos sensibles y aclara que no los ve nadie más', async () => {
    const fixture = await montar(PERFIL, SENSIBLES);
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('O+');
    expect(texto).toContain('verdes');
    expect(texto).toContain('21');
    expect(texto).toContain('no los ve nadie más');
  });

  it('pide los datos sensibles en una consulta aparte del perfil', async () => {
    await montar(PERFIL, SENSIBLES);
    const auth = TestBed.inject(Auth) as unknown as {
      cargarDatosSensibles: ReturnType<typeof vi.fn>;
    };

    expect(auth.cargarDatosSensibles).toHaveBeenCalledOnce();
  });

  // Si la política RLS no fuera la que es, la consulta volvería vacía: la pantalla no se rompe
  it('avisa en vez de romperse cuando la base no devuelve los datos sensibles', async () => {
    const fixture = await montar(PERFIL, null);
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('No pudimos traer estos datos.');
    expect(texto).not.toContain('Tipo de sangre');
  });

  it('muestra un spinner mientras el perfil todavía no llegó', async () => {
    const fixture = await montar(null, null);

    expect(fixture.nativeElement.querySelector('app-spinner')).not.toBeNull();
  });

  // RF-40 y RF-41 llegan en fases posteriores: los lugares ya están reservados
  it('reserva el lugar de puntos, crédito y Mis Películas', async () => {
    const fixture = await montar(PERFIL, SENSIBLES);
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Puntos y crédito');
    expect(texto).toContain('Mis Películas');
  });
});
