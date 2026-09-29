import { Combo } from '../models/candy';
import {
  agruparPorCategoria,
  cambiarCantidad,
  catalogoSinEntradas,
  comoLineas,
  contenidoDelCombo,
  describirCupon,
  entradasCubiertas,
  entradasDelCombo,
  lineasDelPedido,
  MAXIMO_POR_LINEA,
  progresoDeCanje,
  unidadesQueEntran,
} from './candy';

function combo(id: string, items: Combo['combo_items']): Combo {
  return {
    id,
    nombre: id,
    descripcion: '',
    imagen_url: null,
    precio: 1000,
    destacado: true,
    combo_items: items,
  };
}

const conEntrada = combo('solo', [
  { incluye_entrada: true, cantidad: 1, productos: null },
  { incluye_entrada: false, cantidad: 1, productos: { nombre: 'Pochoclo mediano' } },
]);
const pareja = combo('pareja', [
  { incluye_entrada: true, cantidad: 2, productos: null },
  { incluye_entrada: false, cantidad: 2, productos: { nombre: 'Gaseosa 500 ml' } },
]);
const soloCandy = combo('candy', [
  { incluye_entrada: false, cantidad: 1, productos: { nombre: 'Pochoclo mediano' } },
]);

describe('cambiarCantidad', () => {
  it('suma sin mutar el mapa original', () => {
    const original = new Map<string, number>();
    const nuevo = cambiarCantidad(original, 'a', 1);

    expect(nuevo.get('a')).toBe(1);
    expect(original.size).toBe(0);
  });

  it('al llegar a cero la línea desaparece', () => {
    const mapa = cambiarCantidad(new Map([['a', 1]]), 'a', -1);

    expect(mapa.has('a')).toBe(false);
  });

  it('no baja de cero ni pasa del tope', () => {
    expect(cambiarCantidad(new Map(), 'a', -5).has('a')).toBe(false);
    expect(cambiarCantidad(new Map([['a', MAXIMO_POR_LINEA]]), 'a', 1).get('a')).toBe(
      MAXIMO_POR_LINEA,
    );
  });

  it('se puede pasar un tope propio', () => {
    expect(cambiarCantidad(new Map([['a', 2]]), 'a', 1, 2).get('a')).toBe(2);
  });
});

describe('comoLineas', () => {
  it('arma la lista {id, cantidad} que espera la base', () => {
    expect(
      comoLineas(
        new Map([
          ['a', 2],
          ['b', 1],
        ]),
      ),
    ).toEqual([
      { id: 'a', cantidad: 2 },
      { id: 'b', cantidad: 1 },
    ]);
  });
});

describe('agruparPorCategoria', () => {
  const producto = (id: string, categoria: string) => ({
    id,
    categoria_id: categoria,
    nombre: id,
    descripcion: '',
    imagen_url: null,
    precio: 1,
  });

  it('respeta el orden del administrador y omite las categorías sin productos', () => {
    const grupos = agruparPorCategoria(
      [
        { id: 'c2', nombre: 'Bebidas', orden: 2 },
        { id: 'c1', nombre: 'Pochoclos', orden: 1 },
        { id: 'c3', nombre: 'Helados', orden: 3 },
      ],
      [producto('p1', 'c1'), producto('p2', 'c2'), producto('p3', 'c1')],
    );

    expect(grupos.map((g) => g.categoria.nombre)).toEqual(['Pochoclos', 'Bebidas']);
    expect(grupos[0].productos.map((p) => p.id)).toEqual(['p1', 'p3']);
  });
});

describe('entradas de los combos', () => {
  it('cuenta las entradas que trae cada combo', () => {
    expect(entradasDelCombo(conEntrada)).toBe(1);
    expect(entradasDelCombo(pareja)).toBe(2);
    expect(entradasDelCombo(soloCandy)).toBe(0);
  });

  it('suma combos y canje de entrada', () => {
    const cantidades = new Map([
      ['solo', 2],
      ['pareja', 1],
      ['candy', 3],
    ]);

    expect(entradasCubiertas([conEntrada, pareja, soloCandy], cantidades, false)).toBe(4);
    expect(entradasCubiertas([conEntrada, pareja, soloCandy], cantidades, true)).toBe(5);
  });
});

describe('unidadesQueEntran', () => {
  const todos = [conEntrada, pareja, soloCandy];

  it('un combo con entrada se limita por las butacas libres', () => {
    expect(unidadesQueEntran(conEntrada, todos, new Map(), 3, false)).toBe(3);
    expect(unidadesQueEntran(conEntrada, todos, new Map([['solo', 2]]), 3, false)).toBe(1);
  });

  it('un combo de dos entradas necesita dos butacas libres', () => {
    expect(unidadesQueEntran(pareja, todos, new Map(), 3, false)).toBe(1);
    expect(unidadesQueEntran(pareja, todos, new Map([['solo', 2]]), 3, false)).toBe(0);
  });

  it('el canje de entrada también ocupa una butaca', () => {
    expect(unidadesQueEntran(conEntrada, todos, new Map(), 2, true)).toBe(1);
  });

  it('un combo sin entrada no consume butacas', () => {
    expect(unidadesQueEntran(soloCandy, todos, new Map(), 0, false)).toBe(MAXIMO_POR_LINEA);
  });
});

describe('textos', () => {
  it('lista el contenido de un combo', () => {
    expect(contenidoDelCombo(pareja)).toBe('2 × Entrada · 2 × Gaseosa 500 ml');
    expect(contenidoDelCombo(conEntrada)).toBe('Entrada · Pochoclo mediano');
  });

  it('un producto dado de baja no rompe la línea', () => {
    expect(
      contenidoDelCombo(combo('x', [{ incluye_entrada: false, cantidad: 1, productos: null }])),
    ).toBe('Producto');
  });

  it('dice el descuento según su tipo', () => {
    expect(describirCupon({ tipo_descuento: 'porcentaje', valor: 20 })).toBe('20 %');
    expect(describirCupon({ tipo_descuento: 'monto', valor: 1500 }).replace(/\s/g, '')).toBe(
      '$1.500',
    );
  });
});

describe('progresoDeCanje', () => {
  it('con puntos de sobra alcanza y no falta nada', () => {
    expect(progresoDeCanje(28000, 30000)).toEqual({ alcanza: true, faltan: 0, porcentaje: 100 });
  });

  it('con el costo justo también alcanza', () => {
    expect(progresoDeCanje(28000, 28000).alcanza).toBe(true);
  });

  it('dice cuántos faltan y el avance redondeado hacia abajo', () => {
    expect(progresoDeCanje(65000, 21700)).toEqual({
      alcanza: false,
      faltan: 43300,
      porcentaje: 33,
    });
  });

  it('un saldo negativo cuenta como cero', () => {
    expect(progresoDeCanje(1000, -500)).toEqual({ alcanza: false, faltan: 1000, porcentaje: 0 });
  });
});

describe('catalogoSinEntradas (RF-34.1)', () => {
  it('saca los combos que traen entrada y el canje de una entrada', () => {
    const catalogo = catalogoSinEntradas({
      categorias: [],
      productos: [],
      combos: [conEntrada, pareja, soloCandy],
      recompensas: [
        { id: 'r1', nombre: 'Entrada', tipo: 'entrada', producto_id: null, costo_puntos: 65000 },
        { id: 'r2', nombre: 'Gaseosa', tipo: 'producto', producto_id: 'p1', costo_puntos: 28000 },
      ],
    });

    expect(catalogo.combos.map((c) => c.id)).toEqual(['candy']);
    expect(catalogo.recompensas.map((r) => r.id)).toEqual(['r2']);
  });
});

describe('lineasDelPedido', () => {
  const catalogo = {
    categorias: [],
    productos: [
      {
        id: 'p1',
        categoria_id: 'c',
        nombre: 'Pochoclo',
        descripcion: '',
        imagen_url: null,
        precio: 1,
      },
      {
        id: 'p2',
        categoria_id: 'c',
        nombre: 'Gaseosa',
        descripcion: '',
        imagen_url: null,
        precio: 1,
      },
    ],
    combos: [soloCandy, pareja],
    recompensas: [],
  };

  it('lista combos y después productos, en el orden del catálogo, con su cantidad', () => {
    const lineas = lineasDelPedido(
      catalogo,
      new Map([
        ['p2', 3],
        ['p1', 1],
      ]),
      new Map([['pareja', 2]]),
    );

    expect(lineas).toEqual([
      { id: 'pareja', nombre: 'pareja', cantidad: 2 },
      { id: 'p1', nombre: 'Pochoclo', cantidad: 1 },
      { id: 'p2', nombre: 'Gaseosa', cantidad: 3 },
    ]);
  });

  it('sin nada elegido no hay líneas, y un id que no está en el catálogo no aparece', () => {
    expect(lineasDelPedido(catalogo, new Map(), new Map())).toEqual([]);
    expect(lineasDelPedido(catalogo, new Map([['otro', 2]]), new Map())).toEqual([]);
  });
});
