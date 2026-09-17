import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  linkedSignal,
  model,
  signal,
  viewChild,
} from '@angular/core';
import {
  aIso,
  dentroDelRango,
  desdeIso,
  desplazamientoPrimerDia,
  diasDeLaSemana,
  diasDelMes,
  formatearLargo,
  hoyIso,
  limitar,
  nombreMes,
  sumarDias,
  sumarMeses,
} from './fechas';

export type VistaSelector = 'dias' | 'meses' | 'anios';

export interface CeldaDia {
  iso: string;
  dia: number;
  deOtroMes: boolean;
  habilitada: boolean;
  esHoy: boolean;
  seleccionada: boolean;
}

/** 12 años entran en una grilla de 3 × 4 sin scroll */
const ANIOS_POR_PAGINA = 12;

/** Columnas de las cuadrículas de meses y años, para que ↑ y ↓ salten una fila entera */
const COLUMNAS_CUADRICULA = 3;

/**
 * Selector de fecha propio (RNF-08). El cliente rechazó las ruedas nativas y el scroll largo,
 * así que:
 *
 * - Un mes entero entra en pantalla: elegir un día de la semana que viene es un clic.
 * - Para ir lejos en el tiempo están las vistas de meses y años. Una fecha de nacimiento de
 *   1998 sale en tres clics (año, mes, día) en vez de 300 toques a la flecha de mes anterior.
 * - Se maneja entero con el teclado siguiendo el patrón de grilla de WAI-ARIA: flechas para
 *   moverse, PageUp y PageDown para cambiar de período, Home y End para los bordes.
 *   Las tres vistas responden a las mismas teclas; lo único que cambia es cuánto salta cada una.
 */
@Component({
  imports: [],
  selector: 'app-selector-fecha',
  styleUrl: './selector-fecha.css',
  templateUrl: './selector-fecha.html',
})
export class SelectorFecha {
  /** Fecha elegida, como 'AAAA-MM-DD'. Vacío significa que todavía no se eligió ninguna */
  readonly valor = model('');
  readonly minimo = input('');
  readonly maximo = input('');
  /**
   * Con una lista, solo esas fechas se pueden elegir: es el caso de la compra, donde únicamente
   * los días con función están disponibles. Null deja elegir cualquier día del rango.
   */
  readonly fechasHabilitadas = input<readonly string[] | null>(null);
  readonly vistaInicial = input<VistaSelector>('dias');
  readonly etiqueta = input('Elegí una fecha');

  protected readonly hoy = hoyIso();
  protected readonly diasSemana = diasDeLaSemana();

  /** linkedSignal y no signal: la vista arranca donde diga el input y se puede cambiar después */
  protected readonly vista = linkedSignal<VistaSelector>(() => this.vistaInicial());

  /**
   * Día con el foco del teclado, que no es necesariamente el elegido: uno se mueve antes de elegir.
   * Arranca en la fecha ya elegida si la hay, y si no en hoy recortado al rango permitido.
   */
  protected readonly fechaEnfocada = linkedSignal<string>(
    () => this.valor() || limitar(this.hoy, this.minimo(), this.maximo()),
  );

  /** Se incrementa en cada movimiento con teclado, para devolver el foco después de redibujar */
  private readonly pedidoDeFoco = signal(0);

  private readonly raiz = viewChild<ElementRef<HTMLElement>>('raiz');

  /** Buscar en un Set es directo; con la lista habría que recorrerla por cada día dibujado */
  private readonly habilitadas = computed(() => {
    const lista = this.fechasHabilitadas();
    return lista === null ? null : new Set(lista);
  });

  protected readonly mesVisible = computed(
    () => desdeIso(this.fechaEnfocada()) ?? desdeIso(this.hoy)!,
  );

  protected readonly primerAnioDePagina = computed(() => {
    const { anio } = this.mesVisible();
    return anio - (anio % ANIOS_POR_PAGINA);
  });

  protected readonly titulo = computed(() => {
    const { anio, mes } = this.mesVisible();

    switch (this.vista()) {
      case 'dias':
        return `${nombreMes(mes)} de ${anio}`;
      case 'meses':
        return String(anio);
      default:
        return `${this.primerAnioDePagina()} – ${this.primerAnioDePagina() + ANIOS_POR_PAGINA - 1}`;
    }
  });

  protected readonly resumen = computed(() =>
    this.valor() ? formatearLargo(this.valor()) : 'Todavía no elegiste una fecha',
  );

  /**
   * Seis semanas siempre, aunque sobren días del mes anterior o del siguiente: así la grilla
   * no cambia de alto al pasar de mes y los botones no se mueven abajo del cursor.
   */
  protected readonly semanas = computed<CeldaDia[][]>(() => {
    const { anio, mes } = this.mesVisible();
    const inicio = sumarDias(aIso(anio, mes, 1), -desplazamientoPrimerDia(anio, mes));
    const elegida = this.valor();

    return Array.from({ length: 6 }, (_, fila) =>
      Array.from({ length: 7 }, (_, columna) => {
        const iso = sumarDias(inicio, fila * 7 + columna);
        const fecha = desdeIso(iso)!;

        return {
          iso,
          dia: fecha.dia,
          deOtroMes: fecha.mes !== mes,
          habilitada: this.estaHabilitada(iso),
          esHoy: iso === this.hoy,
          seleccionada: iso === elegida,
        };
      }),
    );
  });

  protected readonly meses = computed(() => {
    const { anio, mes: mesActual } = this.mesVisible();

    return Array.from({ length: 12 }, (_, mes) => ({
      mes,
      nombre: nombreMes(mes, 'short').replace('.', ''),
      seleccionado: mes === mesActual,
      habilitado: this.hayAlgunDiaHabilitado(anio, mes),
    }));
  });

  protected readonly anios = computed(() => {
    const desde = this.primerAnioDePagina();
    const { anio: anioActual } = this.mesVisible();

    return Array.from({ length: ANIOS_POR_PAGINA }, (_, indice) => {
      const anio = desde + indice;

      return {
        anio,
        seleccionado: anio === anioActual,
        habilitado: this.hayAlgunMesHabilitado(anio),
      };
    });
  });

  constructor() {
    // El foco se mueve después de redibujar: antes de eso la celda de destino todavía no existe
    afterRenderEffect(() => {
      if (this.pedidoDeFoco() === 0) {
        return;
      }

      const contenedor = this.raiz()?.nativeElement;
      contenedor?.querySelector<HTMLButtonElement>(this.selectorDeLoEnfocado())?.focus();
    });
  }

  protected elegir(iso: string): void {
    if (!this.estaHabilitada(iso)) {
      return;
    }

    this.valor.set(iso);
    this.fechaEnfocada.set(iso);
  }

  protected elegirMes(mes: number): void {
    const { anio } = this.mesVisible();

    // Los botones usan aria-disabled y no disabled, así que el clic hay que frenarlo acá
    if (!this.hayAlgunDiaHabilitado(anio, mes)) {
      return;
    }

    this.fechaEnfocada.set(limitar(aIso(anio, mes, 1), this.minimo(), this.maximo()));
    this.vista.set('dias');
  }

  protected elegirAnio(anio: number): void {
    if (!this.hayAlgunMesHabilitado(anio)) {
      return;
    }

    const { mes } = this.mesVisible();
    this.fechaEnfocada.set(limitar(aIso(anio, mes, 1), this.minimo(), this.maximo()));
    this.vista.set('meses');
  }

  /** El título es el atajo para alejarse: de días salta a años, que es el salto más largo */
  protected cambiarVista(): void {
    this.vista.update((actual) => (actual === 'dias' ? 'anios' : 'dias'));
  }

  protected retroceder(): void {
    this.desplazar(-1);
  }

  protected avanzar(): void {
    this.desplazar(1);
  }

  /**
   * Patrón de grilla de WAI-ARIA: el selector se maneja entero con el teclado, en las tres
   * vistas. No hace falta estado nuevo para eso: fechaEnfocada ya es la única fuente de
   * verdad del foco, y mesVisible() se deriva de ella, así que en la vista de meses el
   * elemento enfocado es su mes y en la de años, su año. Mover el foco es mover esa fecha.
   */
  protected alTeclear(evento: KeyboardEvent): void {
    const destino =
      this.vista() === 'dias' ? this.destinoEnDias(evento) : this.destinoEnCuadricula(evento);

    if (destino === null) {
      return;
    }

    evento.preventDefault();
    this.fechaEnfocada.set(limitar(destino, this.minimo(), this.maximo()));
    this.pedidoDeFoco.update((numero) => numero + 1);
  }

  protected esEnfocada(iso: string): boolean {
    return iso === this.fechaEnfocada();
  }

  private desplazar(pasos: number): void {
    const saltoEnMeses =
      this.vista() === 'dias' ? 1 : this.vista() === 'meses' ? 12 : 12 * ANIOS_POR_PAGINA;
    this.fechaEnfocada.set(sumarMeses(this.fechaEnfocada(), pasos * saltoEnMeses));
  }

  private estaHabilitada(iso: string): boolean {
    if (!dentroDelRango(iso, this.minimo(), this.maximo())) {
      return false;
    }

    const habilitadas = this.habilitadas();
    return habilitadas === null || habilitadas.has(iso);
  }

  /**
   * Sin lista explícita alcanza con mirar los bordes del mes contra el rango: recorrer los
   * 31 días por cada uno de los 12 meses, y eso por cada año de la vista, no haría falta.
   */
  private hayAlgunDiaHabilitado(anio: number, mes: number): boolean {
    const primero = aIso(anio, mes, 1);
    const ultimo = aIso(anio, mes, diasDelMes(anio, mes));
    const habilitadas = this.habilitadas();

    if (habilitadas === null) {
      return (
        !(this.maximo() && primero > this.maximo()) && !(this.minimo() && ultimo < this.minimo())
      );
    }

    const prefijo = `${primero.slice(0, 7)}-`;

    for (const iso of habilitadas) {
      if (iso.startsWith(prefijo) && dentroDelRango(iso, this.minimo(), this.maximo())) {
        return true;
      }
    }

    return false;
  }

  private hayAlgunMesHabilitado(anio: number): boolean {
    const primero = aIso(anio, 0, 1);
    const ultimo = aIso(anio, 11, 31);
    const habilitadas = this.habilitadas();

    if (habilitadas === null) {
      return (
        !(this.maximo() && primero > this.maximo()) && !(this.minimo() && ultimo < this.minimo())
      );
    }

    const prefijo = `${anio}-`;

    for (const iso of habilitadas) {
      if (iso.startsWith(prefijo) && dentroDelRango(iso, this.minimo(), this.maximo())) {
        return true;
      }
    }

    return false;
  }

  /** Devuelve la fecha a la que mueve la tecla, o null si la tecla no es de navegación */
  private destinoEnDias(evento: KeyboardEvent): string | null {
    const actual = this.fechaEnfocada();

    switch (evento.key) {
      case 'ArrowLeft':
        return sumarDias(actual, -1);
      case 'ArrowRight':
        return sumarDias(actual, 1);
      case 'ArrowUp':
        return sumarDias(actual, -7);
      case 'ArrowDown':
        return sumarDias(actual, 7);
      case 'Home':
        return sumarDias(actual, -this.diaDeLaSemana(actual));
      case 'End':
        return sumarDias(actual, 6 - this.diaDeLaSemana(actual));
      // Shift salta de a un año, que es lo que pide una fecha de nacimiento
      case 'PageUp':
        return sumarMeses(actual, evento.shiftKey ? -12 : -1);
      case 'PageDown':
        return sumarMeses(actual, evento.shiftKey ? 12 : 1);
      default:
        return null;
    }
  }

  /**
   * Meses y años comparten cuadrícula, así que comparten teclas: lo único que cambia es
   * cuánto vale un paso. En meses un paso es un mes; en años, doce.
   */
  private destinoEnCuadricula(evento: KeyboardEvent): string | null {
    const actual = this.fechaEnfocada();
    const enMeses = this.vista() === 'meses';
    const paso = enMeses ? 1 : 12;
    const fila = paso * COLUMNAS_CUADRICULA;
    const { anio, mes } = this.mesVisible();

    switch (evento.key) {
      case 'ArrowLeft':
        return sumarMeses(actual, -paso);
      case 'ArrowRight':
        return sumarMeses(actual, paso);
      case 'ArrowUp':
        return sumarMeses(actual, -fila);
      case 'ArrowDown':
        return sumarMeses(actual, fila);
      // Home y End van a los bordes de lo que se ve: el año en meses, la página en años
      case 'Home':
        return enMeses ? aIso(anio, 0, 1) : aIso(this.primerAnioDePagina(), mes, 1);
      case 'End':
        return enMeses
          ? aIso(anio, 11, 1)
          : aIso(this.primerAnioDePagina() + ANIOS_POR_PAGINA - 1, mes, 1);
      // Una página entera, que es lo mismo que hacen las flechas de la barra
      case 'PageUp':
        return sumarMeses(actual, enMeses ? -12 : -12 * ANIOS_POR_PAGINA);
      case 'PageDown':
        return sumarMeses(actual, enMeses ? 12 : 12 * ANIOS_POR_PAGINA);
      default:
        return null;
    }
  }

  /** Cada vista marca lo enfocado con un atributo distinto, pero el mecanismo es el mismo */
  private selectorDeLoEnfocado(): string {
    const { anio, mes } = this.mesVisible();

    switch (this.vista()) {
      case 'dias':
        return `[data-iso="${this.fechaEnfocada()}"]`;
      case 'meses':
        return `[data-opcion="${mes}"]`;
      default:
        return `[data-opcion="${anio}"]`;
    }
  }

  private diaDeLaSemana(iso: string): number {
    const fecha = desdeIso(iso)!;
    return (new Date(Date.UTC(fecha.anio, fecha.mes, fecha.dia)).getUTCDay() + 6) % 7;
  }
}
