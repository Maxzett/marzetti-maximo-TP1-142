import {
  Component,
  ElementRef,
  Injector,
  WritableSignal,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
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
import { CampoFecha } from '../../shared/campo-fecha/campo-fecha';
import { CampoHora } from '../../shared/campo-hora/campo-hora';
import { Chip } from '../../shared/chip/chip';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { esIsoValida, formatearLargo, hoyIso } from '../../shared/selector-fecha/fechas';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { Spinner } from '../../shared/spinner/spinner';

/** El mismo tope que aplica la base a cada horario: una programación más grande se rechaza allá */
const MAXIMO_DE_FUNCIONES_POR_ALTA = 200;

/** El mismo tope de horarios por alta que aplica crear_funciones_lote() */
const MAXIMO_DE_PASADAS = 8;

/**
 * Un horario del formulario. Cada campo es su propia señal para poder enlazarlo con
 * `[(valor)]`, igual que los campos sueltos. La clave es para el `track` del `@for`: la hora no
 * sirve, se puede repetir o estar vacía mientras se escribe.
 */
interface PasadaEnEdicion {
  clave: number;
  hora: WritableSignal<string>;
  formato: WritableSignal<string>;
  idioma: WritableSignal<string>;
  precio: WritableSignal<string>;
}

let proximaClave = 0;

/** Una fila nueva: vacía, o con el formato, el idioma y el precio de la que se toma de modelo */
function nuevaPasada(modelo?: PasadaEnEdicion): PasadaEnEdicion {
  return {
    clave: proximaClave++,
    hora: signal(''),
    formato: signal(modelo?.formato() ?? '2D'),
    idioma: signal(modelo?.idioma() ?? 'castellano'),
    precio: signal(modelo?.precio() ?? ''),
  };
}

/** Filas de la agenda por tanda de "Ver más": unos días de programación, en una pantalla */
const FUNCIONES_POR_TANDA = 15;

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
 * Programación de funciones (RF-19 a RF-23). El administrador indica película, período, días y
 * uno o más horarios, cada uno con su formato, idioma y precio (RF-20): una semana de cartel real
 * son varias funciones por día en distintas copias. La sala NO se elige: la asigna la base
 * (RF-21) y esta pantalla solo la muestra.
 *
 * Todo el cálculo pesado vive en la base, atómico. Acá se valida para dar un mensaje claro
 * antes de ir a la red, y se muestra lo que la base resolvió: qué sala tocó a cada función, o,
 * si no había sala libre para alguna fecha, cuál fue y a qué horarios cercanos sí (D-05).
 */
@Component({
  imports: [Boton, Campo, CampoFecha, CampoHora, Chip, Dialogo, Mensaje, Seleccion, Spinner],
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

  /**
   * Cuántas filas de la agenda se ven. Con una programación de semanas la tabla pasaba los
   * 9000 px: se muestra una tanda y "Ver más" suma la siguiente. Las funciones ya están todas
   * cargadas (la agenda las necesita para el filtro), así que solo se recorta lo que se dibuja.
   * Cambiar de película vuelve a la primera tanda; editar o dar de baja no, para que la fila
   * que se estaba mirando no desaparezca de la vista.
   */
  protected readonly filasVisibles = linkedSignal({
    source: this.filtroPelicula,
    computation: () => FUNCIONES_POR_TANDA,
  });

  protected readonly agendaVisible = computed(
    () => this.programacion()?.slice(0, this.filasVisibles()) ?? [],
  );

  protected readonly hayMasFunciones = computed(
    () => (this.programacion()?.length ?? 0) > this.filasVisibles(),
  );

  private readonly cuentaDeAgenda = viewChild<ElementRef<HTMLElement>>('cuentaDeAgenda');

  protected verMasFunciones(): void {
    this.filasVisibles.update((n) => n + FUNCIONES_POR_TANDA);

    // Con la última tanda el botón desaparece: el foco pasa al contador y no se cae al <body>
    if (!this.hayMasFunciones()) {
      afterNextRender(() => this.cuentaDeAgenda()?.nativeElement.focus(), {
        injector: this.inyector,
      });
    }
  }

  // ── Lo que llega por la URL (withComponentInputBinding) ──
  /**
   * `?pelicula=…&desde=…&hasta=…`: el enlace "Programar funciones" de la pantalla de películas
   * llega con la película elegida y el período de su cartel ya puestos. Es un punto de partida:
   * el administrador lo puede cambiar.
   */
  readonly peliculaDeLaUrl = input('', { alias: 'pelicula' });
  readonly desdeDeLaUrl = input('', { alias: 'desde' });
  readonly hastaDeLaUrl = input('', { alias: 'hasta' });

  // ── Formulario de alta ──
  protected readonly peliculaId = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly diasElegidos = signal<readonly number[]>([]);
  /** Los horarios del alta, cada uno con su formato, idioma y precio. Siempre hay al menos uno */
  protected readonly pasadas = signal<readonly PasadaEnEdicion[]>([nuevaPasada()]);
  protected readonly maximoDePasadas = MAXIMO_DE_PASADAS;

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

  /** Fechas por horarios: lo que la base va a crear si hay sala para todo */
  protected readonly totalDeFunciones = computed(
    () => this.fechas().length * this.pasadas().length,
  );

  /** "funciones (12 días por 3 horarios)." — lo que sigue a la cifra en la vista previa */
  protected readonly detalleDelTotal = computed(() => {
    const dias = this.fechas().length;
    const horarios = this.pasadas().length;
    const sustantivo = this.totalDeFunciones() === 1 ? 'función' : 'funciones';

    return horarios > 1
      ? `${sustantivo} (${dias} ${dias === 1 ? 'día' : 'días'} por ${horarios} horarios).`
      : `${sustantivo}.`;
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
      return `Son más de ${MAXIMO_DE_FUNCIONES_POR_ALTA} funciones por horario: achicá el período.`;
    }
    return '';
  });

  /** Los errores de cada horario, en el mismo orden que `pasadas` */
  protected readonly erroresDePasadas = computed(() => {
    const pasadas = this.pasadas();

    return pasadas.map((pasada, indice) => {
      if (!this.intentoHecho()) {
        return { hora: '', precio: '' };
      }

      const hora = pasada.hora();
      const repetida = hora !== '' && pasadas.some((otra, i) => i < indice && otra.hora() === hora);
      const importe = leerPrecio(pasada.precio());

      return {
        hora: !hora ? 'Elegí el horario.' : repetida ? 'Ese horario ya está más arriba.' : '',
        precio: Number.isNaN(importe)
          ? 'Escribí el precio base.'
          : importe < 0
            ? 'El precio no puede ser negativo.'
            : '',
      };
    });
  });

  protected readonly hayErrores = computed(
    () =>
      !!(
        this.errorPelicula() ||
        this.errorDesde() ||
        this.errorHasta() ||
        this.errorDias() ||
        this.erroresDePasadas().some((error) => error.hora || error.precio)
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

    // Lo que trae la URL se copia al formulario y al filtro de la agenda, que así muestra lo que
    // ya tiene programado esa película. Solo se pisa lo que vino: un enlace sin período deja
    // las fechas como estaban.
    effect(() => {
      const pelicula = this.peliculaDeLaUrl();
      const desde = this.desdeDeLaUrl();
      const hasta = this.hastaDeLaUrl();

      untracked(() => {
        if (pelicula) {
          this.peliculaId.set(pelicula);
          this.filtroPelicula.set(pelicula);
        }
        if (esIsoValida(desde)) {
          // Un estreno que ya pasó no se puede programar: se empieza por hoy
          this.desde.set(desde < this.hoy ? this.hoy : desde);
        }
        if (esIsoValida(hasta)) {
          this.hasta.set(hasta);
        }
      });
    });

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

  /** Hasta qué hora ocupa la sala cada función de ese horario: película más 30 minutos (RN-01) */
  protected finDeOcupacionDe(
    pasada: PasadaEnEdicion,
  ): { hora: string; diaSiguiente: boolean } | null {
    const pelicula = this.peliculaElegida();
    return pelicula ? finDeOcupacion(pasada.hora(), pelicula.duracion_minutos) : null;
  }

  /**
   * Un horario más, con el formato, el idioma y el precio del último: lo habitual es cargar
   * varias copias iguales a distintas horas y cambiar solo alguna.
   */
  protected agregarPasada(): void {
    const ultima = this.pasadas().at(-1);
    this.pasadas.update((pasadas) => [...pasadas, nuevaPasada(ultima)]);
  }

  protected quitarPasada(clave: number): void {
    this.pasadas.update((pasadas) => pasadas.filter((pasada) => pasada.clave !== clave));
    this.resultado.set(null);
  }

  /** "18:20 · 3D subtitulada": cómo se nombra un horario en los conflictos */
  protected describirPasada(indice: number | undefined): string {
    const pasada = indice === undefined ? undefined : this.pasadas()[indice];

    if (!pasada) {
      return '';
    }

    return `${pasada.hora()} · ${pasada.formato()} ${TEXTO_DE_IDIOMA[pasada.idioma() as IdiomaFuncion].toLowerCase()}`;
  }

  /**
   * Aplica un horario sugerido (D-05) al horario que chocó. Cambia esa hora en todo el período,
   * no solo en la fecha del conflicto: cada horario del alta es uno solo. Puede que otra fecha
   * choque con la nueva hora, y en ese caso la base lo vuelve a informar.
   */
  protected usarSugerencia(conflicto: ConflictoDeSala, iso: string): void {
    const pasada = this.pasadas()[conflicto.pasada ?? 0];

    if (!pasada) {
      return;
    }

    const anterior = pasada.hora();
    const nueva = horaLocal(iso);

    pasada.hora.set(nueva);
    this.resultado.set(null);
    this.avisoDeSugerencia.set(
      `Cambiamos el horario de las ${anterior} a las ${nueva}. Revisá y volvé a programar.`,
    );
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
      pasadas: this.pasadas().map((pasada) => ({
        hora: pasada.hora(),
        formato: pasada.formato() as FormatoFuncion,
        idioma: pasada.idioma() as IdiomaFuncion,
        precioBase: leerPrecio(pasada.precio()),
      })),
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
