import { aplicarEvento, estadosDesdeFilas, primerVencimiento } from './estado-butacas';
import {
  describirVersion,
  diasConFunciones,
  funcionesEnHora,
  horasDelDia,
} from './agrupar-funciones';
import { edadALaFecha, puedeComprar } from './edad-compra';
import { sesionDeCompra } from './sesion';
import { EstadoDeButaca } from '../models/orden';
import { Funcion } from '../models/sala';

function funcion(id: string, inicio: string, formato = '2D', idioma = 'castellano'): Funcion {
  return {
    id,
    pelicula_id: 'p',
    sala_id: 's',
    inicio,
    formato,
    idioma,
    precio_base: 6500,
    activa: true,
    pelicula: { titulo: 'T', duracion_minutos: 100 },
    sala: { nombre: 'Sala 1' },
  } as Funcion;
}

describe('estado de las butacas', () => {
  it('una butaca retenida por otro se marca; una libre la saca del mapa', () => {
    let estados = aplicarEvento(new Map(), { butaca_id: 'a', estado: 'retenida' });
    expect(estados.get('a')).toBe('retenida');

    estados = aplicarEvento(estados, { butaca_id: 'a', estado: 'libre' });
    expect(estados.has('a')).toBe(false);
  });

  it('el eco de la reserva propia no la bloquea para su dueño', () => {
    const inicial = new Map<string, EstadoDeButaca>([['a', 'propia']]);
    expect(aplicarEvento(inicial, { butaca_id: 'a', estado: 'retenida' }).get('a')).toBe('propia');
  });

  it('una venta pisa a la reserva propia', () => {
    const inicial = new Map<string, EstadoDeButaca>([['a', 'propia']]);
    expect(aplicarEvento(inicial, { butaca_id: 'a', estado: 'ocupada' }).get('a')).toBe('ocupada');
  });

  it('no muta el mapa anterior', () => {
    const inicial = new Map<string, EstadoDeButaca>();
    aplicarEvento(inicial, { butaca_id: 'a', estado: 'ocupada' });
    expect(inicial.size).toBe(0);
  });

  it('ignora estados que no conoce al armar el mapa inicial', () => {
    const estados = estadosDesdeFilas([
      { butaca_id: 'a', estado: 'ocupada' },
      { butaca_id: 'b', estado: 'rara' },
    ]);
    expect([...estados.estados.keys()]).toEqual(['a']);
  });
});

describe('vencimiento de las reservas propias', () => {
  it('guarda el vencimiento solo de las propias', () => {
    const { vencimientos } = estadosDesdeFilas([
      { butaca_id: 'a', estado: 'propia', expira_at: '2026-10-05T18:10:00Z' },
      { butaca_id: 'b', estado: 'retenida', expira_at: '2026-10-05T18:05:00Z' },
    ]);
    expect([...vencimientos.keys()]).toEqual(['a']);
  });

  it('el primero en vencer manda', () => {
    expect(primerVencimiento(['2026-10-05T18:10:00Z', '2026-10-05T18:03:00Z'])).toBe(
      '2026-10-05T18:03:00Z',
    );
    expect(primerVencimiento([])).toBeNull();
  });
});

describe('agrupar funciones', () => {
  // 21:00 UTC del día 5 es 18:00 en Buenos Aires: el mismo día. 02:00 UTC del día 6 es
  // todavía el día 5 a las 23:00 en el cine.
  const funciones = [
    funcion('1', '2026-10-05T21:00:00Z'),
    funcion('2', '2026-10-05T21:00:00Z', '3D', 'subtitulada'),
    funcion('3', '2026-10-06T02:00:00Z'),
    funcion('4', '2026-10-07T18:00:00Z'),
  ];

  it('agrupa por el día del cine y no por el de UTC', () => {
    expect(diasConFunciones(funciones)).toEqual(['2026-10-05', '2026-10-07']);
  });

  it('lista cada horario una sola vez', () => {
    expect(horasDelDia(funciones, '2026-10-05')).toEqual(['18:00', '23:00']);
  });

  it('distingue funciones a la misma hora por su versión', () => {
    const enHora = funcionesEnHora(funciones, '2026-10-05', '18:00');
    expect(enHora.map(describirVersion)).toEqual(['2D · Castellano', '3D · Subtitulada']);
  });
});

describe('edad para comprar', () => {
  it('se mide a la fecha de la función, no a la de hoy', () => {
    expect(edadALaFecha('2013-10-05', '2026-10-05')).toBe(13);
    expect(edadALaFecha('2013-10-06', '2026-10-05')).toBe(12);
  });

  it('sin restricción se puede comprar sin declarar nada', () => {
    expect(puedeComprar(0, null, '2026-10-05')).toBe(true);
  });

  it('con restricción hace falta una fecha y que alcance la edad', () => {
    expect(puedeComprar(18, null, '2026-10-05')).toBe(false);
    expect(puedeComprar(18, '2010-01-01', '2026-10-05')).toBe(false);
    expect(puedeComprar(18, '2008-10-05', '2026-10-05')).toBe(true);
  });

  it('una fecha inválida no habilita la compra', () => {
    expect(puedeComprar(13, 'nunca', '2026-10-05')).toBe(false);
  });
});

describe('sesión de compra', () => {
  afterEach(() => sessionStorage.clear());

  it('se conserva entre llamadas y cumple el largo mínimo que exige la base', () => {
    const primera = sesionDeCompra();
    expect(sesionDeCompra()).toBe(primera);
    expect(primera.length).toBeGreaterThanOrEqual(16);
  });
});
