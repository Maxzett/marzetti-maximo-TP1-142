import { TestBed } from '@angular/core/testing';
import { Compra } from './compra';
import { Supabase } from './supabase';

type Respuesta = { data?: unknown; error?: { code?: string; message: string } | null };

function crearSupabaseFalso({ data = null, error = null }: Respuesta = {}) {
  const canal = {
    on: vi.fn(() => canal),
    subscribe: vi.fn(() => canal),
  };

  return {
    canal,
    client: {
      rpc: vi.fn(async (_nombre: string, _argumentos?: unknown) => ({ data, error })),
      channel: vi.fn((_nombre: string) => canal),
      removeChannel: vi.fn(async (_canal: unknown) => 'ok'),
    },
  };
}

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Compra {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Compra);
}

describe('Compra', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('manda su sesión en cada llamada, para que la base sepa de quién es la reserva', async () => {
    const falso = crearSupabaseFalso({ data: [] });
    const servicio = crearServicio(falso);
    await servicio.cargarEstados('f1');

    expect(falso.client.rpc).toHaveBeenCalledWith('estado_butacas', {
      p_funcion: 'f1',
      p_sesion: servicio.sesionId,
    });
  });

  it('convierte las filas de estado en un mapa', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({ data: [{ butaca_id: 'a', estado: 'retenida' }] }),
    );
    expect((await servicio.cargarEstados('f1'))?.estados.get('a')).toBe('retenida');
  });

  it('con una butaca tomada muestra el mensaje de la base', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({
        error: {
          code: '55000',
          message: 'Otra persona está eligiendo esa butaca en este momento.',
        },
      }),
    );
    expect(await servicio.retener('f1', 'b1')).toEqual({
      estado: 'error',
      mensaje: 'Otra persona está eligiendo esa butaca en este momento.',
    });
  });

  describe('configurarOrden', () => {
    const seleccion = {
      productos: [{ id: 'p1', cantidad: 2 }],
      combos: [],
      cupon: '  bienvenida ',
      usarCredito: true,
      recompensaId: null,
    };

    it('manda la selección con la sesión y el cupón sin espacios', async () => {
      const falso = crearSupabaseFalso({ data: { ok: true, total: 100 } });
      const servicio = crearServicio(falso);
      await servicio.configurarOrden('o1', seleccion);

      expect(falso.client.rpc).toHaveBeenCalledWith('configurar_orden', {
        p_orden: 'o1',
        p_sesion: servicio.sesionId,
        p_productos: [{ id: 'p1', cantidad: 2 }],
        p_combos: [],
        p_cupon: 'bienvenida',
        p_usar_credito: true,
        p_recompensa: null,
      });
    });

    it('sin cupón manda null y no una cadena vacía', async () => {
      const falso = crearSupabaseFalso({ data: { ok: true } });
      await crearServicio(falso).configurarOrden('o1', { ...seleccion, cupon: '   ' });

      expect(falso.client.rpc.mock.calls[0][1]).toMatchObject({ p_cupon: null });
    });

    it('devuelve el desglose que calculó la base', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ data: { ok: true, total: 8000 } }));
      const resultado = await servicio.configurarOrden('o1', seleccion);

      expect(resultado.estado).toBe('configurada');
      expect(resultado.estado === 'configurada' && resultado.desglose.total).toBe(8000);
    });

    it('una reserva vencida es un resultado, no un error', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({ data: { ok: false, motivo: 'vencida', mensaje: 'Venció.' } }),
      );

      expect(await servicio.configurarOrden('o1', seleccion)).toEqual({
        estado: 'vencida',
        mensaje: 'Venció.',
      });
    });

    it('un cupón que no corresponde vuelve como error con el texto de la base', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          error: { code: '55000', message: 'El cupón de bienvenida es para tu primera compra.' },
        }),
      );

      expect(await servicio.configurarOrden('o1', seleccion)).toEqual({
        estado: 'error',
        mensaje: 'El cupón de bienvenida es para tu primera compra.',
      });
    });
  });

  it('una reserva vencida al pagar es un resultado, no un error', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({ data: { ok: false, motivo: 'vencida', mensaje: 'La reserva venció.' } }),
    );
    expect(await servicio.confirmarPago('o1', 'tarjeta_debito')).toEqual({
      estado: 'vencida',
      mensaje: 'La reserva venció.',
    });
  });

  it('un pago exitoso devuelve el código de la orden', async () => {
    const servicio = crearServicio(crearSupabaseFalso({ data: { ok: true, codigo: 'ABC' } }));
    expect(await servicio.confirmarPago('o1', 'transferencia')).toEqual({
      estado: 'pagada',
      codigo: 'ABC',
    });
  });

  it('no muestra un error inesperado de la base tal cual', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({ error: { code: 'XX000', message: 'internal stack trace' } }),
    );
    const resultado = await servicio.crearOrden('f1', 'a@b.com', null);

    expect(resultado.estado).toBe('error');
    expect(JSON.stringify(resultado)).not.toContain('stack trace');
  });

  it('la entrada inexistente devuelve null', async () => {
    const servicio = crearServicio(
      crearSupabaseFalso({ error: { code: 'P0002', message: 'No encontramos esa entrada.' } }),
    );
    expect(await servicio.obtenerEntrada('NOEXISTE')).toBeNull();
  });

  it('escuchar abre el canal de la función y devuelve cómo cerrarlo', () => {
    const falso = crearSupabaseFalso();
    const cerrar = crearServicio(falso).escuchar('f1', () => undefined);

    expect(falso.client.channel).toHaveBeenCalledWith('funcion:f1');
    expect(falso.canal.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'butaca' },
      expect.any(Function),
    );

    cerrar();
    expect(falso.client.removeChannel).toHaveBeenCalledWith(falso.canal);
  });
});
