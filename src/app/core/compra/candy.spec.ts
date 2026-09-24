import { Combo } from '../models/candy';
import {
  agruparPorCategoria,
  cambiarCantidad,
  comoLineas,
  contenidoDelCombo,
  describirCupon,
  entradasCubiertas,
  entradasDelCombo,
  MAXIMO_POR_LINEA,
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
