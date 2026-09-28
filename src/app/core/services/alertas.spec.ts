import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Notificador, NOTIFICADOR, PermisoDeNotificacion } from '../alertas/notificacion';
import { AlertaDeEstreno } from '../models/alerta';
import { hoyIso, sumarDias } from '../../shared/selector-fecha/fechas';
import { Alertas } from './alertas';
import { Auth } from './auth';
import { Supabase } from './supabase';

const HOY = hoyIso();

function alerta(
  id: string,
  estreno: string,
  extra: Partial<AlertaDeEstreno> = {},
): AlertaDeEstreno {
  return {
    pelicula_id: id,
    notificada_at: null,
    creado_at: '2026-09-01T00:00:00Z',
    pelicula: {
      id,
      titulo: `Película ${id}`,
      fecha_estreno: estreno,
      precio_preventa: null,
      poster_url: null,
    },
    ...extra,
  };
}

interface Configuracion {
  filas?: AlertaDeEstreno[];
  errorLectura?: boolean;
  errorInsert?: { code: string; message: string } | null;
}

function crearSupabaseFalso({
  filas = [],
  errorLectura = false,
  errorInsert = null,
}: Configuracion = {}) {
  const insert = vi.fn(async (_valores: unknown) => ({ error: errorInsert }));
  const enUpdate = vi.fn(async (_columna: string, _valores: string[]) => ({ error: null }));
  const update = vi.fn((_valores: unknown) => ({ in: enUpdate }));
  const eqDelete = vi.fn(async (_columna: string, _valor: string) => ({ error: null }));
  const borrar = vi.fn(() => ({ eq: eqDelete }));
  const select = vi.fn(() => ({
    order: () => ({
      overrideTypes: async () => ({
        data: errorLectura ? null : filas,
        error: errorLectura ? { message: 'falló' } : null,
      }),
    }),
  }));

  return {
    insert,
    update,
    enUpdate,
    eqDelete,
    client: { from: vi.fn(() => ({ select, insert, update, delete: borrar })) },
  };
}

function crearNotificador(permiso: PermisoDeNotificacion = 'sin-preguntar') {
  return {
    permiso: vi.fn(() => permiso),
    pedirPermiso: vi.fn(async () => permiso),
    mostrar: vi.fn(async (_titulo: string, _cuerpo: string, _url: string) => true),
  } satisfies Notificador;
}

function crearServicio(
  falso: ReturnType<typeof crearSupabaseFalso>,
  { perfilId = 'perfil-1' as string | null, notificador = crearNotificador() } = {},
) {
  const auth = { perfil: signal(perfilId ? { id: perfilId } : null) };

  TestBed.configureTestingModule({
    providers: [
      { provide: Supabase, useValue: falso },
      { provide: Auth, useValue: auth },
      { provide: NOTIFICADOR, useValue: notificador },
    ],
  });
  return { servicio: TestBed.inject(Alertas), auth };
}

describe('Alertas', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('al haber sesión carga las alertas, y al salir las vacía', async () => {
    const falso = crearSupabaseFalso({ filas: [alerta('a', sumarDias(HOY, 30))] });
    const { servicio, auth } = crearServicio(falso);

    TestBed.tick();
    await vi.waitFor(() => expect(servicio.alertas().length).toBe(1));

    auth.perfil.set(null);
    TestBed.tick();
    expect(servicio.alertas()).toEqual([]);
  });

  it('separa las que ya salieron a la venta de las que todavía no', async () => {
    const falso = crearSupabaseFalso({
      filas: [
        alerta('futura', sumarDias(HOY, 30)),
        alerta('estrenada', sumarDias(HOY, -1)),
        alerta('vista', sumarDias(HOY, -1), { notificada_at: '2026-09-27T12:00:00Z' }),
        alerta('preventa', sumarDias(HOY, 3), {
          pelicula: {
            id: 'preventa',
            titulo: 'Con preventa',
            fecha_estreno: sumarDias(HOY, 3),
            precio_preventa: 3000,
            poster_url: null,
          },
        }),
      ],
    });
    const { servicio } = crearServicio(falso);

    await servicio.cargar();

    expect(servicio.aLaVenta().map((a) => a.pelicula_id)).toEqual([
      'estrenada',
      'vista',
      'preventa',
    ]);
    expect(servicio.nuevas().map((a) => a.pelicula_id)).toEqual(['estrenada', 'preventa']);
    expect(servicio.peliculasConAlerta().has('futura')).toBe(true);
  });

  it('con permiso avisa por el sistema y las marca como avisadas', async () => {
    const notificador = crearNotificador('concedido');
    const falso = crearSupabaseFalso({ filas: [alerta('a', sumarDias(HOY, -1))] });
    const { servicio } = crearServicio(falso, { notificador });

    await servicio.cargar();

    expect(notificador.mostrar).toHaveBeenCalledWith(
      'Película a: ya hay entradas',
      expect.any(String),
      '/peliculas/a',
    );
    expect(falso.enUpdate).toHaveBeenCalledWith('pelicula_id', ['a']);
    expect(servicio.nuevas()).toEqual([]);
  });

  it('sin permiso no notifica y el aviso queda pendiente para el header', async () => {
    const notificador = crearNotificador('negado');
    const falso = crearSupabaseFalso({ filas: [alerta('a', sumarDias(HOY, -1))] });
    const { servicio } = crearServicio(falso, { notificador });

    await servicio.cargar();

    expect(notificador.mostrar).not.toHaveBeenCalled();
    expect(falso.update).not.toHaveBeenCalled();
    expect(servicio.nuevas().length).toBe(1);
  });

  it('activar inserta la fila propia', async () => {
    const falso = crearSupabaseFalso();
    const { servicio } = crearServicio(falso);

    expect(await servicio.activar({ id: 'p1' })).toBeNull();
    expect(falso.insert).toHaveBeenCalledWith({ perfil_id: 'perfil-1', pelicula_id: 'p1' });
  });

  it('si la política la rechaza, es porque ya está a la venta', async () => {
    const falso = crearSupabaseFalso({ errorInsert: { code: '42501', message: 'rls' } });
    const { servicio } = crearServicio(falso);

    expect(await servicio.activar({ id: 'p1' })).toContain('ya están a la venta');
  });

  it('una alerta repetida no es un error', async () => {
    const falso = crearSupabaseFalso({ errorInsert: { code: '23505', message: 'duplicada' } });
    const { servicio } = crearServicio(falso);

    expect(await servicio.activar({ id: 'p1' })).toBeNull();
  });

  it('sin sesión pide iniciarla y no va a la red', async () => {
    const falso = crearSupabaseFalso();
    const { servicio } = crearServicio(falso, { perfilId: null });

    expect(await servicio.activar({ id: 'p1' })).toContain('Iniciá sesión');
    expect(falso.insert).not.toHaveBeenCalled();
  });

  it('desactivar borra la alerta y la saca de la lista', async () => {
    const falso = crearSupabaseFalso({ filas: [alerta('a', sumarDias(HOY, 30))] });
    const { servicio } = crearServicio(falso);
    await servicio.cargar();

    expect(await servicio.desactivar('a')).toBeNull();
    expect(falso.eqDelete).toHaveBeenCalledWith('pelicula_id', 'a');
    expect(servicio.alertas()).toEqual([]);
  });

  it('si la lectura falla conserva lo que había', async () => {
    const { servicio } = crearServicio(crearSupabaseFalso({ errorLectura: true }));

    await servicio.cargar();

    expect(servicio.alertas()).toEqual([]);
  });
});
