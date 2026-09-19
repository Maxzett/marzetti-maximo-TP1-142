import { TestBed } from '@angular/core/testing';
import { Auth } from './auth';
import { Supabase } from './supabase';

/** Fila de perfiles que devuelve el doble por defecto */
const PERFIL = {
  id: 'uuid-1',
  email: 'ana@ejemplo.com',
  nombre: 'Ana',
  apellido: 'Gómez',
  fecha_nacimiento: '1990-05-14',
  rol: 'cliente',
  creado_at: '2026-09-18T12:00:00Z',
};

const SESION = { user: { id: 'uuid-1' } };

const REGISTRO = {
  email: 'ana@ejemplo.com',
  password: 'secreta123',
  nombre: 'Ana',
  apellido: 'Gómez',
  fechaNacimiento: '1990-05-14',
  tipoSangre: 'O+',
  colorOjos: 'verdes',
  diasVacaciones: 21,
} as const;

/**
 * Doble del cliente de Supabase. Se arma a mano y no con una librería de mocks
 * porque lo que hay que imitar es el encadenado from().select().eq().maybeSingle(),
 * que es exactamente lo que el servicio usa.
 */
function crearSupabaseFalso(filas: Record<string, unknown> = {}) {
  const consulta = (tabla: string) => {
    const resultado = async () => ({ data: filas[tabla] ?? null, error: null });
    const encadenable = { eq: () => encadenable, maybeSingle: resultado };
    return { select: () => encadenable };
  };

  return {
    client: {
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi.fn(async () => ({ data: { session: null } })),
        // Los parámetros se declaran aunque el doble no los use: sin ellos, mock.calls
        // queda tipada como tupla vacía y no se puede inspeccionar lo que se mandó.
        signUp: vi.fn(async (_credenciales: unknown) => ({ data: {}, error: null })),
        signInWithPassword: vi.fn(async (_credenciales: unknown) => ({ data: {}, error: null })),
        signOut: vi.fn(async () => ({ error: null })),
      },
      from: vi.fn(consulta),
    },
  };
}

function conSesion(falso: ReturnType<typeof crearSupabaseFalso>) {
  falso.client.auth.getSession = vi.fn(async () => ({ data: { session: SESION } })) as never;
  return falso;
}

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Auth {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Auth);
}

describe('Auth', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('arranca sin sesión y sin perfil', () => {
    const auth = crearServicio(crearSupabaseFalso());

    expect(auth.haySesion()).toBe(false);
    expect(auth.perfil()).toBeNull();
    expect(auth.rol()).toBeNull();
    expect(auth.esAdmin()).toBe(false);
    expect(auth.esPersonal()).toBe(false);
  });

  it('se suscribe a los cambios de sesión al crearse, para enterarse de lo que pasa en otra pestaña', () => {
    const falso = crearSupabaseFalso();
    crearServicio(falso);

    expect(falso.client.auth.onAuthStateChange).toHaveBeenCalledOnce();
  });

  it('restaura la sesión guardada y trae el perfil', async () => {
    const auth = crearServicio(conSesion(crearSupabaseFalso({ perfiles: PERFIL })));

    await auth.restaurar();

    expect(auth.haySesion()).toBe(true);
    expect(auth.perfil()?.nombre).toBe('Ana');
    expect(auth.rol()).toBe('cliente');
  });

  it('no sale a buscar el perfil si no hay sesión guardada', async () => {
    const falso = crearSupabaseFalso();
    const auth = crearServicio(falso);

    await auth.restaurar();

    expect(auth.haySesion()).toBe(false);
    expect(falso.client.from).not.toHaveBeenCalled();
  });

  it('manda los siete campos de RF-38 como metadatos del signUp', async () => {
    const falso = crearSupabaseFalso();
    const auth = crearServicio(falso);

    await auth.registrar({ ...REGISTRO });

    const argumentos = falso.client.auth.signUp.mock.calls[0][0] as unknown as {
      email: string;
      options: { data: Record<string, unknown> };
    };

    expect(argumentos.email).toBe('ana@ejemplo.com');
    expect(argumentos.options.data).toEqual({
      nombre: 'Ana',
      apellido: 'Gómez',
      fecha_nacimiento: '1990-05-14',
      tipo_sangre: 'O+',
      color_ojos: 'verdes',
      dias_vacaciones: 21,
    });
  });

  it('nunca manda el rol en el signUp: lo pone el default de la tabla', async () => {
    const falso = crearSupabaseFalso();
    const auth = crearServicio(falso);

    await auth.registrar({ ...REGISTRO });

    const argumentos = falso.client.auth.signUp.mock.calls[0][0] as unknown as {
      options: { data: Record<string, unknown> };
    };

    expect(argumentos.options.data).not.toHaveProperty('rol');
  });

  it('traduce el error de credenciales inválidas', async () => {
    const falso = crearSupabaseFalso();
    falso.client.auth.signInWithPassword = vi.fn(async () => ({
      data: {},
      error: { message: 'Invalid login credentials' },
    })) as never;
    const auth = crearServicio(falso);

    await expect(auth.ingresar('ana@ejemplo.com', 'mal')).resolves.toBe(
      'El mail o la contraseña no coinciden.',
    );
  });

  it('da un mensaje genérico ante un error que no conoce, en vez del texto en inglés', async () => {
    const falso = crearSupabaseFalso();
    falso.client.auth.signInWithPassword = vi.fn(async () => ({
      data: {},
      error: { message: 'Unexpected failure from the gateway' },
    })) as never;
    const auth = crearServicio(falso);

    const error = await auth.ingresar('ana@ejemplo.com', 'secreta123');

    expect(error).toBe('No pudimos completar la operación. Probá de nuevo.');
    expect(error).not.toContain('gateway');
  });

  it('devuelve null y deja el perfil cargado cuando el ingreso sale bien', async () => {
    const auth = crearServicio(
      conSesion(crearSupabaseFalso({ perfiles: { ...PERFIL, rol: 'admin' } })),
    );
    await auth.restaurar();

    await expect(auth.ingresar('ana@ejemplo.com', 'secreta123')).resolves.toBeNull();
    expect(auth.esAdmin()).toBe(true);
    expect(auth.esPersonal()).toBe(true);
  });

  it('reconoce al empleado como personal pero no como admin', async () => {
    const auth = crearServicio(
      conSesion(crearSupabaseFalso({ perfiles: { ...PERFIL, rol: 'empleado' } })),
    );

    await auth.restaurar();

    expect(auth.esPersonal()).toBe(true);
    expect(auth.esAdmin()).toBe(false);
  });

  it('limpia sesión y perfil al salir', async () => {
    const auth = crearServicio(conSesion(crearSupabaseFalso({ perfiles: PERFIL })));
    await auth.restaurar();

    await auth.salir();

    expect(auth.haySesion()).toBe(false);
    expect(auth.perfil()).toBeNull();
  });

  it('pide los datos sensibles a su propia tabla, aparte del perfil (RF-38.1)', async () => {
    const falso = crearSupabaseFalso({
      perfiles_sensibles: {
        perfil_id: 'uuid-1',
        tipo_sangre: 'O+',
        color_ojos: 'verdes',
        dias_vacaciones: 21,
      },
    });
    const auth = crearServicio(falso);

    const datos = await auth.cargarDatosSensibles();

    expect(falso.client.from).toHaveBeenCalledWith('perfiles_sensibles');
    expect(datos?.tipo_sangre).toBe('O+');
  });

  it('devuelve null si la base no da los datos sensibles, sin romper la pantalla', async () => {
    const auth = crearServicio(crearSupabaseFalso());

    await expect(auth.cargarDatosSensibles()).resolves.toBeNull();
  });
});
