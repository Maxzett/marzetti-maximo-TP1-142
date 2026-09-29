import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  describirVersion,
  diasConFunciones,
  filtrarPorVersion,
  formatosDisponibles,
  funcionesALaVista,
  funcionesEnHora,
  horasDelDia,
  idiomasDisponibles,
  textoDeIdioma,
} from '../../core/compra/agrupar-funciones';
import {
  DIAS_DE_LA_SEMANA,
  describirInicio,
  diaDeLaSemana,
} from '../../core/funciones/programacion';
import { FormatoFuncion, Funcion, IdiomaFuncion } from '../../core/models/sala';
import { Funciones } from '../../core/services/funciones';
import { Boton } from '../../shared/boton/boton';
import { ChipsOpcion, OpcionChip } from '../../shared/chips-opcion/chips-opcion';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { formatearDiaYMes, hoyIso, sumarDias } from '../../shared/selector-fecha/fechas';
import { Spinner } from '../../shared/spinner/spinner';

/**
 * El valor del chip "Todos" de los filtros. No es '' porque para app-chips-opcion un valor
 * vacío es "nada elegido", y "Todos" es una opción elegida.
 */
const TODAS = 'todas';
const TODAS_LAS_OPCIONES: OpcionChip = { valor: TODAS, etiqueta: 'Todos' };

/**
 * Elegir día y horario de una película para ir a comprar (RF-24, RNF-08).
 *
 * Muestra la semana que viene, hoy y los siete días siguientes, como la cartelera que publica
 * un cine, aunque la programación cargada llegue más lejos. Arriba, dos filtros opcionales por
 * formato e idioma; después los días que tienen función y los horarios de ese día: no hay nada
 * que scrollear ni una combinación imposible para elegir. Si dos funciones caen a la misma hora
 * (salas distintas), se distinguen por formato e idioma; la sala la asigna el cine (RF-21) y se
 * ve en la compra.
 */
@Component({
  imports: [Boton, ChipsOpcion, Mensaje, RouterLink, Seleccion, Spinner],
  selector: 'app-elegir-funcion',
  styleUrl: './elegir-funcion.css',
  templateUrl: './elegir-funcion.html',
})
export class ElegirFuncion {
  private readonly servicio = inject(Funciones);

  readonly peliculaId = input.required<string>();

  protected readonly cargando = signal(true);
  /** Null si la lectura falló: es distinto de una película que todavía no tiene funciones */
  protected readonly funciones = signal<Funcion[] | null>(null);

  // Lo que el usuario tocó. Lo que se muestra sale de los computed de abajo, que corrigen una
  // elección que dejó de existir (otra película, otro día) sin efectos que escriban señales.
  private readonly fechaTocada = signal('');
  private readonly horaTocada = signal('');
  private readonly versionTocada = signal('');
  private readonly formatoTocado = signal(TODAS);
  private readonly idiomaTocado = signal(TODAS);

  /** Lo que se ofrece para comprar: la semana que viene, no toda la programación cargada */
  protected readonly semana = computed(() => funcionesALaVista(this.funciones() ?? [], hoyIso()));

  /** Si hay funciones pero todas después de la semana, el primer día en que hay una */
  protected readonly primeraFuera = computed(() => {
    const todas = diasConFunciones(this.funciones() ?? []);
    return this.semana().length === 0 && todas.length > 0 ? formatearDiaYMes(todas[0]) : '';
  });

  // ── Filtros de formato e idioma ──
  // Las opciones salen de la semana entera, no de lo ya filtrado: así elegir "3D" no hace
  // desaparecer "Subtitulada" y el espectador ve siempre todo lo que hay.
  private readonly formatos = computed(() => formatosDisponibles(this.semana()));
  private readonly idiomas = computed(() => idiomasDisponibles(this.semana()));

  /** Un grupo de chips con una sola opción no filtra nada: no se muestra */
  protected readonly opcionesDeFormato = computed<readonly OpcionChip[]>(() =>
    this.formatos().length > 1
      ? [TODAS_LAS_OPCIONES, ...this.formatos().map((f) => ({ valor: f, etiqueta: f }))]
      : [],
  );

  protected readonly opcionesDeIdioma = computed<readonly OpcionChip[]>(() =>
    this.idiomas().length > 1
      ? [
          TODAS_LAS_OPCIONES,
          ...this.idiomas().map((i) => ({ valor: i, etiqueta: textoDeIdioma(i) })),
        ]
      : [],
  );

  /** El elegido si esta película lo tiene; si no (se cambió de película), todos */
  protected readonly formato = computed(() =>
    this.formatos().includes(this.formatoTocado() as FormatoFuncion) ? this.formatoTocado() : TODAS,
  );

  protected readonly idioma = computed(() =>
    this.idiomas().includes(this.idiomaTocado() as IdiomaFuncion) ? this.idiomaTocado() : TODAS,
  );

  protected readonly hayFiltro = computed(
    () => this.formato() !== TODAS || this.idioma() !== TODAS,
  );

  /** Las funciones de la semana que pasan los filtros: de acá salen días, horarios y versiones */
  private readonly visibles = computed(() =>
    filtrarPorVersion(this.semana(), {
      formato: this.formato() === TODAS ? null : (this.formato() as FormatoFuncion),
      idioma: this.idioma() === TODAS ? null : (this.idioma() as IdiomaFuncion),
    }),
  );

  /** "3D subtitulada": para decir qué combinación no tiene funciones */
  protected readonly versionFiltrada = computed(() =>
    [
      this.formato() === TODAS ? '' : this.formato(),
      this.idioma() === TODAS ? '' : textoDeIdioma(this.idioma() as IdiomaFuncion).toLowerCase(),
    ]
      .filter(Boolean)
      .join(' '),
  );

  protected readonly dias = computed(() => diasConFunciones(this.visibles()));

  /** "Hoy 28/9", "Mañana 29/9", "Mié 1/10": los chips no muestran el ISO tal cual (RNF-08) */
  protected readonly opcionesDeDia = computed<readonly OpcionChip[]>(() =>
    this.dias().map((iso) => ({ valor: iso, etiqueta: this.etiquetaDeDia(iso) })),
  );

  /** La del usuario si sigue siendo válida; si no, el primer día con función */
  protected readonly fecha = computed(() => {
    const dias = this.dias();
    return dias.includes(this.fechaTocada()) ? this.fechaTocada() : (dias[0] ?? '');
  });

  protected readonly horas = computed(() => horasDelDia(this.visibles(), this.fecha()));

  protected readonly opcionesDeHora = computed<readonly OpcionChip[]>(() =>
    this.horas().map((hora) => ({ valor: hora, etiqueta: hora })),
  );

  /** Con un solo horario en el día no hay nada que elegir: queda elegido */
  protected readonly hora = computed(() => {
    const horas = this.horas();
    return horas.includes(this.horaTocada())
      ? this.horaTocada()
      : horas.length === 1
        ? horas[0]
        : '';
  });

  private readonly candidatas = computed(() =>
    this.hora() ? funcionesEnHora(this.visibles(), this.fecha(), this.hora()) : [],
  );

  protected readonly opcionesDeVersion = computed<readonly OpcionSeleccion[]>(() =>
    this.candidatas().map((f) => ({ valor: f.id, texto: describirVersion(f) })),
  );

  /** La función a comprar, cuando el día, el horario y la versión están decididos */
  protected readonly elegida = computed(() => {
    const candidatas = this.candidatas();

    if (candidatas.length === 1) {
      return candidatas[0];
    }

    return candidatas.find((f) => f.id === this.versionTocada()) ?? null;
  });

  protected readonly descripcion = computed(() => {
    const f = this.elegida();
    return f ? `${describirInicio(f.inicio)} · ${describirVersion(f)}` : '';
  });

  constructor() {
    effect(() => {
      const id = this.peliculaId();
      untracked(() => void this.cargar(id));
    });
  }

  protected elegirFormato(formato: string): void {
    this.formatoTocado.set(formato);
    this.versionTocada.set('');
  }

  protected elegirIdioma(idioma: string): void {
    this.idiomaTocado.set(idioma);
    this.versionTocada.set('');
  }

  protected quitarFiltros(): void {
    this.formatoTocado.set(TODAS);
    this.idiomaTocado.set(TODAS);
  }

  protected elegirFecha(fecha: string): void {
    this.fechaTocada.set(fecha);
  }

  protected elegirHora(hora: string): void {
    this.horaTocada.set(hora);
    this.versionTocada.set('');
  }

  protected elegirVersion(id: string): void {
    this.versionTocada.set(id);
  }

  /** "Hoy 28/9", "Mañana 29/9", o el día de la semana abreviado para el resto ("Mié 1/10") */
  private etiquetaDeDia(iso: string): string {
    const hoy = hoyIso();
    const diaYMes = this.diaYMes(iso);

    if (iso === hoy) {
      return `Hoy ${diaYMes}`;
    }
    if (iso === sumarDias(hoy, 1)) {
      return `Mañana ${diaYMes}`;
    }

    const numeroDeDia = diaDeLaSemana(iso);
    const corto = numeroDeDia !== null ? DIAS_DE_LA_SEMANA[numeroDeDia - 1].corto : '';
    return `${corto} ${diaYMes}`;
  }

  private diaYMes(iso: string): string {
    const [, mes, dia] = iso.split('-');
    return `${Number(dia)}/${Number(mes)}`;
  }

  private async cargar(peliculaId: string): Promise<void> {
    this.cargando.set(true);
    this.fechaTocada.set('');
    this.horaTocada.set('');
    this.versionTocada.set('');
    this.quitarFiltros();

    const funciones = await this.servicio.cargarProgramacion(peliculaId);

    // Si mientras tanto se cambió de película, esta respuesta ya no corresponde
    if (peliculaId !== this.peliculaId()) {
      return;
    }

    this.funciones.set(funciones);
    this.cargando.set(false);
  }
}
