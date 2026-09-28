import { Pelicula } from '../models/pelicula';
import { sumarDias } from '../../shared/selector-fecha/fechas';
import { enCartelera } from './filtrar';

/**
 * Cuándo sale a la venta una película (RF-49, RN-10). Es el espejo de venta_desde() de la
 * migración 0025: con precio de preventa, siete días antes del estreno; sin preventa, el día del
 * estreno; sin fecha de estreno, siempre.
 *
 * La que decide es la base: un trigger rechaza la reserva de una butaca antes de esa fecha. Esta
 * copia existe para decirlo en la pantalla sin esperar a que falle la compra, igual que el aviso
 * de edad de la F6.
 */

/** Días de preventa antes del estreno: la columna generada `preventa_desde` de 0004 */
export const DIAS_DE_PREVENTA = 7;

type DatosDeVenta = Pick<Pelicula, 'fecha_estreno' | 'precio_preventa'>;

export interface EstadoDeVenta {
  /** Si hoy ya se pueden comprar entradas */
  aLaVenta: boolean;
  /** 'AAAA-MM-DD' desde el que se venden, o null si se venden desde siempre */
  desde: string | null;
  /** Si hoy rige el precio de preventa: ya abrió la venta y todavía no es el estreno */
  enPreventa: boolean;
}

export function ventaDesde(pelicula: DatosDeVenta): string | null {
  if (pelicula.fecha_estreno === null) {
    return null;
  }

  return pelicula.precio_preventa !== null
    ? sumarDias(pelicula.fecha_estreno, -DIAS_DE_PREVENTA)
    : pelicula.fecha_estreno;
}

/** Las fechas son 'AAAA-MM-DD': comparadas como texto ordenan igual que como fechas */
export function estadoDeVenta(pelicula: DatosDeVenta, hoy: string): EstadoDeVenta {
  const desde = ventaDesde(pelicula);
  const aLaVenta = desde === null || hoy >= desde;
  const enPreventa =
    aLaVenta &&
    pelicula.precio_preventa !== null &&
    pelicula.fecha_estreno !== null &&
    hoy < pelicula.fecha_estreno;

  return { aLaVenta, desde, enPreventa };
}

/** RF-08: Próximamente es todo lo que no está en cartelera, preventa incluida */
export function esProxima(pelicula: Pick<Pelicula, 'fecha_estreno'>, hoy: string): boolean {
  return !enCartelera(pelicula, hoy);
}

/**
 * Las de Próximamente, de la más cercana a la más lejana. Con el mismo día, por título, para que
 * el orden no dependa de cómo las devolvió la base.
 */
export function ordenarProximas<T extends Pick<Pelicula, 'fecha_estreno' | 'titulo'>>(
  peliculas: readonly T[],
  hoy: string,
): T[] {
  return peliculas
    .filter((pelicula) => esProxima(pelicula, hoy))
    .sort(
      (a, b) =>
        (a.fecha_estreno ?? '').localeCompare(b.fecha_estreno ?? '') ||
        a.titulo.localeCompare(b.titulo, 'es'),
    );
}
