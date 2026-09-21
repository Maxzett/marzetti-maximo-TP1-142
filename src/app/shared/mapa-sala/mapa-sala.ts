import { Component, computed, input } from '@angular/core';
import { armarMapa, contarPorTipo, NOMBRE_DE_TIPO } from '../../core/salas/distribucion';
import { Butaca, TIPOS_DE_UBICACION, TipoUbicacion } from '../../core/models/sala';

/** "R", "R y S" o "R, S y T": cómo se lee una lista de filas en voz alta */
function unirFilas(filas: readonly string[]): string {
  if (filas.length <= 1) {
    return filas.join('');
  }

  return `${filas.slice(0, -1).join(', ')} y ${filas[filas.length - 1]}`;
}

/**
 * Mapa de una sala, de solo lectura (RF-16, D-01, RNF-10).
 *
 * Los tres tipos de ubicación se distinguen por su SILUETA y no solo por el color: una butaca,
 * un espacio para silla de ruedas y una butaca VIP son tres dibujos distintos, así que se
 * reconocen igual sin ver colores. El color refuerza, no informa. Un espacio para silla de
 * ruedas tampoco es "una butaca de otro color" (D-01): además del dibujo, ocupa el doble de
 * ancho, que es lo que ocupa en una sala de verdad, y por eso J y K tienen 14 espacios donde
 * las demás filas tienen 28 butacas y las tres columnas siguen alineadas.
 *
 * Es la base sobre la que la compra (F6) suma selección y actualización en tiempo real. Por ahora
 * no es interactivo: se dibuja una vez y se lee como una sola imagen con su descripción.
 */
@Component({
  imports: [],
  selector: 'app-mapa-sala',
  styleUrl: './mapa-sala.css',
  templateUrl: './mapa-sala.html',
})
export class MapaSala {
  readonly butacas = input.required<readonly Butaca[]>();
  /** Nombre de la sala, para que el lector de pantalla sepa de cuál se habla */
  readonly etiqueta = input('la sala');

  protected readonly tipos = TIPOS_DE_UBICACION;
  protected readonly nombres = NOMBRE_DE_TIPO;

  protected readonly filas = computed(() => armarMapa(this.butacas()));
  protected readonly conteo = computed(() => contarPorTipo(this.butacas()));

  /**
   * Lo que oye quien no ve el dibujo: el mismo dato que da la leyenda, más en qué filas está
   * cada tipo. Las filas se leen del propio mapa y no se dan por sabidas: si mañana la
   * distribución cambia, la descripción sigue siendo cierta.
   */
  protected readonly resumen = computed(() => {
    const filas = this.filas();
    const conteo = this.conteo();
    const filasDe = (tipo: TipoUbicacion) =>
      unirFilas(filas.filter((fila) => fila.tipo === tipo).map((fila) => fila.fila));

    return (
      `Mapa de ${this.etiqueta()}: ${conteo.total} ubicaciones en ${filas.length} filas. ` +
      `${conteo.estandar} butacas estándar, ` +
      `${conteo.silla_ruedas} espacios para silla de ruedas (filas ${filasDe('silla_ruedas')}) ` +
      `y ${conteo.vip} butacas VIP (filas ${filasDe('vip')}).`
    );
  });
}
