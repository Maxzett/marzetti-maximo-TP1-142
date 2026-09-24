import { Component, computed, ElementRef, inject, input, output, signal } from '@angular/core';
import { EstadoDeButaca } from '../../core/models/orden';
import { Butaca, TIPOS_DE_UBICACION, TipoUbicacion } from '../../core/models/sala';
import { armarMapa, contarPorTipo, NOMBRE_DE_TIPO } from '../../core/salas/distribucion';

/** "R", "R y S" o "R, S y T": cómo se lee una lista de filas en voz alta */
function unirFilas(filas: readonly string[]): string {
  if (filas.length <= 1) {
    return filas.join('');
  }

  return `${filas.slice(0, -1).join(', ')} y ${filas[filas.length - 1]}`;
}

const TEXTO_DE_ESTADO: Record<EstadoDeButaca, string> = {
  libre: 'libre',
  propia: 'elegida por vos',
  ocupada: 'vendida',
  retenida: 'la está eligiendo otra persona',
};

/**
 * Mapa de una sala (RF-16, RF-24, RF-25, D-01, RNF-10).
 *
 * Los tres tipos de ubicación se distinguen por su SILUETA y no solo por el color: una butaca,
 * un espacio para silla de ruedas y una butaca VIP son tres dibujos distintos, así que se
 * reconocen igual sin ver colores. El color refuerza, no informa. Un espacio para silla de
 * ruedas tampoco es "una butaca de otro color" (D-01): además del dibujo, ocupa el doble de
 * ancho, que es lo que ocupa en una sala de verdad, y por eso J y K tienen 14 espacios donde
 * las demás filas tienen 28 butacas y las tres columnas siguen alineadas.
 *
 * Con `seleccionable` cada ubicación pasa a ser un botón (F6). El estado de cada una llega en
 * `estados` y se dice con un símbolo además del color (RNF-10): ✓ es tuya, ✕ está vendida,
 * • la tiene reservada otra persona. Como son 532 botones, solo uno entra en el orden de Tab y
 * las flechas mueven entre ellos (foco itinerante), el patrón de una grilla de WAI-ARIA.
 * Sin `seleccionable` se lee como una sola imagen con su descripción, como antes.
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
  /** Convierte las ubicaciones en botones para elegir butacas */
  readonly seleccionable = input(false);
  /** Butacas que no están libres; las que no aparecen se dan por libres */
  readonly estados = input<ReadonlyMap<string, EstadoDeButaca>>(new Map());
  /** Se elige o se suelta una butaca. Las vendidas y las de otra persona no emiten */
  readonly elegida = output<Butaca>();

  private readonly raiz = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly activaId = signal<string | null>(null);

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

  /** Cada fila como lista plana, para moverse con las flechas sin pensar en los bloques */
  private readonly filasPlanas = computed(() => this.filas().map((fila) => fila.bloques.flat()));

  /** La butaca que recibe el foco con Tab: la última tocada, o la primera del mapa */
  protected readonly idActivo = computed(() => this.activaId() ?? this.butacas()[0]?.id ?? null);

  protected estadoDe(butaca: Butaca): EstadoDeButaca {
    return this.estados().get(butaca.id) ?? 'libre';
  }

  protected nombreAccesible(butaca: Butaca): string {
    const lugar = butaca.tipo === 'silla_ruedas' ? 'espacio' : 'butaca';
    const estado = TEXTO_DE_ESTADO[this.estadoDe(butaca)];

    return `Fila ${butaca.fila}, ${lugar} ${butaca.numero}, ${NOMBRE_DE_TIPO[butaca.tipo]}, ${estado}`;
  }

  protected alPresionar(butaca: Butaca): void {
    this.activaId.set(butaca.id);

    // aria-disabled deja pasar el foco, pero el clic no debe hacer nada: vendida o de otra persona
    const estado = this.estadoDe(butaca);

    if (estado === 'libre' || estado === 'propia') {
      this.elegida.emit(butaca);
    }
  }

  protected alTeclear(evento: KeyboardEvent, butaca: Butaca): void {
    const destino = this.vecina(butaca, evento.key);

    if (!destino) {
      return;
    }

    evento.preventDefault();
    this.activaId.set(destino.id);

    // El botón nuevo recibe tabindex=0 recién en el próximo ciclo de detección: el foco se
    // pide por id sobre el DOM, que ya lo tiene, sin esperar a que Angular lo repinte.
    this.raiz.nativeElement.querySelector<HTMLElement>(`[data-id="${destino.id}"]`)?.focus();
  }

  /** La butaca a la que lleva una flecha, o null si la tecla no es de movimiento o no hay más */
  private vecina(butaca: Butaca, tecla: string): Butaca | null {
    const filas = this.filasPlanas();
    const f = filas.findIndex((fila) => fila.some((b) => b.id === butaca.id));

    if (f < 0) {
      return null;
    }

    const actual = filas[f];
    const i = actual.findIndex((b) => b.id === butaca.id);

    switch (tecla) {
      case 'ArrowLeft':
        return actual[i - 1] ?? null;
      case 'ArrowRight':
        return actual[i + 1] ?? null;
      case 'Home':
        return actual[0];
      case 'End':
        return actual[actual.length - 1];
      case 'ArrowUp':
      case 'ArrowDown': {
        const otra = filas[f + (tecla === 'ArrowUp' ? -1 : 1)];

        if (!otra) {
          return null;
        }

        // J y K tienen 14 espacios y las demás 28 butacas: se conserva la posición relativa
        // y no el número de orden, así "arriba" cae sobre lo que se ve encima.
        const posicion = actual.length > 1 ? i / (actual.length - 1) : 0;
        return otra[Math.round(posicion * (otra.length - 1))];
      }
      default:
        return null;
    }
  }
}
