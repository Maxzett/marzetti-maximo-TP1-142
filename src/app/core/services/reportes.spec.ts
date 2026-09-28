import { TestBed } from '@angular/core/testing';
import { REGISTROS_POR_PAGINA, Reportes } from './reportes';
import { Supabase } from './supabase';

interface Respuesta {
  data?: unknown;
  error?: { code?: string; message: string } | null;
  count?: number | null;
}

/** Doble del cliente: registra cada filtro de la cadena y responde lo que se le indique */
function crearSupabaseFalso({ data = [], error = null, count = null }: Respuesta = {}) {
  const llamadas: [string, ...unknown[]][] = [];
  const cadena: Record<string, unknown> = {};

  for (const metodo of ['select', 'eq', 'gte', 'lt', 'order', 'range']) {
    cadena[metodo] = (...args: unknown[]) => {
      llamadas.push([metodo, ...args]);
      return cadena;
    };
  }
  cadena['overrideTypes'] = async () => ({ data: error ? null : data, error, count });

  return {
    llamadas,
    client: {
      from: vi.fn(() => cadena),
      rpc: vi.fn(async (_nombre: string, _argumentos?: unknown) => ({
        data: error ? null : data,
        error,
      })),
    },
  };
}

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Reportes {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Reportes);
}

describe('Reportes', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('facturacion', () => {
    it('pide el rango a la base y normaliza los montos a número', async () => {
      const falso = crearSupabaseFalso({
        data: [
          {
            dia: '2026-09-27',
            ordenes: 2,
            entradas: 3,
            cobrado: '13000.50',
            credito: '0',
            descuentos: '0',
            canceladas: 0,
          },
        ],
      });

      const dias = await crearServicio(falso).facturacion('2026-09-21', '2026-09-27');

      expect(falso.client.rpc).toHaveBeenCalledWith('reporte_facturacion', {
        p_desde: '2026-09-21',
        p_hasta: '2026-09-27',
      });
      expect(dias?.[0].cobrado).toBe(13000.5);
    });

    it('devuelve null si la base falla, que no es lo mismo que un período sin ventas', async () => {
      const servicio = crearServicio(
        crearSupabaseFalso({ error: { code: '42501', message: 'no' } }),
      );

      expect(await servicio.facturacion('2026-09-21', '2026-09-27')).toBeNull();
    });
  });

  it('películas más vistas: período y fecha de referencia', async () => {
    const falso = crearSupabaseFalso({
      data: [{ pelicula_id: 'p1', titulo: 'Dune', entradas: 4 }],
    });

    const peliculas = await crearServicio(falso).peliculasMasVistas('mes', '2026-09-01');

    expect(falso.client.rpc).toHaveBeenCalledWith('peliculas_mas_vistas', {
      p_periodo: 'mes',
      p_referencia: '2026-09-01',
      p_limite: 10,
    });
    expect(peliculas).toEqual([{ pelicula_id: 'p1', titulo: 'Dune', entradas: 4 }]);
  });

  it('productos más vendidos: el top 5 del rango', async () => {
    const falso = crearSupabaseFalso({ data: [] });

    await crearServicio(falso).productosMasVendidos('2026-09-21', '2026-09-27');

    expect(falso.client.rpc).toHaveBeenCalledWith('productos_mas_vendidos', {
      p_desde: '2026-09-21',
      p_hasta: '2026-09-27',
      p_limite: 5,
    });
  });

  describe('actividad', () => {
    it('lo más reciente primero, de a una página, con el total para paginar', async () => {
      const falso = crearSupabaseFalso({ data: [{ id: 1 }], count: 132 });

      const pagina = await crearServicio(falso).actividad({ accion: '', desde: '', hasta: '' }, 2);

      expect(falso.client.from).toHaveBeenCalledWith('log_actividad');
      expect(falso.llamadas).toContainEqual(['order', 'creado_at', { ascending: false }]);
      expect(falso.llamadas).toContainEqual([
        'range',
        2 * REGISTROS_POR_PAGINA,
        3 * REGISTROS_POR_PAGINA - 1,
      ]);
      expect(pagina).toEqual({ registros: [{ id: 1 }], total: 132 });
    });

    it('sin filtros no filtra nada', async () => {
      const falso = crearSupabaseFalso();

      await crearServicio(falso).actividad({ accion: '', desde: '', hasta: '' }, 0);

      expect(falso.llamadas.map(([metodo]) => metodo)).not.toContain('eq');
      expect(falso.llamadas.map(([metodo]) => metodo)).not.toContain('gte');
    });

    it('los días del filtro son del cine, y el "hasta" incluye el día entero', async () => {
      const falso = crearSupabaseFalso();

      await crearServicio(falso).actividad(
        { accion: 'crear_funcion', desde: '2026-09-21', hasta: '2026-09-27' },
        0,
      );

      expect(falso.llamadas).toContainEqual(['eq', 'accion', 'crear_funcion']);
      expect(falso.llamadas).toContainEqual(['gte', 'creado_at', '2026-09-21T00:00:00-03:00']);
      expect(falso.llamadas).toContainEqual(['lt', 'creado_at', '2026-09-28T00:00:00-03:00']);
    });

    it('trae el nombre del actor pero ningún dato sensible (RNF-11)', async () => {
      const falso = crearSupabaseFalso();

      await crearServicio(falso).actividad({ accion: '', desde: '', hasta: '' }, 0);
      const columnas = String(falso.llamadas.find(([metodo]) => metodo === 'select')?.[1]);

      expect(columnas).toContain('perfiles(nombre, apellido)');
      expect(columnas).not.toMatch(/sensibles|sangre|ojos|vacaciones|fecha_nacimiento/);
    });

    it('devuelve null si la base falla', async () => {
      const servicio = crearServicio(crearSupabaseFalso({ error: { message: 'falló' } }));

      expect(await servicio.actividad({ accion: '', desde: '', hasta: '' }, 0)).toBeNull();
    });
  });
});
