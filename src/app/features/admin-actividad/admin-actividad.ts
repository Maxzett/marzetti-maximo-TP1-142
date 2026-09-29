import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
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
import { CampoFecha } from '../../shared/campo-fecha/campo-fecha';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
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
 * Se filtra por tipo de acción y por días, y se trae de a 20 desde la base: el log crece con cada
 * validación en la puerta, y traerlo entero sería cada vez más lento. "Ver más" suma la tanda
 * siguiente debajo de la que ya está, en vez de reemplazarla: se sigue leyendo hacia atrás sin
 * perder lo de arriba, y la pantalla no arranca con una tabla de varios miles de píxeles.
 */
@Component({
  imports: [Boton, CampoFecha, Mensaje, Seleccion, Spinner],
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

  protected readonly errorDeRango = computed(() =>
    this.desde() && this.hasta() && this.desde() > this.hasta()
      ? 'La fecha de inicio es posterior a la de fin.'
      : '',
  );

  protected readonly hayFiltros = computed(() => !!(this.accion() || this.desde() || this.hasta()));

  protected readonly cargando = signal(true);
  /** Todo lo traído hasta ahora con el filtro actual, y el total que hay en la base */
  protected readonly resultado = signal<PaginaDeActividad | null>(null);
  protected readonly error = signal(false);
  /** Falló una tanda de "Ver más": lo ya mostrado sigue valiendo, así que no se lo tapa */
  protected readonly errorAlVerMas = signal(false);

  protected readonly mostrados = computed(() => this.resultado()?.registros.length ?? 0);
  protected readonly hayMas = computed(() => this.mostrados() < (this.resultado()?.total ?? 0));

  protected readonly describirAccion = describirAccion;
  protected readonly describirActor = describirActor;
  protected readonly nombreDeAccion = nombreDeAccion;

  private consulta = 0;
  /** La última tanda traída con el filtro actual; cambiar el filtro vuelve a la 0 */
  private pagina = 0;

  /**
   * Con la última tanda el botón "Ver más" desaparece, y el foco se caería al <body>. En ese
   * caso se lleva al contador, que además dice cuántos registros quedaron a la vista. Mientras
   * haya más, el foco se queda en el botón, listo para la tanda siguiente.
   */
  private enfocarAlCargar = false;

  constructor() {
    // Solo el filtro dispara una carga desde cero; las tandas siguientes las pide verMas()
    effect(() => {
      const filtro = this.filtro();
      const valido = !this.errorDeRango();
      untracked(() => {
        if (valido) {
          void this.cargar(filtro, 0);
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

  protected verMas(): void {
    this.enfocarAlCargar = true;
    void this.cargar(this.filtro(), this.pagina + 1);
  }

  private async cargar(filtro: FiltroDeActividad, pagina: number): Promise<void> {
    const consulta = ++this.consulta;
    this.cargando.set(true);
    this.errorAlVerMas.set(false);

    const tanda = await this.reportes.actividad(filtro, pagina);

    if (consulta !== this.consulta) {
      return;
    }

    this.cargando.set(false);

    if (pagina === 0) {
      this.pagina = 0;
      this.resultado.set(tanda);
      this.error.set(tanda === null);
      return;
    }

    if (tanda === null) {
      // No se avanza de tanda: el próximo "Ver más" vuelve a pedir la misma
      this.errorAlVerMas.set(true);
      return;
    }

    this.pagina = pagina;

    // Se descartan los ya mostrados: si entró actividad nueva entre una tanda y otra, el
    // desplazamiento corre y el primero de esta tanda puede ser el último de la anterior
    const anteriores = this.resultado()?.registros ?? [];
    const vistos = new Set(anteriores.map((r) => r.id));
    this.resultado.set({
      registros: [...anteriores, ...tanda.registros.filter((r) => !vistos.has(r.id))],
      total: tanda.total,
    });

    if (this.enfocarAlCargar) {
      this.enfocarAlCargar = false;
      if (!this.hayMas()) {
        afterNextRender(() => this.cuenta()?.nativeElement.focus(), { injector: this.injector });
      }
    }
  }
}
