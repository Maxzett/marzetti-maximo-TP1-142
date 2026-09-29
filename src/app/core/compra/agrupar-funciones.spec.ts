import { Funcion } from '../models/sala';
import {
  describirVersion,
  filtrarPorVersion,
  formatosDisponibles,
  funcionesALaVista,
  idiomasDisponibles,
} from './agrupar-funciones';

function funcion(id: string, inicio: string, formato = '2D', idioma = 'castellano'): Funcion {
  return { id, inicio, formato, idioma } as Funcion;
}

describe('funcionesALaVista', () => {
  const HOY = '2026-09-29';

  it('deja de hoy a siete días después, ambos incluidos', () => {
    const funciones = [
      funcion('hoy', '2026-09-29T21:00:00-03:00'),
      funcion('ultimo', '2026-10-06T23:40:00-03:00'),
      funcion('afuera', '2026-10-07T13:00:00-03:00'),
    ];

    expect(funcionesALaVista(funciones, HOY).map((f) => f.id)).toEqual(['hoy', 'ultimo']);
  });

  it('cuenta el día del cine: la trasnoche del 6/10 en UTC ya es 7/10 y sigue entrando', () => {
    // 23:40 de Buenos Aires son las 02:40 del día siguiente en UTC
    expect(funcionesALaVista([funcion('t', '2026-10-07T02:40:00Z')], HOY)).toHaveLength(1);
  });
});

describe('filtros de versión', () => {
  const FUNCIONES = [
    funcion('a', '2026-10-01T14:00:00-03:00', '3D', 'castellano'),
    funcion('b', '2026-10-01T19:00:00-03:00', '2D', 'subtitulada'),
    funcion('c', '2026-10-02T22:00:00-03:00', '3D', 'subtitulada'),
  ];

  it('sin filtro devuelve todo', () => {
    expect(filtrarPorVersion(FUNCIONES, { formato: null, idioma: null })).toHaveLength(3);
  });

  it('formato e idioma se combinan: tienen que cumplirse los dos', () => {
    expect(
      filtrarPorVersion(FUNCIONES, { formato: '3D', idioma: 'subtitulada' }).map((f) => f.id),
    ).toEqual(['c']);
  });

  it('los formatos y los idiomas disponibles salen en el orden de siempre, sin repetir', () => {
    expect(formatosDisponibles(FUNCIONES)).toEqual(['2D', '3D']);
    expect(idiomasDisponibles(FUNCIONES)).toEqual(['castellano', 'subtitulada']);
  });

  it('describe la versión con palabras', () => {
    expect(describirVersion({ formato: '4D', idioma: 'subtitulada' })).toBe('4D · Subtitulada');
  });
});
