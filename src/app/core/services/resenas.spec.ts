import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Auth } from './auth';
import { Resenas } from './resenas';
import { Supabase } from './supabase';

interface Configuracion {
  /** Lo que devuelve la RPC de lectura */
  rpc?: unknown;
  /** Filas que devuelve un UPDATE o DELETE con .select(): vacío = RLS no dejó tocar nada */
  filasTocadas?: { id: string }[];
  /** Error que devuelve el insert, el update, el delete o la RPC */
  error?: { code?: string; message: string } | null;
}

/**
 * Doble del cliente. Registra qué se mandó a insert/update para poder afirmar sobre el
 * contenido de la escritura, que es donde estaría un bug de verdad (perfil_id, comentario).
 */
function crearSupabaseFalso({
  rpc = [],
  filasTocadas = [{ id: 'r1' }],
  error = null,
}: Configuracion = {}) {
  const insert = vi.fn(async (_valores: unknown) => ({ error }));
  const update = vi.fn((_valores: unknown) => ({
    eq: () => ({ select: async () => ({ data: error ? null : filasTocadas, error }) }),
  }));
  const borrar = vi.fn(() => ({
    eq: () => ({ select: async () => ({ data: error ? null : filasTocadas, error }) }),
  }));

  return {
    insert,
    update,
    borrar,
    client: {
      from: vi.fn(() => ({ insert, update, delete: borrar })),
      rpc: vi.fn(async (_nombre: string, _argumentos?: unknown) => ({
        data: error ? null : rpc,
        error,
      })),
    },
  };
}

function crearServicio(
  falso: ReturnType<typeof crearSupabaseFalso>,
  perfilId: string | null = 'perfil-1',
) {
  const auth = { perfil: signal(perfilId ? { id: perfilId } : null) };

  TestBed.configureTestingModule({
    providers: [
      { provide: Supabase, useValue: falso },
      { provide: Auth, useValue: auth },
    ],
  });
  return TestBed.inject(Resenas);
}

describe('Resenas', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('deLaPelicula', () => {
    it('lee por la función de la base, no por la tabla', async () => {
      const falso = crearSupabaseFalso({
        rpc: [{ id: 'r1', estrellas: 5, comentario: 'Genial', autor: 'Ana G.', es_propia: false }],
      });

      const lista = await crearServicio(falso).deLaPelicula('pelicula-1');

      expect(falso.client.rpc).toHaveBeenCalledWith('resenas_de_pelicula', {
        p_pelicula_id: 'pelicula-1',
      });
      expect(falso.client.from).not.toHaveBeenCalled();
      expect(lista?.[0].autor).toBe('Ana G.');
    });

    it('devuelve null si la base falla', async () => {
      const falso = crearSupabaseFalso({ error: { message: 'falló' } });

      expect(await crearServicio(falso).deLaPelicula('pelicula-1')).toBeNull();
    });
  });

  describe('guardar, una reseña nueva', () => {
    it('inserta con el perfil de la sesión, no con uno que pase la pantalla', async () => {
      const falso = crearSupabaseFalso();

      const resultado = await crearServicio(falso, 'perfil-7').guardar(
        'pelicula-1',
        { estrellas: 4, comentario: 'Muy buena' },
        null,
      );

      expect(resultado).toBeNull();
      expect(falso.insert).toHaveBeenCalledWith({
        pelicula_id: 'pelicula-1',
        perfil_id: 'perfil-7',
        estrellas: 4,
        comentario: 'Muy buena',
      });
    });

    it('recorta los espacios del comentario', async () => {
      const falso = crearSupabaseFalso();

      await crearServicio(falso).guardar('p', { estrellas: 3, comentario: '  bien  ' }, null);

      expect(falso.insert.mock.calls[0][0]).toMatchObject({ comentario: 'bien' });
    });

    it('acepta una reseña sin comentario: alcanza con las estrellas', async () => {
      const falso = crearSupabaseFalso();

      expect(
        await crearServicio(falso).guardar('p', { estrellas: 5, comentario: '' }, null),
      ).toBeNull();
    });

    it('sin sesión no va a la red y pide iniciar sesión', async () => {
      const falso = crearSupabaseFalso();

      const resultado = await crearServicio(falso, null).guardar(
        'p',
        { estrellas: 5, comentario: '' },
        null,
      );

      expect(resultado).toContain('Iniciá sesión');
      expect(falso.client.from).not.toHaveBeenCalled();
    });

    it.each([0, 6, 2.5, Number.NaN])(
      'rechaza %s estrellas antes de ir a la red',
      async (estrellas) => {
        const falso = crearSupabaseFalso();

        const resultado = await crearServicio(falso).guardar(
          'p',
          { estrellas, comentario: '' },
          null,
        );

        expect(resultado).toBe('Elegí de 1 a 5 estrellas.');
        expect(falso.insert).not.toHaveBeenCalled();
      },
    );

    it('rechaza un comentario más largo que el CHECK de la base', async () => {
      const falso = crearSupabaseFalso();

      const resultado = await crearServicio(falso).guardar(
        'p',
        { estrellas: 5, comentario: 'a'.repeat(501) },
        null,
      );

      expect(resultado).toContain('500');
      expect(falso.insert).not.toHaveBeenCalled();
    });

    it('acepta un comentario de exactamente 500 caracteres', async () => {
      const falso = crearSupabaseFalso();

      const resultado = await crearServicio(falso).guardar(
        'p',
        { estrellas: 5, comentario: 'a'.repeat(500) },
        null,
      );

      expect(resultado).toBeNull();
    });

    // Dos pestañas abiertas: la segunda choca contra el unique (pelicula_id, perfil_id)
    it('traduce la violación del unique a un mensaje que se entiende', async () => {
      const falso = crearSupabaseFalso({ error: { code: '23505', message: 'duplicate key' } });

      const resultado = await crearServicio(falso).guardar(
        'p',
        { estrellas: 5, comentario: '' },
        null,
      );

      expect(resultado).toBe('Ya dejaste una reseña para esta película.');
    });

    it('ante cualquier otro error da un mensaje genérico, sin filtrar el de la base', async () => {
      const falso = crearSupabaseFalso({ error: { code: '42501', message: 'permission denied' } });

      const resultado = await crearServicio(falso).guardar(
        'p',
        { estrellas: 5, comentario: '' },
        null,
      );

      expect(resultado).toBe('No pudimos guardar tu reseña. Probá de nuevo.');
    });
  });

  describe('guardar, corregir la propia', () => {
    it('actualiza solo estrellas y comentario, y no inserta', async () => {
      const falso = crearSupabaseFalso();

      const resultado = await crearServicio(falso).guardar(
        'pelicula-1',
        { estrellas: 2, comentario: 'Cambié de opinión' },
        'r1',
      );

      expect(resultado).toBeNull();
      // Ni pelicula_id ni perfil_id: la migración 0018 no otorga UPDATE sobre esas columnas
      expect(falso.update).toHaveBeenCalledWith({ estrellas: 2, comentario: 'Cambié de opinión' });
      expect(falso.insert).not.toHaveBeenCalled();
    });

    // RLS no falla ante un UPDATE ajeno: simplemente no toca ninguna fila
    it('avisa cuando no se modificó ninguna fila, en vez de dar por buena la operación', async () => {
      const falso = crearSupabaseFalso({ filasTocadas: [] });

      const resultado = await crearServicio(falso).guardar(
        'p',
        { estrellas: 2, comentario: '' },
        'ajena',
      );

      expect(resultado).toBe('No encontramos tu reseña para modificarla.');
    });

    it('ante un error de la base da un mensaje genérico', async () => {
      const falso = crearSupabaseFalso({ error: { message: 'falló' } });

      const resultado = await crearServicio(falso).guardar(
        'p',
        { estrellas: 2, comentario: '' },
        'r1',
      );

      expect(resultado).toBe('No pudimos guardar tu reseña. Probá de nuevo.');
    });
  });

  describe('borrar', () => {
    it('borra la reseña y devuelve null', async () => {
      const falso = crearSupabaseFalso();

      expect(await crearServicio(falso).borrar('r1')).toBeNull();
      expect(falso.borrar).toHaveBeenCalledOnce();
    });

    it('avisa cuando no se borró ninguna fila (la reseña es de otro o ya no existe)', async () => {
      const falso = crearSupabaseFalso({ filasTocadas: [] });

      expect(await crearServicio(falso).borrar('ajena')).toBe(
        'No encontramos tu reseña para borrarla.',
      );
    });

    it('ante un error de la base da un mensaje genérico', async () => {
      const falso = crearSupabaseFalso({ error: { message: 'falló' } });

      expect(await crearServicio(falso).borrar('r1')).toBe(
        'No pudimos borrar tu reseña. Probá de nuevo.',
      );
    });
  });
});
