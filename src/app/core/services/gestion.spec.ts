import { TestBed } from '@angular/core/testing';
import { Gestion } from './gestion';
import { Supabase } from './supabase';

type Respuesta = { data: unknown; error: { code?: string; message: string } | null };

/** from() falso: cada tabla responde lo suyo y se anotan los filtros que se le aplican */
function crearSupabaseFalso(
  porTabla: Record<string, Respuesta> = {},
  errorRpc: { code?: string; message: string } | null = null,
) {
  const filtros: string[] = [];

  return {
    filtros,
    client: {
      from: vi.fn((tabla: string) => {
        const cadena = {
          select: () => cadena,
          order: () => cadena,
          eq: (columna: string, valor: unknown) => {
            filtros.push(`${tabla}.${columna}=${String(valor)}`);
            return cadena;
          },
          overrideTypes: async () => porTabla[tabla] ?? { data: [], error: null },
        };
        return cadena;
      }),
      rpc: vi.fn(async (_nombre: string, _argumentos?: unknown) => ({
        data: null,
        error: errorRpc,
      })),
    },
  };
}

function crearServicio(falso: ReturnType<typeof crearSupabaseFalso>): Gestion {
  TestBed.configureTestingModule({ providers: [{ provide: Supabase, useValue: falso }] });
  return TestBed.inject(Gestion);
}

const ok = (data: unknown): Respuesta => ({ data, error: null });

describe('Gestion', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('lectura', () => {
    it('el candy del admin incluye lo dado de baja: no filtra por activo', async () => {
      const falso = crearSupabaseFalso({
        productos: ok([{ id: 'p1', precio: '3500.00', activo: false }]),
      });

      const candy = await crearServicio(falso).cargarCandy();

      expect(candy?.productos[0]).toEqual({ id: 'p1', precio: 3500, activo: false });
      expect(falso.filtros).toEqual([]);
    });

    it('las promociones traen la configuración como un objeto de números', async () => {
      const falso = crearSupabaseFalso({
        configuracion: ok([
          { clave: 'recargo_vip', valor: '2000' },
          { clave: 'max_butacas_por_orden', valor: 8 },
        ]),
      });

      const datos = await crearServicio(falso).cargarPromociones();

      expect(datos?.configuracion).toEqual({ recargo_vip: 2000, max_butacas_por_orden: 8 });
      // Para elegir el producto de una recompensa solo sirven los activos
      expect(falso.filtros).toEqual(['productos.activo=true']);
    });

    it('si una lectura falla devuelve null, no una pantalla a medias', async () => {
      const falso = crearSupabaseFalso({ cupones: { data: null, error: { message: 'no' } } });

      expect(await crearServicio(falso).cargarPromociones()).toBeNull();
    });
  });

  describe('escritura, solo por funciones de la base', () => {
    it('guardar un producto nuevo manda id nulo', async () => {
      const falso = crearSupabaseFalso();

      const error = await crearServicio(falso).guardarProducto({
        id: null,
        categoria_id: 'c1',
        nombre: 'Palito',
        descripcion: '',
        precio: 1500,
        activo: true,
      });

      expect(error).toBeNull();
      expect(falso.client.rpc).toHaveBeenCalledWith('guardar_producto', {
        p_id: null,
        p_categoria: 'c1',
        p_nombre: 'Palito',
        p_descripcion: '',
        p_precio: 1500,
        p_activo: true,
      });
    });

    it('el combo manda su contenido tal cual', async () => {
      const falso = crearSupabaseFalso();
      const items = [
        { producto_id: null, incluye_entrada: true, cantidad: 1 },
        { producto_id: 'p1', incluye_entrada: false, cantidad: 2 },
      ];

      await crearServicio(falso).guardarCombo({
        id: 'k1',
        nombre: 'Combo',
        descripcion: '',
        precio: 9000,
        destacado: true,
        activo: true,
        combo_items: items,
      });

      expect(falso.client.rpc).toHaveBeenCalledWith(
        'guardar_combo',
        expect.objectContaining({ p_id: 'k1', p_items: items }),
      );
    });

    it('la configuración va de a una clave', async () => {
      const falso = crearSupabaseFalso();

      await crearServicio(falso).guardarConfiguracion('recargo_vip', 2500);

      expect(falso.client.rpc).toHaveBeenCalledWith('guardar_configuracion', {
        p_clave: 'recargo_vip',
        p_valor: 2500,
      });
    });

    it('el rechazo de la base se muestra con su mensaje', async () => {
      const falso = crearSupabaseFalso(
        {},
        { code: '55000', message: 'Ya hay un cupón de bienvenida activo' },
      );

      const error = await crearServicio(falso).guardarCupon({
        id: null,
        codigo: 'HOLA',
        tipo: 'bienvenida',
        tipo_descuento: 'porcentaje',
        valor: 10,
        edad_minima: null,
        vigente_desde: null,
        vigente_hasta: null,
        activo: true,
      });

      expect(error).toBe('Ya hay un cupón de bienvenida activo');
    });

    it('un código duplicado que ganó la carrera se explica como cupón, no como sala', async () => {
      const falso = crearSupabaseFalso({}, { code: '23505', message: 'duplicate key' });

      const error = await crearServicio(falso).guardarCupon({
        id: null,
        codigo: 'HOLA',
        tipo: 'general',
        tipo_descuento: 'monto',
        valor: 500,
        edad_minima: null,
        vigente_desde: null,
        vigente_hasta: null,
        activo: true,
      });

      expect(error).toBe('Ya existe un cupón con ese código.');
    });
  });
});
