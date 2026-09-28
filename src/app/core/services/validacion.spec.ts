import { TestBed } from '@angular/core/testing';
import { Supabase } from './supabase';
import { Validacion } from './validacion';

type Respuesta = { data?: unknown; error?: { code?: string; message: string } | null };

function crearSupabaseFalso({ data = null, error = null }: Respuesta = {}) {
  return {
    client: { rpc: vi.fn(async (_nombre: string, _argumentos?: unknown) => ({ data, error })) },
  };
}

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Validacion {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Validacion);
}

describe('Validacion', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('consulta la orden por RPC y la devuelve tal cual', async () => {
    const orden = { codigo: 'ABC', tramos: { entrada: { usado_at: null, usado_por: null } } };
    const falso = crearSupabaseFalso({ data: orden });

    expect(await crearServicio(falso).consultar('ABC')).toEqual({ estado: 'encontrada', orden });
    expect(falso.client.rpc).toHaveBeenCalledWith('consultar_orden_personal', { p_codigo: 'ABC' });
  });

  it('un código que no existe muestra el mensaje de la base', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({ error: { code: 'P0002', message: 'No encontramos esa entrada.' } }),
    );

    expect(await servicio.consultar('ABC')).toEqual({
      estado: 'error',
      mensaje: 'No encontramos esa entrada.',
    });
  });

  it('el 42501 dice que es tarea del personal, no de la administración', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({ error: { code: '42501', message: 'permission denied' } }),
    );

    const respuesta = await servicio.consultar('ABC');

    expect(respuesta.estado).toBe('error');
    expect(respuesta.estado === 'error' && respuesta.mensaje).toContain('personal del cine');
  });

  it('validar manda el tramo y devuelve cuándo y quién', async () => {
    const falso = crearSupabaseFalso({
      data: { ok: true, tramo: 'candy', usado_at: '2026-09-27T00:40:00Z', usado_por: 'Ana G.' },
    });

    expect(await crearServicio(falso).validar('ABC', 'candy')).toEqual({
      estado: 'validada',
      tramo: 'candy',
      uso: { usado_at: '2026-09-27T00:40:00Z', usado_por: 'Ana G.' },
    });
    expect(falso.client.rpc).toHaveBeenCalledWith('validar_tramo', {
      p_codigo: 'ABC',
      p_tramo: 'candy',
    });
  });

  it('un tramo ya usado es un rechazo con cuándo y quién, no un error (RN-05)', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({
        data: {
          ok: false,
          motivo: 'ya_usado',
          mensaje: 'Esta entrada ya se usó para ingresar.',
          usado_at: '2026-09-27T00:40:00Z',
          usado_por: 'Beto P.',
        },
      }),
    );

    expect(await servicio.validar('ABC', 'entrada')).toEqual({
      estado: 'rechazada',
      motivo: 'ya_usado',
      mensaje: 'Esta entrada ya se usó para ingresar.',
      uso: { usado_at: '2026-09-27T00:40:00Z', usado_por: 'Beto P.' },
    });
  });

  it('un rechazo sin uso previo (sin candy, fuera de horario) no inventa uno', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({ data: { ok: false, motivo: 'sin_candy', mensaje: 'Sin candy.' } }),
    );

    expect(await servicio.validar('ABC', 'candy')).toEqual({
      estado: 'rechazada',
      motivo: 'sin_candy',
      mensaje: 'Sin candy.',
      uso: null,
    });
  });

  it('un error de red al validar es un error, no un rechazo', async () => {
    const servicio = crearServicio(crearSupabaseFalso({ error: { message: 'Failed to fetch' } }));

    expect((await servicio.validar('ABC', 'entrada')).estado).toBe('error');
  });
});
