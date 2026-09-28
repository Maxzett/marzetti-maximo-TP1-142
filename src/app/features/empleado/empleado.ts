import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { describirCandy, listarButacas } from '../../core/entrada/entrada';
import { describirInicio, horaLocal } from '../../core/funciones/programacion';
import { OrdenParaPersonal, Tramo, UsoDeTramo } from '../../core/models/validacion';
import { Validacion } from '../../core/services/validacion';
import { describirUso, esCodigoValido, normalizarCodigo } from '../../core/validacion/codigo';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Mensaje, TonoMensaje } from '../../shared/mensaje/mensaje';
import { Spinner } from '../../shared/spinner/spinner';
import { Tarjeta } from '../../shared/tarjeta/tarjeta';
import { Escaner } from './escaner/escaner';

/** Un tramo como lo muestra la pantalla: qué es, qué botón lleva y si ya se usó */
interface TramoEnPantalla {
  tramo: Tramo;
  titulo: string;
  accion: string;
  /** null si la compra no tiene este tramo (una orden sin candy, D-03) */
  uso: UsoDeTramo | null;
}

/**
 * Panel del empleado (RF-51 a RF-55): leer la entrada con la cámara o tipear el código, ver qué
 * compró y consumir el tramo que corresponde, el ingreso a la sala o el retiro del candy.
 *
 * Primero se consulta y después se valida, en dos pasos, por dos razones: el mismo QR sirve
 * para los dos tramos (D-03), así que quien escanea tiene que decir cuál está consumiendo; y el
 * empleado ve película, horario, butacas y restricción de edad antes de dejar pasar a nadie.
 *
 * Lo que decide si una entrada vale lo decide la base (validar_tramo, migración 0023). Esta
 * pantalla solo oculta los botones que la base rechazaría, para no invitar a un error.
 */
@Component({
  imports: [Boton, Campo, Escaner, Mensaje, Spinner, Tarjeta],
  selector: 'app-empleado',
  styleUrl: './empleado.css',
  templateUrl: './empleado.html',
})
export class Empleado {
  private readonly validacion = inject(Validacion);
  private readonly injector = inject(Injector);
  private readonly tituloDelResultado = viewChild<ElementRef<HTMLElement>>('tituloDelResultado');

  protected readonly codigo = signal('');
  protected readonly errorDeCodigo = signal('');
  protected readonly consultando = signal(false);
  protected readonly orden = signal<OrdenParaPersonal | null>(null);
  protected readonly validando = signal<Tramo | null>(null);
  protected readonly aviso = signal<{ tono: TonoMensaje; texto: string } | null>(null);

  /** Para descartar la respuesta de una consulta que otra más nueva ya reemplazó */
  private consultaActual = 0;

  protected readonly datos = computed(() => {
    const orden = this.orden();

    if (!orden) {
      return [];
    }

    // RF-34.1: un ticket del candy bar no tiene función; lo que importa es qué retira y hasta cuándo
    if (orden.tipo === 'candy') {
      return [
        { rotulo: 'Candy bar', valor: describirCandy(orden.candy) },
        { rotulo: 'Válido hasta', valor: describirInicio(orden.ventana.hasta) },
      ];
    }

    return [
      {
        rotulo: 'Función',
        valor: `${orden.inicio ? describirInicio(orden.inicio) : ''} · ${orden.formato} · ${orden.idioma}`,
      },
      { rotulo: 'Sala', valor: orden.sala ?? '' },
      { rotulo: 'Butacas', valor: listarButacas(orden.butacas ?? []) },
      ...(orden.tiene_candy ? [{ rotulo: 'Candy bar', valor: describirCandy(orden.candy) }] : []),
    ];
  });

  /**
   * Por qué no se puede validar ningún tramo de esta orden, o vacío si se puede. Es lo mismo
   * que chequea la base, adelantado para no ofrecer un botón que va a ser rechazado.
   */
  protected readonly bloqueo = computed(() => {
    const orden = this.orden();

    if (!orden) {
      return '';
    }

    switch (orden.estado) {
      case 'cancelada':
        return 'Esta compra fue cancelada: la entrada ya no vale.';
      case 'pendiente':
        return 'Esta compra no se terminó de pagar.';
      case 'expirada':
        return 'Esta compra venció sin pagarse.';
    }

    if (orden.tipo === 'candy' && orden.ventana.estado === 'terminada') {
      return `El ticket venció el ${describirInicio(orden.ventana.hasta)}: servía por 7 días desde la compra.`;
    }

    switch (orden.ventana.estado) {
      case 'antes':
        return `Todavía es temprano: esta función se valida desde el ${describirInicio(orden.ventana.desde)}.`;
      case 'terminada':
        return `La función ya terminó (a las ${horaLocal(orden.ventana.hasta)}).`;
      default:
        return '';
    }
  });

  protected readonly tramos = computed<TramoEnPantalla[]>(() => {
    const orden = this.orden();

    if (!orden) {
      return [];
    }

    const candy: TramoEnPantalla = {
      tramo: 'candy',
      titulo: 'Candy bar',
      accion: 'Entregar candy',
      uso: orden.tramos.candy,
    };

    // Un ticket del candy bar no tiene tramo de ingreso: no se ofrece un botón que no aplica
    return orden.tipo === 'candy'
      ? [candy]
      : [
          {
            tramo: 'entrada',
            titulo: 'Ingreso a la sala',
            accion: 'Validar ingreso',
            uso: orden.tramos.entrada,
          },
          candy,
        ];
  });

  protected readonly describirUso = describirUso;

  /** Desde el formulario del código a mano (RF-53) */
  protected alEnviar(evento: Event): void {
    evento.preventDefault();

    const codigo = normalizarCodigo(this.codigo());

    if (!esCodigoValido(codigo)) {
      this.errorDeCodigo.set(
        'El código tiene 20 caracteres: números y letras de la A a la F. Está debajo del QR.',
      );
      return;
    }

    this.errorDeCodigo.set('');
    void this.buscar(codigo);
  }

  /** Desde la cámara (RF-51, RF-52) */
  protected alLeer(texto: string): void {
    // Mientras se valida no se reemplaza la orden en pantalla: el botón que se tocó es de esta
    if (this.validando()) {
      return;
    }

    const codigo = normalizarCodigo(texto);

    if (!esCodigoValido(codigo)) {
      this.orden.set(null);
      this.aviso.set({ tono: 'error', texto: 'Ese QR no es una entrada de Cine Emezeta.' });
      return;
    }

    void this.buscar(codigo);
  }

  protected async validar(tramo: Tramo): Promise<void> {
    const orden = this.orden();

    if (!orden || this.validando()) {
      return;
    }

    this.validando.set(tramo);
    const resultado = await this.validacion.validar(orden.codigo, tramo);
    this.validando.set(null);

    switch (resultado.estado) {
      case 'validada':
        this.marcarUso(tramo, resultado.uso);
        this.aviso.set({
          tono: 'exito',
          texto:
            tramo === 'entrada'
              ? `Ingreso validado. Butacas ${listarButacas(orden.butacas ?? [])}.`
              : `Candy entregado: ${describirCandy(orden.candy)}.`,
        });
        break;

      case 'rechazada':
        // RN-05: un tramo ya usado se rechaza diciendo cuándo y por quién
        if (resultado.uso) {
          this.marcarUso(tramo, resultado.uso);
        }
        this.aviso.set({
          tono: 'error',
          texto: resultado.uso
            ? `${resultado.mensaje} ${describirUso(resultado.uso)}`
            : resultado.mensaje,
        });
        break;

      default:
        this.aviso.set({ tono: 'error', texto: resultado.mensaje });
    }
  }

  /** Deja la pantalla lista para la siguiente persona de la fila */
  protected limpiar(): void {
    this.consultaActual++;
    this.orden.set(null);
    this.aviso.set(null);
    this.codigo.set('');
    this.errorDeCodigo.set('');
    this.consultando.set(false);
  }

  private async buscar(codigo: string): Promise<void> {
    const consulta = ++this.consultaActual;

    this.consultando.set(true);
    this.aviso.set(null);
    this.orden.set(null);

    const respuesta = await this.validacion.consultar(codigo);

    if (consulta !== this.consultaActual) {
      return;
    }

    this.consultando.set(false);

    if (respuesta.estado === 'error') {
      this.aviso.set({ tono: 'error', texto: respuesta.mensaje });
      return;
    }

    this.orden.set(respuesta.orden);
    this.codigo.set('');

    // El foco va al resultado: quien usa lector de pantalla escucha qué película es sin tener
    // que buscarla, y el Tab siguiente ya cae en el botón de validar.
    afterNextRender(() => this.tituloDelResultado()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  private marcarUso(tramo: Tramo, uso: UsoDeTramo): void {
    this.orden.update((orden) =>
      orden ? { ...orden, tramos: { ...orden.tramos, [tramo]: uso } } : orden,
    );
  }
}
