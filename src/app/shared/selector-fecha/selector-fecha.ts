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

/**
 * Selector de fecha propio (RNF-08). El cliente rechazó las ruedas nativas y el scroll largo,
 * así que:
 *
 * - Un mes entero entra en pantalla: elegir un día de la semana que viene es un clic.
 * - Para ir lejos en el tiempo están las vistas de meses y años. Una fecha de nacimiento de
 *   1998 sale en tres clics (año, mes, día) en vez de 300 toques a la flecha de mes anterior.
 * - Se maneja entero con el teclado siguiendo el patrón de grilla de WAI-ARIA: flechas para
 *   moverse, PageUp y PageDown para cambiar de mes, Home y End para los bordes de la semana.
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

  private readonly grilla = viewChild<ElementRef<HTMLElement>>('grilla');

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

      const iso = this.fechaEnfocada();
      const contenedor = this.grilla()?.nativeElement;
      contenedor?.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`)?.focus();
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
    this.fechaEnfocada.set(limitar(aIso(anio, mes, 1), this.minimo(), this.maximo()));
    this.vista.set('dias');
  }

  protected elegirAnio(anio: number): void {
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

  /** Patrón de grilla de WAI-ARIA: el calendario se maneja entero con el teclado */
  protected alTeclear(evento: KeyboardEvent): void {
    if (this.vista() !== 'dias') {
      return;
    }

    const actual = this.fechaEnfocada();
    let destino: string;

    switch (evento.key) {
      case 'ArrowLeft':
        destino = sumarDias(actual, -1);
        break;
      case 'ArrowRight':
        destino = sumarDias(actual, 1);
        break;
      case 'ArrowUp':
        destino = sumarDias(actual, -7);
        break;
      case 'ArrowDown':
        destino = sumarDias(actual, 7);
        break;
      case 'Home':
        destino = sumarDias(actual, -this.diaDeLaSemana(actual));
        break;
      case 'End':
        destino = sumarDias(actual, 6 - this.diaDeLaSemana(actual));
        break;
      // Shift salta de a un año, que es lo que pide una fecha de nacimiento
      case 'PageUp':
        destino = sumarMeses(actual, evento.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        destino = sumarMeses(actual, evento.shiftKey ? 12 : 1);
        break;
      default:
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

  private diaDeLaSemana(iso: string): number {
    const fecha = desdeIso(iso)!;
    return (new Date(Date.UTC(fecha.anio, fecha.mes, fecha.dia)).getUTCDay() + 6) % 7;
  }
}
