import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { formatearPrecio } from '../../core/formato/precio';
import {
  DIAS_DE_LA_SEMANA,
  describirInicio,
  fechaLocal,
  fechasDeProgramacion,
  finDeOcupacion,
  horaLocal,
  instanteDeFuncion,
} from '../../core/funciones/programacion';
import { Pelicula } from '../../core/models/pelicula';
import {
  ConflictoDeSala,
  FORMATOS_DE_FUNCION,
  FormatoFuncion,
  Funcion,
  IDIOMAS_DE_FUNCION,
  IdiomaFuncion,
  ResultadoProgramacion,
} from '../../core/models/sala';
import { Catalogo } from '../../core/services/catalogo';
import { Funciones } from '../../core/services/funciones';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Chip } from '../../shared/chip/chip';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { formatearLargo, hoyIso } from '../../shared/selector-fecha/fechas';
import { SelectorFecha } from '../../shared/selector-fecha/selector-fecha';
import { SelectorHora } from '../../shared/selector-hora/selector-hora';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { Spinner } from '../../shared/spinner/spinner';

/** El mismo tope que aplica la base: una programación más grande se rechaza allá */
const MAXIMO_DE_FUNCIONES_POR_ALTA = 200;

/** Convierte lo que se escribió en el campo de precio. NaN si no es un número */
function leerPrecio(texto: string): number {
  const limpio = texto.trim().replace(',', '.');
  return limpio === '' ? Number.NaN : Number(limpio);
}

/** Cada idioma con su texto, en el orden en que los muestra el selector */
const TEXTO_DE_IDIOMA: Record<IdiomaFuncion, string> = {
  castellano: 'Castellano',
  subtitulada: 'Subtitulada',
};

/**
 * Programación de funciones (RF-19 a RF-23). El administrador indica película, días y horario
 * (RF-20); la sala NO se elige: la asigna la base (RF-21) y esta pantalla solo la muestra.
 *
 * Todo el cálculo pesado vive en la base, atómico. Acá se valida para dar un mensaje claro
 * antes de ir a la red, y se muestra lo que la base resolvió: qué sala tocó a cada función, o,
 * si no había sala libre para alguna fecha, cuál fue y a qué horarios cercanos sí (D-05).
 */
@Component({
  imports: [Boton, Campo, Chip, Dialogo, Mensaje, Seleccion, SelectorFecha, SelectorHora, Spinner],
  selector: 'app-admin-funciones',
  styleUrl: './admin-funciones.css',
  templateUrl: './admin-funciones.html',
})
export class AdminFunciones {
  private readonly catalogo = inject(Catalogo);
  private readonly servicio = inject(Funciones);
  /** afterNextRender se llama desde un manejador de eventos, fuera del contexto de inyección */
  private readonly inyector = inject(Injector);

  private readonly resultadoDelAlta = viewChild<ElementRef<HTMLElement>>('resultadoDelAlta');

  protected readonly hoy = hoyIso();
  protected readonly diasDeLaSemana = DIAS_DE_LA_SEMANA;
  protected readonly opcionesFormato: readonly OpcionSeleccion[] = FORMATOS_DE_FUNCION.map((f) => ({
    valor: f,
    texto: f,
  }));
  protected readonly opcionesIdioma: readonly OpcionSeleccion[] = IDIOMAS_DE_FUNCION.map((i) => ({
    valor: i,
    texto: TEXTO_DE_IDIOMA[i],
  }));

  // ── Lo que hay cargado ──
  protected readonly peliculas = signal<Pelicula[] | null>(null);
  protected readonly programacion = signal<Funcion[] | null>(null);
  protected readonly cargando = signal(true);
  protected readonly filtroPelicula = signal('');
  protected readonly avisoGeneral = signal('');

  protected readonly opcionesPelicula = computed<OpcionSeleccion[]>(() =>
    (this.peliculas() ?? []).map((p) => ({
      valor: p.id,
      texto: `${p.titulo} · ${p.duracion_minutos} min`,
    })),
  );

  // ── Formulario de alta ──
  protected readonly peliculaId = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly diasElegidos = signal<readonly number[]>([]);
  protected readonly hora = signal('');
  protected readonly formato = signal<string>('2D');
  protected readonly idioma = signal<string>('castellano');
  protected readonly precio = signal('');

  protected readonly intentoHecho = signal(false);
  protected readonly enviando = signal(false);
  protected readonly resultado = signal<ResultadoProgramacion | null>(null);
  protected readonly avisoDeSugerencia = signal('');

  private readonly peliculaElegida = computed(
    () => this.peliculas()?.find((p) => p.id === this.peliculaId()) ?? null,
  );

  /** Las fechas en las que caería la programación, para decir cuántas funciones son antes de enviar */
  protected readonly fechas = computed(() =>
    fechasDeProgramacion(this.desde(), this.hasta(), this.diasElegidos()),
  );

  /** Hasta qué hora ocupa cada función la sala: película más los 30 minutos de separación (RN-01) */
  protected readonly finDeOcupacion = computed(() => {
    const pelicula = this.peliculaElegida();
    return pelicula ? finDeOcupacion(this.hora(), pelicula.duracion_minutos) : null;
  });

  protected readonly errorPelicula = computed(() =>
    this.intentoHecho() && !this.peliculaId() ? 'Elegí la película.' : '',
  );

  protected readonly errorDesde = computed(() =>
    this.intentoHecho() && !this.desde() ? 'Elegí desde qué día.' : '',
  );

  protected readonly errorHasta = computed(() => {
    if (!this.intentoHecho()) return '';
    if (!this.hasta()) return 'Elegí hasta qué día.';
    if (this.desde() && this.hasta() < this.desde()) {
      return 'La fecha final no puede ser anterior a la inicial.';
    }
    return '';
  });

  protected readonly errorDias = computed(() => {
    if (!this.intentoHecho()) return '';
    if (this.diasElegidos().length === 0) return 'Elegí al menos un día de la semana.';
    if (this.desde() && this.hasta() && !this.errorHasta() && this.fechas().length === 0) {
      return 'Ninguna fecha del período cae en esos días.';
    }
    if (this.fechas().length > MAXIMO_DE_FUNCIONES_POR_ALTA) {
      return `Son más de ${MAXIMO_DE_FUNCIONES_POR_ALTA} funciones de una sola vez: achicá el período.`;
    }
    return '';
  });

  protected readonly errorHora = computed(() =>
    this.intentoHecho() && !this.hora() ? 'Elegí el horario.' : '',
  );

  protected readonly errorPrecio = computed(() => {
    if (!this.intentoHecho()) return '';
    const importe = leerPrecio(this.precio());
    if (Number.isNaN(importe)) return 'Escribí el precio base.';
    if (importe < 0) return 'El precio no puede ser negativo.';
    return '';
  });

  protected readonly hayErrores = computed(
    () =>
      !!(
        this.errorPelicula() ||
        this.errorDesde() ||
        this.errorHasta() ||
        this.errorDias() ||
        this.errorHora() ||
        this.errorPrecio()
      ),
  );

  /** Cómo se agrupa lo creado: "Sala 1 · 4 funciones". La base reparte, y esto lo muestra */
  protected readonly creadasPorSala = computed(() => {
    const resultado = this.resultado();

    if (resultado?.estado !== 'creadas') {
      return [];
    }

    const cuentas = new Map<string, number>();
    for (const creada of resultado.creadas) {
      cuentas.set(creada.sala, (cuentas.get(creada.sala) ?? 0) + 1);
    }

    return [...cuentas.entries()].map(([sala, cantidad]) => ({ sala, cantidad }));
  });

  // ── Edición y baja ──
  protected readonly enEdicion = signal<Funcion | null>(null);
  protected readonly edicionAbierta = signal(false);
  protected readonly edFecha = signal('');
  protected readonly edHora = signal('');
  protected readonly edFormato = signal<string>('2D');
  protected readonly edIdioma = signal<string>('castellano');
  protected readonly edPrecio = signal('');
  protected readonly edGuardando = signal(false);
  protected readonly edError = signal('');
  protected readonly edConflictos = signal<ConflictoDeSala[]>([]);

  protected readonly edErrorPrecio = computed(() => {
    const importe = leerPrecio(this.edPrecio());
    if (Number.isNaN(importe)) return 'Escribí el precio base.';
    if (importe < 0) return 'El precio no puede ser negativo.';
    return '';
  });

  protected readonly aDarDeBaja = signal<Funcion | null>(null);
  protected readonly bajaAbierta = signal(false);
  protected readonly bajando = signal(false);
  protected readonly errorDeBaja = signal('');

  constructor() {
    void this.cargarPeliculas();

    // Al cambiar el filtro se vuelve a pedir la agenda. untracked: recargar lee y escribe muchas
    // señales, y no tienen que volver a disparar el efecto.
    effect(() => {
      const filtro = this.filtroPelicula();
      untracked(() => void this.recargar(filtro));
    });
  }

  // Los textos que se muestran en la lista y en los diálogos
  protected describir(iso: string): string {
    return describirInicio(iso);
  }

  protected precioDe(funcion: Funcion): string {
    return formatearPrecio(funcion.precio_base);
  }

  protected idiomaDe(funcion: Funcion): string {
    return TEXTO_DE_IDIOMA[funcion.idioma];
  }

  protected fechaLarga(iso: string): string {
    return formatearLargo(iso);
  }

  /** "18:45" de un instante ISO, en la hora del cine: lo que dicen los horarios sugeridos */
  protected horaDe(iso: string): string {
    return horaLocal(iso);
  }

  protected diaElegido(numero: number): boolean {
    return this.diasElegidos().includes(numero);
  }

  protected alternarDia(numero: number, activo: boolean): void {
    this.diasElegidos.update((dias) =>
      activo ? [...dias, numero].sort((a, b) => a - b) : dias.filter((d) => d !== numero),
    );
  }

  /**
   * Aplica un horario sugerido (D-05). Cambia la hora de toda la programación, no solo de la
   * fecha que chocó: el alta es una sola. Puede que otra fecha choque con la nueva hora, y en
   * ese caso la base lo vuelve a informar.
   */
  protected usarSugerencia(iso: string): void {
    const nueva = horaLocal(iso);

    this.hora.set(nueva);
    this.resultado.set(null);
    this.avisoDeSugerencia.set(`Cambiamos el horario a las ${nueva}. Revisá y volvé a programar.`);
  }

  protected async programar(evento: Event): Promise<void> {
    evento.preventDefault();
    this.intentoHecho.set(true);
    this.avisoDeSugerencia.set('');
    this.avisoGeneral.set('');

    if (this.hayErrores()) {
      return;
    }

    this.enviando.set(true);
    const resultado = await this.servicio.crear({
      peliculaId: this.peliculaId(),
      desde: this.desde(),
      hasta: this.hasta(),
      dias: this.diasElegidos(),
      hora: this.hora(),
      formato: this.formato() as FormatoFuncion,
      idioma: this.idioma() as IdiomaFuncion,
      precioBase: leerPrecio(this.precio()),
    });
    this.enviando.set(false);

    this.resultado.set(resultado);

    // El resultado se dibuja recién en este ciclo, y quien mira el formulario puede tenerlo
    // fuera de pantalla: el foco va al resultado, que es lo que pasa a importar (WCAG 3.3.1).
    afterNextRender(() => this.resultadoDelAlta()?.nativeElement.focus(), {
      injector: this.inyector,
    });

    if (resultado.estado === 'creadas') {
      await this.recargar(this.filtroPelicula());
    }
  }

  protected abrirEdicion(funcion: Funcion): void {
    this.enEdicion.set(funcion);
    this.edFecha.set(fechaLocal(funcion.inicio));
    this.edHora.set(horaLocal(funcion.inicio));
    this.edFormato.set(funcion.formato);
    this.edIdioma.set(funcion.idioma);
    this.edPrecio.set(String(funcion.precio_base));
    this.edError.set('');
    this.edConflictos.set([]);
    this.avisoGeneral.set('');
    this.edicionAbierta.set(true);
  }

  protected usarSugerenciaEnEdicion(iso: string): void {
    this.edFecha.set(fechaLocal(iso));
    this.edHora.set(horaLocal(iso));
    this.edConflictos.set([]);
  }

  protected async guardarEdicion(): Promise<void> {
    const funcion = this.enEdicion();

    if (!funcion || this.edGuardando()) {
      return;
    }

    if (!this.edFecha() || !this.edHora()) {
      this.edError.set('Elegí la fecha y el horario.');
      return;
    }

    if (this.edErrorPrecio()) {
      this.edError.set(this.edErrorPrecio());
      return;
    }

    this.edGuardando.set(true);
    this.edError.set('');
    this.edConflictos.set([]);

    const resultado = await this.servicio.modificar(funcion.id, {
      inicio: instanteDeFuncion(this.edFecha(), this.edHora()),
      formato: this.edFormato() as FormatoFuncion,
      idioma: this.edIdioma() as IdiomaFuncion,
      precioBase: leerPrecio(this.edPrecio()),
    });

    this.edGuardando.set(false);

    switch (resultado.estado) {
      case 'modificada':
        this.edicionAbierta.set(false);
        this.avisoGeneral.set(`Guardamos los cambios. La función quedó en la ${resultado.sala}.`);
        await this.recargar(this.filtroPelicula());
        break;
      case 'sin_sala':
        this.edConflictos.set(resultado.conflictos);
        break;
      default:
        this.edError.set(resultado.mensaje);
    }
  }

  protected pedirBaja(funcion: Funcion): void {
    this.aDarDeBaja.set(funcion);
    this.errorDeBaja.set('');
    this.avisoGeneral.set('');
    this.bajaAbierta.set(true);
  }

  protected async confirmarBaja(): Promise<void> {
    const funcion = this.aDarDeBaja();

    if (!funcion || this.bajando()) {
      return;
    }

    this.bajando.set(true);
    const error = await this.servicio.darDeBaja(funcion.id);
    this.bajando.set(false);

    if (error) {
      // El diálogo queda abierto con el motivo: con entradas vendidas la base la rechaza
      this.errorDeBaja.set(error);
      return;
    }

    this.bajaAbierta.set(false);
    this.avisoGeneral.set(
      `Dimos de baja la función de ${funcion.pelicula.titulo} del ${this.describir(funcion.inicio)}. La ${funcion.sala.nombre} quedó libre en ese horario.`,
    );
    await this.recargar(this.filtroPelicula());
  }

  private async cargarPeliculas(): Promise<void> {
    this.peliculas.set(await this.catalogo.cargarTodas());
  }

  private async recargar(filtro: string): Promise<void> {
    this.cargando.set(true);
    const funciones = await this.servicio.cargarProgramacion(filtro || null);

    // Si mientras tanto se cambió el filtro, esta respuesta ya no es la que se quiere ver
    if (filtro !== this.filtroPelicula()) {
      return;
    }

    this.programacion.set(funciones);
    this.cargando.set(false);
  }
}
