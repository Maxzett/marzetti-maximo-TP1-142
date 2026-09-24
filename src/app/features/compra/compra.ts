import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { describirEdad } from '../../core/catalogo/edad';
import { edadALaFecha, puedeComprar } from '../../core/compra/edad-compra';
import { aplicarEvento, primerVencimiento } from '../../core/compra/estado-butacas';
import { describirVersion } from '../../core/compra/agrupar-funciones';
import { formatearPrecio } from '../../core/formato/precio';
import { describirInicio, fechaLocal } from '../../core/funciones/programacion';
import {
  EstadoDeButaca,
  MEDIOS_DE_PAGO,
  MedioDePago,
  ResumenDeOrden,
} from '../../core/models/orden';
import { Pelicula } from '../../core/models/pelicula';
import { Butaca, Funcion } from '../../core/models/sala';
import { NOMBRE_DE_TIPO } from '../../core/salas/distribucion';
import { Auth } from '../../core/services/auth';
import { Catalogo } from '../../core/services/catalogo';
import { Compra as ServicioDeCompra } from '../../core/services/compra';
import { Funciones } from '../../core/services/funciones';
import { Salas } from '../../core/services/salas';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { MapaSala } from '../../shared/mapa-sala/mapa-sala';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { hoyIso } from '../../shared/selector-fecha/fechas';
import { SelectorFecha } from '../../shared/selector-fecha/selector-fecha';
import { Spinner } from '../../shared/spinner/spinner';
import { Tarjeta } from '../../shared/tarjeta/tarjeta';
import { Temporizador } from '../../shared/temporizador/temporizador';

type Paso = 'butacas' | 'datos' | 'pago';

/**
 * Compra de entradas de una función (RF-24 a RF-29): elegir butacas en el mapa, dejar el mail
 * (y la fecha de nacimiento si la película tiene restricción y no hay cuenta), revisar el
 * resumen y pagar. No exige cuenta (RF-26).
 *
 * Esta pantalla NO decide nada de lo que importa: cada reserva, la edad, el precio y el pago
 * los resuelven funciones de la base. Lo que hace acá es adelantar avisos (la edad, el aviso
 * VIP) para que nadie llegue al final para enterarse, y mostrar el mapa en tiempo real.
 */
@Component({
  imports: [
    Boton,
    Campo,
    MapaSala,
    Mensaje,
    RouterLink,
    Seleccion,
    SelectorFecha,
    Spinner,
    Tarjeta,
    Temporizador,
  ],
  selector: 'app-compra',
  styleUrl: './compra.css',
  templateUrl: './compra.html',
})
export class Compra {
  private readonly funciones = inject(Funciones);
  private readonly catalogo = inject(Catalogo);
  private readonly salas = inject(Salas);
  private readonly servicio = inject(ServicioDeCompra);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly titulo = inject(Title);
  private readonly destruccion = inject(DestroyRef);

  readonly funcionId = input.required<string>();

  protected readonly formatearPrecio = formatearPrecio;
  protected readonly nombres = NOMBRE_DE_TIPO;
  protected readonly mediosDePago: readonly OpcionSeleccion[] = MEDIOS_DE_PAGO.map((m) => ({
    valor: m.valor,
    texto: m.nombre,
  }));
  protected readonly hoy = hoyIso();
  protected readonly haySesion = this.auth.haySesion;

  protected readonly cargando = signal(true);
  protected readonly funcion = signal<Funcion | null>(null);
  protected readonly pelicula = signal<Pelicula | null>(null);
  protected readonly butacas = signal<Butaca[]>([]);
  protected readonly estados = signal<ReadonlyMap<string, EstadoDeButaca>>(new Map());
  private readonly vencimientos = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly paso = signal<Paso>('butacas');
  /** Mientras se reserva o se suelta una butaca: evita dos pedidos cruzados sobre el mismo mapa */
  protected readonly trabajando = signal(false);
  protected readonly avisoDelMapa = signal('');
  protected readonly avisoDeVencimiento = signal('');

  protected readonly email = signal('');
  protected readonly nacimiento = signal('');
  protected readonly errorDeDatos = signal('');
  protected readonly enviando = signal(false);

  protected readonly resumen = signal<ResumenDeOrden | null>(null);
  protected readonly medio = signal('');
  protected readonly errorDePago = signal('');
  protected readonly pagando = signal(false);

  private cerrarCanal: (() => void) | null = null;

  protected readonly restriccion = computed(() => this.pelicula()?.restriccion_edad ?? 0);
  protected readonly etiquetaDeEdad = computed(() => describirEdad(this.restriccion()));

  /** Sin cuenta no hay fecha de nacimiento registrada: se declara (D-02) */
  protected readonly debeDeclararEdad = computed(() => this.restriccion() > 0 && !this.haySesion());

  /** Las butacas elegidas por esta sesión, en orden de fila y número */
  protected readonly elegidas = computed(() => {
    const estados = this.estados();

    return this.butacas()
      .filter((b) => estados.get(b.id) === 'propia')
      .sort((a, b) => a.fila.localeCompare(b.fila) || a.numero - b.numero);
  });

  protected readonly hayVip = computed(() => this.elegidas().some((b) => b.tipo === 'vip'));

  /** El primero en vencer manda: cuando se cae una reserva, la orden entera deja de valer */
  protected readonly vencimiento = computed(() => {
    const orden = this.resumen()?.expira_at;
    return this.paso() === 'pago' && orden
      ? orden
      : primerVencimiento(this.vencimientos().values());
  });

  protected readonly cuando = computed(() => {
    const f = this.funcion();
    return f ? `${describirInicio(f.inicio)} · ${describirVersion(f)}` : '';
  });

  constructor() {
    effect(() => {
      const id = this.funcionId();
      untracked(() => void this.cargar(id));
    });

    this.destruccion.onDestroy(() => this.cerrarCanal?.());
  }

  // ── Paso 1: butacas ──────────────────────────────────────────────────────

  protected async alElegir(butaca: Butaca): Promise<void> {
    if (this.trabajando()) {
      return;
    }

    this.trabajando.set(true);
    this.avisoDelMapa.set('');
    this.avisoDeVencimiento.set('');
    const funcionId = this.funcionId();

    if (this.estados().get(butaca.id) === 'propia') {
      const error = await this.servicio.liberar(funcionId, butaca.id);

      if (error) {
        this.avisoDelMapa.set(error);
      } else {
        this.marcar(butaca.id, null);
      }
    } else {
      const resultado = await this.servicio.retener(funcionId, butaca.id);

      if (resultado.estado === 'reservada') {
        this.marcar(butaca.id, resultado.expiraAt ?? this.vencimientos().get(butaca.id) ?? '');
      } else {
        this.avisoDelMapa.set(resultado.mensaje);
        // Alguien más la tomó: se vuelve a pedir el estado real en vez de creer al mapa viejo
        await this.recargarEstados();
      }
    }

    this.trabajando.set(false);
  }

  protected continuar(): void {
    this.errorDeDatos.set('');
    this.paso.set('datos');
  }

  protected volverALasButacas(): void {
    this.paso.set('butacas');
    this.errorDePago.set('');
  }

  /** La reserva venció: la base ya liberó las butacas, así que se vuelve a leer el mapa */
  protected async alVencer(): Promise<void> {
    this.avisoDeVencimiento.set('Tu reserva venció y liberamos las butacas. Elegí de nuevo.');
    this.resumen.set(null);
    this.paso.set('butacas');
    await this.recargarEstados();
  }

  // ── Paso 2: datos ────────────────────────────────────────────────────────

  protected async enviarDatos(evento: Event): Promise<void> {
    evento.preventDefault();

    if (this.enviando()) {
      return;
    }

    const error = this.validarDatos();

    if (error) {
      this.errorDeDatos.set(error);
      return;
    }

    this.enviando.set(true);
    this.errorDeDatos.set('');

    const resultado = await this.servicio.crearOrden(
      this.funcionId(),
      this.email().trim(),
      this.debeDeclararEdad() ? this.nacimiento() : null,
    );

    if (resultado.estado === 'creada') {
      this.resumen.set(resultado.resumen);
      this.paso.set('pago');
    } else {
      this.errorDeDatos.set(resultado.mensaje);
    }

    this.enviando.set(false);
  }

  /**
   * Adelanta los errores que la base también devolvería, para no hacerte esperar una vuelta de
   * red por un mail sin arroba. La base los vuelve a validar: esto es comodidad, no control.
   */
  private validarDatos(): string {
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) {
      return 'Ingresá un email válido: ahí te mandamos la entrada.';
    }

    const funcion = this.funcion();

    if (this.restriccion() > 0 && funcion) {
      if (this.debeDeclararEdad() && !this.nacimiento()) {
        return 'Esta película tiene restricción de edad: declará tu fecha de nacimiento.';
      }

      const nacimiento = this.haySesion()
        ? (this.auth.perfil()?.fecha_nacimiento ?? null)
        : this.nacimiento();

      if (!puedeComprar(this.restriccion(), nacimiento, fechaLocal(funcion.inicio))) {
        const edad = nacimiento ? edadALaFecha(nacimiento, fechaLocal(funcion.inicio)) : null;
        return edad === null
          ? 'No pudimos verificar tu edad.'
          : `No podés comprar entradas para esta película: es para mayores de ${this.restriccion()} años.`;
      }
    }

    return '';
  }

  // ── Paso 3: pago ─────────────────────────────────────────────────────────

  protected async pagar(): Promise<void> {
    const resumen = this.resumen();

    if (!resumen || this.pagando()) {
      return;
    }

    if (!this.medio()) {
      this.errorDePago.set('Elegí un medio de pago.');
      return;
    }

    this.pagando.set(true);
    this.errorDePago.set('');

    const resultado = await this.servicio.confirmarPago(
      resumen.orden_id,
      this.medio() as MedioDePago,
    );

    if (resultado.estado === 'pagada') {
      await this.router.navigate(['/entrada', resultado.codigo]);
    } else if (resultado.estado === 'vencida') {
      this.avisoDeVencimiento.set(resultado.mensaje);
      this.resumen.set(null);
      this.paso.set('butacas');
      await this.recargarEstados();
    } else {
      this.errorDePago.set(resultado.mensaje);
    }

    this.pagando.set(false);
  }

  // ── Carga y tiempo real ──────────────────────────────────────────────────

  private async cargar(id: string): Promise<void> {
    this.cerrarCanal?.();
    this.cerrarCanal = null;
    this.cargando.set(true);
    this.funcion.set(null);
    this.resumen.set(null);
    this.paso.set('butacas');

    const funcion = await this.funciones.cargarUna(id);

    if (id !== this.funcionId()) {
      return;
    }

    if (funcion) {
      // El canal se abre ANTES de pedir el estado: un evento que llegue entre las dos cosas
      // no se pierde, y aplicarlo dos veces da el mismo resultado.
      this.cerrarCanal = this.servicio.escuchar(id, (evento) =>
        this.estados.update((estados) => aplicarEvento(estados, evento)),
      );

      const [pelicula, butacas] = await Promise.all([
        this.catalogo.cargarPelicula(funcion.pelicula_id),
        this.salas.cargarButacas(funcion.sala_id),
        this.recargarEstados(),
      ]);

      if (id !== this.funcionId()) {
        return;
      }

      this.pelicula.set(pelicula);
      this.butacas.set(butacas ?? []);
      this.email.set(this.auth.perfil()?.email ?? '');
      this.titulo.setTitle(`Comprar · ${funcion.pelicula.titulo} · Cine Emezeta`);
    }

    this.funcion.set(funcion);
    this.cargando.set(false);
  }

  private async recargarEstados(): Promise<void> {
    const mapa = await this.servicio.cargarEstados(this.funcionId());

    if (mapa) {
      this.estados.set(mapa.estados);
      this.vencimientos.set(mapa.vencimientos);
    }
  }

  /** Anota (o borra, con null) una reserva propia y su vencimiento, sin mutar los mapas */
  private marcar(butacaId: string, vencimiento: string | null): void {
    const estados = new Map(this.estados());
    const vencimientos = new Map(this.vencimientos());

    if (vencimiento === null) {
      estados.delete(butacaId);
      vencimientos.delete(butacaId);
    } else {
      estados.set(butacaId, 'propia');

      if (vencimiento) {
        vencimientos.set(butacaId, vencimiento);
      }
    }

    this.estados.set(estados);
    this.vencimientos.set(vencimientos);
  }
}
