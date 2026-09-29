import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  describirVersion,
  diasConFunciones,
  funcionesEnHora,
  horasDelDia,
} from '../../core/compra/agrupar-funciones';
import {
  DIAS_DE_LA_SEMANA,
  describirInicio,
  diaDeLaSemana,
} from '../../core/funciones/programacion';
import { Funcion } from '../../core/models/sala';
import { Funciones } from '../../core/services/funciones';
import { ChipsOpcion, OpcionChip } from '../../shared/chips-opcion/chips-opcion';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { hoyIso, sumarDias } from '../../shared/selector-fecha/fechas';
import { Spinner } from '../../shared/spinner/spinner';

/**
 * Elegir día y horario de una película para ir a comprar (RF-24, RNF-08).
 *
 * Usa el selector propio de fecha, con solo los días que tienen función, y el de hora, con solo
 * los horarios de ese día: no hay nada que scrollear ni una combinación imposible para elegir.
 * Si dos funciones caen a la misma hora (salas distintas), se distinguen por formato e idioma,
 * que es lo que el espectador decide; la sala la asigna el cine (RF-21) y se ve en la compra.
 */
@Component({
  imports: [ChipsOpcion, Mensaje, RouterLink, Seleccion, Spinner],
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

  protected readonly dias = computed(() => diasConFunciones(this.funciones() ?? []));

  /** "Hoy 28/9", "Mañana 29/9", "Mié 1/10": los chips no muestran el ISO tal cual (RNF-08) */
  protected readonly opcionesDeDia = computed<readonly OpcionChip[]>(() =>
    this.dias().map((iso) => ({ valor: iso, etiqueta: this.etiquetaDeDia(iso) })),
  );

  /** La del usuario si sigue siendo válida; si no, el primer día con función */
  protected readonly fecha = computed(() => {
    const dias = this.dias();
    return dias.includes(this.fechaTocada()) ? this.fechaTocada() : (dias[0] ?? '');
  });

  protected readonly horas = computed(() => horasDelDia(this.funciones() ?? [], this.fecha()));

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
    this.hora() ? funcionesEnHora(this.funciones() ?? [], this.fecha(), this.hora()) : [],
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

    const funciones = await this.servicio.cargarProgramacion(peliculaId);

    // Si mientras tanto se cambió de película, esta respuesta ya no corresponde
    if (peliculaId !== this.peliculaId()) {
      return;
    }

    this.funciones.set(funciones);
    this.cargando.set(false);
  }
}
