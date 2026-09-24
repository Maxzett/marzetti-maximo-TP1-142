import { TestBed } from '@angular/core/testing';
import { Cuenta } from './cuenta';
import { Supabase } from './supabase';

type Respuesta = { data?: unknown; error?: { code?: string; message: string } | null };

function crearSupabaseFalso({ data = null, error = null }: Respuesta = {}) {
  const constructor = {
    select: () => constructor,
    order: () => constructor,
    overrideTypes: async () => ({ data, error }),
  };

  return {
    client: {
      rpc: vi.fn(async (_nombre: string, _argumentos?: unknown) => ({ data, error })),
      from: vi.fn((_tabla: string) => constructor),
    },
  };
}

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Cuenta {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Cuenta);
}

describe('Cuenta', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('pide los saldos a la base y los devuelve tal cual', async () => {
    const saldos = { puntos: 120, credito: 3000, bienvenida: null };
    const falso = crearSupabaseFalso({ data: saldos });

    expect(await crearServicio(falso).saldos()).toEqual(saldos);
    expect(falso.client.rpc).toHaveBeenCalledWith('mis_saldos');
  });

  it('si no puede leer los saldos devuelve null y no un cero que engañe', async () => {
    const servicio = crearServicio(crearSupabaseFalso({ error: { message: 'boom' } }));

    expect(await servicio.saldos()).toBeNull();
    expect(await servicio.ordenes()).toBeNull();
    expect(await servicio.canjes()).toBeNull();
  });

  it('lee el historial de compras y de canjes', async () => {
    const compras = crearServicio(crearSupabaseFalso({ data: [{ orden_id: 'o1' }] }));
    expect(await compras.ordenes()).toEqual([{ orden_id: 'o1' }]);
  });

  it('cancelar devuelve el crédito acreditado', async () => {
    const falso = crearSupabaseFalso({ data: { ok: true, credito: '4500.50' } });

    expect(await crearServicio(falso).cancelar('o1')).toEqual({
      estado: 'cancelada',
      credito: 4500.5,
    });
    expect(falso.client.rpc).toHaveBeenCalledWith('cancelar_orden', { p_orden: 'o1' });
  });

  it('cancelar fuera de plazo muestra el motivo que dice la base', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({
        error: {
          code: '55000',
          message: 'Solo se puede cancelar hasta 2 horas antes de la función.',
        },
      }),
    );

    expect(await servicio.cancelar('o1')).toEqual({
      estado: 'error',
      mensaje: 'Solo se puede cancelar hasta 2 horas antes de la función.',
    });
  });

  it('un error inesperado no se muestra crudo', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({ error: { code: 'XX000', message: 'internal stack trace' } }),
    );
    const resultado = await servicio.cancelar('o1');

    expect(JSON.stringify(resultado)).not.toContain('stack trace');
  });
});
