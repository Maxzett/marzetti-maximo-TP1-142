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

  // RF-56 y RNF-02: películas y pósters (migración 0025)
  describe('películas', () => {
    it('trae todas las películas y los géneros para elegir', async () => {
      const falso = crearSupabaseFalso({
        peliculas: ok([{ id: 'p1', titulo: 'X', peliculas_generos: [] }]),
        generos: ok([{ id: 'g1', nombre: 'Acción', slug: 'accion' }]),
      });

      const datos = await crearServicio(falso).cargarPeliculas();

      expect(datos?.peliculas.map((p) => p.id)).toEqual(['p1']);
      expect(datos?.generos[0].slug).toBe('accion');
    });

    it('si los géneros no se pueden leer devuelve null', async () => {
      const falso = crearSupabaseFalso({ generos: { data: null, error: { message: 'no' } } });

      expect(await crearServicio(falso).cargarPeliculas()).toBeNull();
    });

    it('guarda por la función de la base, con los géneros como lista de ids', async () => {
      const falso = crearSupabaseFalso();

      await crearServicio(falso).guardarPelicula({
        id: null,
        titulo: 'Nueva',
        sinopsis: '',
        poster_url: null,
        duracion_minutos: 100,
        restriccion_edad: 13,
        fecha_estreno: '2026-10-15',
        destacada: false,
        precio_preventa: 3000,
        generos: ['g1', 'g2'],
      });

      expect(falso.client.rpc).toHaveBeenCalledWith(
        'guardar_pelicula',
        expect.objectContaining({ p_id: null, p_precio_preventa: 3000, p_generos: ['g1', 'g2'] }),
      );
    });

    it('muestra el mensaje de la base cuando rechaza el cambio', async () => {
      const falso = crearSupabaseFalso(
        {},
        { code: '55000', message: 'La película tiene funciones programadas' },
      );

      expect(
        await crearServicio(falso).guardarPelicula({
          id: 'p1',
          titulo: 'X',
          sinopsis: '',
          poster_url: null,
          duracion_minutos: 90,
          restriccion_edad: 0,
          fecha_estreno: null,
          destacada: false,
          precio_preventa: null,
          generos: ['g1'],
        }),
      ).toContain('funciones programadas');
    });
  });

  describe('pósters', () => {
    function conStorage(errorDeSubida: { message: string } | null = null) {
      const falso = crearSupabaseFalso();
      const upload = vi.fn(async (_ruta: string, _archivo: unknown, _opciones: unknown) => ({
        error: errorDeSubida,
      }));
      const remove = vi.fn(async (_rutas: string[]) => ({ data: [], error: null }));
      const getPublicUrl = (ruta: string) => ({
        data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/posters/${ruta}` },
      });
      const from = vi.fn((_bucket: string) => ({ upload, remove, getPublicUrl }));
      return {
        falso: { ...falso, client: { ...falso.client, storage: { from } } },
        upload,
        remove,
        from,
      };
    }

    const archivo = (tipo: string, bytes = 10) =>
      new File([new Uint8Array(bytes)], 'poster', { type: tipo });

    it('sube al bucket posters con un nombre nuevo y devuelve la URL pública', async () => {
      const { falso, upload, from } = conStorage();

      const resultado = await crearServicio(falso as never).subirPoster(archivo('image/png'));

      expect(from).toHaveBeenCalledWith('posters');
      const ruta = upload.mock.calls[0][0];
      expect(ruta).toMatch(/^[0-9a-f-]{36}.png$/);
      expect(resultado).toEqual({
        url: `https://x.supabase.co/storage/v1/object/public/posters/${ruta}`,
      });
    });

    it('rechaza lo que no es una imagen aceptada sin ir a la red', async () => {
      const { falso, upload } = conStorage();

      const resultado = await crearServicio(falso as never).subirPoster(archivo('image/gif'));

      expect(resultado).toEqual({ error: expect.stringContaining('JPG, PNG o WebP') });
      expect(upload).not.toHaveBeenCalled();
    });

    it('rechaza un archivo de más de 2 MB', async () => {
      const { falso, upload } = conStorage();

      const resultado = await crearServicio(falso as never).subirPoster(
        archivo('image/jpeg', 2 * 1024 * 1024 + 1),
      );

      expect(resultado).toEqual({ error: expect.stringContaining('2 MB') });
      expect(upload).not.toHaveBeenCalled();
    });

    it('si Storage rechaza la subida lo dice', async () => {
      const { falso } = conStorage({ message: 'row-level security' });

      expect(await crearServicio(falso as never).subirPoster(archivo('image/webp'))).toEqual({
        error: expect.stringContaining('No pudimos subir'),
      });
    });

    it('borra solo archivos del propio bucket', async () => {
      const { falso, remove } = conStorage();
      const servicio = crearServicio(falso as never);

      await servicio.borrarPoster('https://x.supabase.co/storage/v1/object/public/posters/abc.png');
      await servicio.borrarPoster('https://otro-sitio.com/poster.png');
      await servicio.borrarPoster(null);

      expect(remove).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledWith(['abc.png']);
    });
  });
});
