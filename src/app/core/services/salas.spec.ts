import { TestBed } from '@angular/core/testing';
import { Salas } from './salas';
import { Supabase } from './supabase';

interface Respuestas {
  filas?: unknown;
  error?: { code?: string; message: string } | null;
}

/** Doble del cliente de Supabase: la cadena devuelve siempre la misma y overrideTypes resuelve */
function crearSupabaseFalso({ filas = [], error = null }: Respuestas = {}) {
  const cadena = {
    select: vi.fn(() => cadena),
    eq: vi.fn(() => cadena),
    order: vi.fn(() => cadena),
    overrideTypes: vi.fn(async () => ({ data: error ? null : filas, error })),
  };

  return {
    cadena,
    client: {
      from: vi.fn(() => cadena),
      rpc: vi.fn(async (_nombre: string, _argumentos?: unknown) => ({ data: null, error })),
    },
  };
}

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Salas {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Salas);
}

describe('Salas', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('cargarSalas', () => {
    it('devuelve las salas por nombre, las dadas de baja incluidas', async () => {
      const salas = [
        { id: 's1', nombre: 'Sala 1', activa: true },
        { id: 's2', nombre: 'Sala 2', activa: false },
      ];
      const falso = crearSupabaseFalso({ filas: salas });

      expect(await crearServicio(falso).cargarSalas()).toEqual(salas);
      expect(falso.cadena.order).toHaveBeenCalledWith('nombre');
    });

    it('devuelve null si la base falla', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ error: { message: 'falló' } }));

      expect(await servicio.cargarSalas()).toBeNull();
    });
  });

  describe('cargarButacas', () => {
    it('pide solo las butacas de esa sala', async () => {
      const falso = crearSupabaseFalso();
      await crearServicio(falso).cargarButacas('s1');

      expect(falso.client.from).toHaveBeenCalledWith('butacas');
      expect(falso.cadena.eq).toHaveBeenCalledWith('sala_id', 's1');
    });

    it('devuelve null si la base falla', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ error: { message: 'falló' } }));

      expect(await servicio.cargarButacas('s1')).toBeNull();
    });
  });

  describe('crear', () => {
    it('llama a la función de la base y devuelve null si salió bien', async () => {
      const falso = crearSupabaseFalso();

      expect(await crearServicio(falso).crear('Sala 5')).toBeNull();
      expect(falso.client.rpc).toHaveBeenCalledWith('crear_sala', { p_nombre: 'Sala 5' });
    });

    it('traduce el nombre repetido', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({ error: { code: '23505', message: 'duplicate key value' } }),
      );

      expect(await servicio.crear('Sala 1')).toBe('Ya existe una sala con ese nombre.');
    });

    it('un cliente que llama a mano recibe el mensaje de permiso, no el de Postgres', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({ error: { code: '42501', message: 'permission denied' } }),
      );

      expect(await servicio.crear('Sala 5')).toContain('administración');
    });
  });

  describe('actualizar', () => {
    it('manda nombre y estado a la función de la base', async () => {
      const falso = crearSupabaseFalso();

      expect(await crearServicio(falso).actualizar('s1', 'Sala Uno', false)).toBeNull();
      expect(falso.client.rpc).toHaveBeenCalledWith('actualizar_sala', {
        p_sala_id: 's1',
        p_nombre: 'Sala Uno',
        p_activa: false,
      });
    });

    it('con funciones por delante muestra el mensaje de la base tal cual', async () => {
      const mensaje = 'La sala tiene funciones programadas: dalas de baja o esperá a que terminen';
      const servicio = crearServicio(
        crearSupabaseFalso({ error: { code: '55000', message: mensaje } }),
      );

      expect(await servicio.actualizar('s1', 'Sala 1', false)).toBe(mensaje);
    });
  });
});
