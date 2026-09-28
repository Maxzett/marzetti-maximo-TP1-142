import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { fechaLocal, horaLocal } from '../../core/funciones/programacion';
import {
  FiltroDeActividad,
  PaginaDeActividad,
  RegistroDeActividad,
} from '../../core/models/reportes';
import { fechaCorta } from '../../core/reportes/facturacion';
import {
  ACCIONES_DEL_LOG,
  describirAccion,
  describirActor,
  nombreDeAccion,
} from '../../core/reportes/log';
import { hoyEnElCine } from '../../core/reportes/periodos';
import { REGISTROS_POR_PAGINA, Reportes } from '../../core/services/reportes';
import { Boton } from '../../shared/boton/boton';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { SelectorFecha } from '../../shared/selector-fecha/selector-fecha';
import { Spinner } from '../../shared/spinner/spinner';

const ROLES: Record<string, string> = {
  admin: 'Administración',
  empleado: 'Personal',
  cliente: 'Cliente',
};

/**
 * Log de actividad (RF-61, RN-12): quién creó una función, quién cambió un precio, quién validó
 * un QR, con fecha y hora. Solo lectura: la tabla no tiene permiso de edición para nadie y los
 * triggers de 0011 impiden además editarla o borrarla aun desde una función de la base.
 *
 * Se filtra por tipo de acción y por días, y se pagina de a 50 en la base: el log crece con cada
 * validación en la puerta, y traerlo entero sería cada vez más lento.
 */
@Component({
  imports: [Boton, Mensaje, Seleccion, SelectorFecha, Spinner],
  selector: 'app-admin-actividad',
  styleUrls: ['../../layout/admin/pantalla-admin.css', './admin-actividad.css'],
  templateUrl: './admin-actividad.html',
})
export class AdminActividad {
  private readonly reportes = inject(Reportes);
  private readonly injector = inject(Injector);
  private readonly cuenta = viewChild<ElementRef<HTMLElement>>('cuenta');

  protected readonly hoy = hoyEnElCine();
  protected readonly opcionesDeAccion: OpcionSeleccion[] = ACCIONES_DEL_LOG.map((a) => ({
    valor: a.accion,
    texto: a.nombre,
  }));

  protected readonly accion = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');

  private readonly filtro = computed<FiltroDeActividad>(() => ({
    accion: this.accion(),
    desde: this.desde(),
    hasta: this.hasta(),
  }));

  /** Cambiar un filtro vuelve a la primera página: la página 3 de otro filtro puede no existir */
  protected readonly pagina = linkedSignal({ source: this.filtro, computation: () => 0 });

  protected readonly errorDeRango = computed(() =>
    this.desde() && this.hasta() && this.desde() > this.hasta()
      ? 'La fecha de inicio es posterior a la de fin.'
      : '',
  );

  protected readonly hayFiltros = computed(() => !!(this.accion() || this.desde() || this.hasta()));

  protected readonly cargando = signal(true);
  protected readonly resultado = signal<PaginaDeActividad | null>(null);
  protected readonly error = signal(false);

  protected readonly desdeFila = computed(() => this.pagina() * REGISTROS_POR_PAGINA + 1);
  protected readonly hastaFila = computed(() =>
    Math.min((this.pagina() + 1) * REGISTROS_POR_PAGINA, this.resultado()?.total ?? 0),
  );
  protected readonly hayAnterior = computed(() => this.pagina() > 0);
  protected readonly haySiguiente = computed(
    () => (this.pagina() + 1) * REGISTROS_POR_PAGINA < (this.resultado()?.total ?? 0),
  );

  protected readonly describirAccion = describirAccion;
  protected readonly describirActor = describirActor;
  protected readonly nombreDeAccion = nombreDeAccion;

  private consulta = 0;

  /**
   * Al pasar de página el botón que se tocó puede quedar deshabilitado (en la última no hay
   * "más antiguos") y el foco se caería al <body>. Se lleva al contador de registros, que además
   * le dice al lector de pantalla en qué página quedó.
   */
  private enfocarAlCargar = false;

  constructor() {
    effect(() => {
      const filtro = this.filtro();
      const pagina = this.pagina();
      const valido = !this.errorDeRango();
      untracked(() => {
        if (valido) {
          void this.cargar(filtro, pagina);
        }
      });
    });
  }

  /** "27/09/2026 14:32", en la hora del cine */
  protected cuando(registro: RegistroDeActividad): string {
    return `${fechaCorta(fechaLocal(registro.creado_at))} ${horaLocal(registro.creado_at)}`;
  }

  protected rolDe(registro: RegistroDeActividad): string {
    return registro.actor_rol ? (ROLES[registro.actor_rol] ?? registro.actor_rol) : '';
  }

  protected limpiar(): void {
    this.accion.set('');
    this.desde.set('');
    this.hasta.set('');
  }

  protected irA(pasos: number): void {
    this.enfocarAlCargar = true;
    this.pagina.update((p) => Math.max(0, p + pasos));
  }

  private async cargar(filtro: FiltroDeActividad, pagina: number): Promise<void> {
    const consulta = ++this.consulta;
    this.cargando.set(true);

    const resultado = await this.reportes.actividad(filtro, pagina);

    if (consulta !== this.consulta) {
      return;
    }

    this.resultado.set(resultado);
    this.error.set(resultado === null);
    this.cargando.set(false);

    if (this.enfocarAlCargar) {
      this.enfocarAlCargar = false;
      afterNextRender(() => this.cuenta()?.nativeElement.focus(), { injector: this.injector });
    }
  }
}
