import { TestBed } from '@angular/core/testing';
import { Candy } from './candy';
import { Supabase } from './supabase';

type Respuesta = { data: unknown; error: { message: string } | null };

/**
 * Un `from()` falso: cada tabla responde con lo que se le indique y la cadena de
 * select/order/overrideTypes devuelve una promesa, como el cliente real.
 */
function crearSupabaseFalso(porTabla: Record<string, Respuesta>) {
  const tablas: string[] = [];

  return {
    tablas,
    client: {
      from: vi.fn((tabla: string) => {
        tablas.push(tabla);
        const constructor = {
          select: () => constructor,
          order: () => constructor,
          overrideTypes: async () => porTabla[tabla],
        };
        return constructor;
      }),
    },
  };
}

const ok = (data: unknown): Respuesta => ({ data, error: null });

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Candy {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Candy);
}

describe('Candy', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('junta categorías, productos, combos y recompensas en un solo resultado', async () => {
    const falso = crearSupabaseFalso({
      categorias_productos: ok([{ id: 'c1' }]),
      productos: ok([{ id: 'p1' }, { id: 'p2' }]),
      combos: ok([{ id: 'k1' }]),
      recompensas: ok([{ id: 'r1' }]),
    });

    const catalogo = await crearServicio(falso).cargar();

    expect(catalogo?.categorias).toHaveLength(1);
    expect(catalogo?.productos).toHaveLength(2);
    expect(catalogo?.combos).toHaveLength(1);
    expect(catalogo?.recompensas).toHaveLength(1);
    expect(falso.tablas.sort()).toEqual([
      'categorias_productos',
      'combos',
      'productos',
      'recompensas',
    ]);
  });

  it('si una de las lecturas falla devuelve null, no un candy a medias', async () => {
    const catalogo = await crearServicio(
      crearSupabaseFalso({
        categorias_productos: ok([]),
        productos: { data: null, error: { message: 'boom' } },
        combos: ok([]),
        recompensas: ok([]),
      }),
    ).cargar();

    expect(catalogo).toBeNull();
  });
});
