import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

/** Columnas de las cuadrículas de horas y minutos, para que ↑ y ↓ salten una fila entera */
const COLUMNAS_CUADRICULA = 6;

/**
 * Selector de hora propio (RNF-08), con dos modos que resuelven los dos casos del sistema:
 *
 * - Con `opciones`: muestra los horarios que existen, como en la compra, donde no se elige
 *   una hora cualquiera sino una de las funciones programadas.
 * - Sin `opciones`: dos cuadrículas, horas y minutos. Las 24 horas entran en 6 × 4 y los
 *   minutos en 3 × 4 con paso de 15, así que no hay nada que scrollear ni rueda que girar.
 *
 * Cada cuadrícula es un radiogroup y no una fila de botones de dos estados: de todas las
 * opciones se elige exactamente una, que es justo lo que significa un grupo de radios.
 * Con aria-pressed, un lector de pantalla leía "18, no presionado" veinticuatro veces sin
 * decir nunca que eran alternativas de lo mismo.
 *
 * Eso trae además el teclado del patrón de radiogroup de WAI-ARIA: el grupo entero es una
 * sola parada de Tab y adentro se recorre con las flechas, que además eligen. Antes había
 * que apretar Tab veinticuatro veces para llegar de las 00 a las 23.
 */
@Component({
  imports: [],
  selector: 'app-selector-hora',
  styleUrl: './selector-hora.css',
  templateUrl: './selector-hora.html',
})
export class SelectorHora {
  /** Hora elegida como 'HH:MM'. Vacío significa que todavía no se eligió ninguna */
  readonly valor = model('');
  readonly opciones = input<readonly string[] | null>(null);
  /** Minutos entre opción y opción cuando no hay lista fija. 15 deja 4 por hora */
  readonly pasoMinutos = input(15);
  readonly etiqueta = input('Elegí un horario');

  protected readonly horaElegida = computed(() => this.valor().slice(0, 2));
  protected readonly minutoElegido = computed(() => this.valor().slice(3, 5));

  protected readonly horas = computed(() =>
    Array.from({ length: 24 }, (_, hora) => String(hora).padStart(2, '0')),
  );

  protected readonly minutos = computed(() => {
    const paso = Math.max(1, Math.min(30, this.pasoMinutos()));
    const cantidad = Math.floor(60 / paso);

    return Array.from({ length: cantidad }, (_, indice) => String(indice * paso).padStart(2, '0'));
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Se incrementa en cada movimiento con teclado, para devolver el foco después de redibujar */
  private readonly pedidoDeFoco = signal(0);

  /** Qué botón hay que enfocar cuando termine el redibujado. No es señal: se fija justo antes del pedido */
  private aEnfocar = '';

  constructor() {
    // El foco se mueve después de redibujar: elegir con las flechas cambia el tabindex de lugar
    afterRenderEffect(() => {
      if (this.pedidoDeFoco() === 0) {
        return;
      }

      this.host.nativeElement.querySelector<HTMLButtonElement>(this.aEnfocar)?.focus();
    });
  }

  protected elegirOpcion(hora: string): void {
    this.valor.set(hora);
  }

  /** Al tocar una hora sin haber elegido minutos todavía, se asume en punto */
  protected elegirHora(hora: string): void {
    this.valor.set(`${hora}:${this.minutoElegido() || '00'}`);
  }

  protected elegirMinuto(minuto: string): void {
    this.valor.set(`${this.horaElegida() || '00'}:${minuto}`);
  }

  /**
   * Teclado del radiogroup: las flechas mueven y eligen en el mismo gesto, que es como se
   * comporta un grupo de radios nativo. Los tres grupos comparten este método; lo único que
   * cambia es la lista y cuál es la opción elegida hoy.
   */
  protected alTeclearEnHorarios(evento: KeyboardEvent): void {
    const lista = this.opciones() ?? [];
    // La lista de horarios se acomoda sola según el ancho, así que no hay filas que saltar:
    // arriba y abajo valen lo mismo que izquierda y derecha, como en un radiogroup en columna
    const destino = this.destino(evento, lista, this.valor(), 1);

    if (destino !== null) {
      // Sin esto las flechas además scrollean la página por debajo del selector
      evento.preventDefault();
      this.elegirOpcion(destino);
      this.pedirFoco('horarios', destino);
    }
  }

  protected alTeclearEnHoras(evento: KeyboardEvent): void {
    const destino = this.destino(evento, this.horas(), this.horaElegida(), COLUMNAS_CUADRICULA);

    if (destino !== null) {
      // Sin esto las flechas además scrollean la página por debajo del selector
      evento.preventDefault();
      this.elegirHora(destino);
      this.pedirFoco('horas', destino);
    }
  }

  protected alTeclearEnMinutos(evento: KeyboardEvent): void {
    const destino = this.destino(evento, this.minutos(), this.minutoElegido(), COLUMNAS_CUADRICULA);

    if (destino !== null) {
      // Sin esto las flechas además scrollean la página por debajo del selector
      evento.preventDefault();
      this.elegirMinuto(destino);
      this.pedirFoco('minutos', destino);
    }
  }

  /**
   * Devuelve la opción a la que mueve la tecla, o null si no es una tecla de navegación.
   * El recorrido da la vuelta en los bordes, como el radiogroup nativo: de la última se
   * pasa a la primera.
   */
  private destino(
    evento: KeyboardEvent,
    lista: readonly string[],
    elegida: string,
    columnas: number,
  ): string | null {
    if (lista.length === 0) {
      return null;
    }

    // Sin nada elegido todavía, el recorrido arranca en la primera opción
    const actual = Math.max(0, lista.indexOf(elegida));
    // Con menos opciones que columnas entran todas en una fila y no hay nada arriba ni abajo
    const fila = Math.min(columnas, lista.length);
    const total = lista.length;

    switch (evento.key) {
      case 'ArrowLeft':
        return lista[(actual - 1 + total) % total];
      case 'ArrowRight':
        return lista[(actual + 1) % total];
      case 'ArrowUp':
        return lista[(actual - fila + total) % total];
      case 'ArrowDown':
        return lista[(actual + fila) % total];
      case 'Home':
        return lista[0];
      case 'End':
        return lista[total - 1];
      default:
        return null;
    }
  }

  private pedirFoco(grupo: string, valor: string): void {
    this.aEnfocar = `[data-grupo="${grupo}"][data-valor="${valor}"]`;
    this.pedidoDeFoco.update((numero) => numero + 1);
  }
}
