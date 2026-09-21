import { TestBed } from '@angular/core/testing';
import { DatosProgramacion } from '../models/sala';
import { Funciones } from './funciones';
import { Supabase } from './supabase';

interface Respuestas {
  filas?: unknown;
  rpc?: unknown;
  /** Error que devuelve la base en cualquier llamada */
  error?: { code?: string; message: string } | null;
}

/**
 * Doble del cliente de Supabase. Cada método de la cadena devuelve la misma cadena y solo
 * el último (overrideTypes) resuelve, que es cómo se usa en el servicio.
 */
function crearSupabaseFalso({ filas = [], rpc = null, error = null }: Respuestas = {}) {
  const cadena = {
    select: vi.fn(() => cadena),
    eq: vi.fn(() => cadena),
    gte: vi.fn(() => cadena),
    order: vi.fn(() => cadena),
    limit: vi.fn(() => cadena),
    overrideTypes: vi.fn(async () => ({ data: error ? null : filas, error })),
  };

  return {
    cadena,
    client: {
      from: vi.fn(() => cadena),
      rpc: vi.fn(async (_nombre: string, _argumentos?: unknown) => ({
        data: error ? null : rpc,
        error,
      })),
    },
  };
}

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Funciones {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Funciones);
}

const DATOS: DatosProgramacion = {
  peliculaId: 'p1',
  desde: '2026-10-05',
  hasta: '2026-10-18',
  dias: [1, 2, 5],
  hora: '18:00',
  formato: '2D',
  idioma: 'castellano',
  precioBase: 6500,
};

describe('Funciones', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('cargarProgramacion', () => {
    it('pide solo las vigentes y que todavía no empezaron', async () => {
      const falso = crearSupabaseFalso();
      await crearServicio(falso).cargarProgramacion();

      expect(falso.cadena.eq).toHaveBeenCalledWith('activa', true);
      expect(falso.cadena.gte).toHaveBeenCalledWith('inicio', expect.any(String));
      expect(falso.cadena.order).toHaveBeenCalledWith('inicio');
    });

    it('sin película no filtra por película', async () => {
      const falso = crearSupabaseFalso();
      await crearServicio(falso).cargarProgramacion();

      expect(falso.cadena.eq).not.toHaveBeenCalledWith('pelicula_id', expect.anything());
    });

    it('con película filtra por ella', async () => {
      const falso = crearSupabaseFalso();
      await crearServicio(falso).cargarProgramacion('p1');

      expect(falso.cadena.eq).toHaveBeenCalledWith('pelicula_id', 'p1');
    });

    it('pone un tope explícito, porque PostgREST corta en silencio a las 1000 filas', async () => {
      const falso = crearSupabaseFalso();
      await crearServicio(falso).cargarProgramacion();

      expect(falso.cadena.limit).toHaveBeenCalledWith(500);
    });

    it('devuelve null si la base falla, para no confundir un error con una agenda vacía', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ error: { message: 'falló' } }));

      expect(await servicio.cargarProgramacion()).toBeNull();
    });

    it('una agenda realmente vacía es una lista vacía, no null', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ filas: [] }));

      expect(await servicio.cargarProgramacion()).toEqual([]);
    });
  });

  describe('crear', () => {
    it('manda los días y el horario a la función de la base, sin elegir sala', async () => {
      const falso = crearSupabaseFalso({ rpc: { ok: true, creadas: [] } });
      await crearServicio(falso).crear(DATOS);

      expect(falso.client.rpc).toHaveBeenCalledWith('crear_funciones', {
        p_pelicula_id: 'p1',
        p_desde: '2026-10-05',
        p_hasta: '2026-10-18',
        p_dias: [1, 2, 5],
        p_hora: '18:00',
        p_formato: '2D',
        p_idioma: 'castellano',
        p_precio_base: 6500,
      });
      // RF-21: la sala no viaja. No hay ningún parámetro para elegirla
      expect(JSON.stringify(falso.client.rpc.mock.calls[0])).not.toContain('sala');
    });

    it('devuelve las funciones creadas con la sala que asignó la base', async () => {
      const creadas = [
        { id: 'f1', inicio: '2026-10-05T21:00:00Z', sala_id: 's1', sala: 'Sala 1' },
        { id: 'f2', inicio: '2026-10-06T21:00:00Z', sala_id: 's1', sala: 'Sala 1' },
      ];
      const servicio = crearServicio(crearSupabaseFalso({ rpc: { ok: true, creadas } }));

      expect(await servicio.crear(DATOS)).toEqual({ estado: 'creadas', creadas });
    });

    it('sin sala devuelve los conflictos y los horarios sugeridos, no un error', async () => {
      const sin_sala = [
        {
          fecha: '2026-10-06',
          inicio: '2026-10-06T21:00:00Z',
          sugerencias: ['2026-10-06T22:00:00Z'],
        },
      ];
      const servicio = crearServicio(crearSupabaseFalso({ rpc: { ok: false, sin_sala } }));

      expect(await servicio.crear(DATOS)).toEqual({ estado: 'sin_sala', conflictos: sin_sala });
    });

    it('un error de la base con mensaje propio se muestra tal cual', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          error: { code: '22023', message: 'La fecha final es anterior a la inicial' },
        }),
      );

      expect(await servicio.crear(DATOS)).toEqual({
        estado: 'error',
        mensaje: 'La fecha final es anterior a la inicial',
      });
    });

    it('que quien llama no sea administrador es un error, no un resultado vacío', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({
          error: { code: '42501', message: 'Solo la administración puede programar funciones' },
        }),
      );

      const resultado = await servicio.crear(DATOS);

      expect(resultado.estado).toBe('error');
    });
  });

  describe('modificar', () => {
    const CAMBIOS = {
      inicio: '2026-10-05T19:00:00-03:00',
      formato: '3D' as const,
      idioma: 'subtitulada' as const,
      precioBase: 7000,
    };

    it('manda los cambios a la función de la base', async () => {
      const falso = crearSupabaseFalso({
        rpc: { ok: true, funcion_id: 'f1', sala_id: 's2', sala: 'Sala 2' },
      });
      await crearServicio(falso).modificar('f1', CAMBIOS);

      expect(falso.client.rpc).toHaveBeenCalledWith('modificar_funcion', {
        p_funcion_id: 'f1',
        p_inicio: '2026-10-05T19:00:00-03:00',
        p_formato: '3D',
        p_idioma: 'subtitulada',
        p_precio_base: 7000,
      });
    });

    it('devuelve la sala en la que quedó, que puede no ser la de antes', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({ rpc: { ok: true, funcion_id: 'f1', sala_id: 's2', sala: 'Sala 2' } }),
      );

      expect(await servicio.modificar('f1', CAMBIOS)).toEqual({
        estado: 'modificada',
        sala: 'Sala 2',
      });
    });

    it('si el nuevo horario no tiene sala, informa los conflictos', async () => {
      const sin_sala = [{ fecha: '2026-10-05', inicio: '2026-10-05T22:00:00Z', sugerencias: [] }];
      const servicio = crearServicio(crearSupabaseFalso({ rpc: { ok: false, sin_sala } }));

      expect(await servicio.modificar('f1', CAMBIOS)).toEqual({
        estado: 'sin_sala',
        conflictos: sin_sala,
      });
    });

    it('con entradas vendidas la base rechaza y el mensaje llega tal cual', async () => {
      const mensaje = 'La función tiene entradas vendidas: solo se puede cambiar el precio';
      const servicio = crearServicio(
        crearSupabaseFalso({ error: { code: '55000', message: mensaje } }),
      );

      expect(await servicio.modificar('f1', CAMBIOS)).toEqual({ estado: 'error', mensaje });
    });
  });

  describe('darDeBaja', () => {
    it('devuelve null si salió bien', async () => {
      const falso = crearSupabaseFalso();

      expect(await crearServicio(falso).darDeBaja('f1')).toBeNull();
      expect(falso.client.rpc).toHaveBeenCalledWith('dar_de_baja_funcion', { p_funcion_id: 'f1' });
    });

    it('devuelve el mensaje de la base si la función tiene entradas vendidas', async () => {
      const mensaje = 'La función tiene entradas vendidas y no se puede dar de baja';
      const servicio = crearServicio(
        crearSupabaseFalso({ error: { code: '55000', message: mensaje } }),
      );

      expect(await servicio.darDeBaja('f1')).toBe(mensaje);
    });
  });
});
