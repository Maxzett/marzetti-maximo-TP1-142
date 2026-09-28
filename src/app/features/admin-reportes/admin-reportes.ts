import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DIAS_DE_LA_SEMANA, diaDeLaSemana } from '../../core/funciones/programacion';
import { formatearPrecio } from '../../core/formato/precio';
import {
  DiaDeFacturacion,
  PeliculaVista,
  Periodo,
  ProductoVendido,
} from '../../core/models/reportes';
import {
  COLUMNAS_DE_FACTURACION,
  describirRango,
  fechaCorta,
  nombreDelArchivo,
  totalesDeFacturacion,
} from '../../core/reportes/facturacion';
import {
  describirPeriodo,
  hoyEnElCine,
  inicioDelPeriodo,
  moverPeriodo,
} from '../../core/reportes/periodos';
import { Reportes } from '../../core/services/reportes';
import { Boton } from '../../shared/boton/boton';
import { DatoDeBarra, GraficoBarras } from '../../shared/grafico-barras/grafico-barras';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { SelectorFecha } from '../../shared/selector-fecha/selector-fecha';
import { sumarDias } from '../../shared/selector-fecha/fechas';
import { Spinner } from '../../shared/spinner/spinner';

/** El mismo tope que aplica la base: entre las dos fechas, como mucho 366 días */
const MAXIMO_DE_DIAS = 366;

/**
 * Reportes del panel (RF-57 a RF-60): facturación por día con su exportación, el producto del
 * candy más vendido y las películas más vistas por semana o por mes.
 *
 * Las cifras las calcula la base; esta pantalla elige el período, las muestra y las exporta.
 * El rango de fechas manda sobre la facturación y el candy, que se leen juntos. El gráfico de
 * películas tiene su propio período porque la pregunta es otra: qué se vio en una semana o un
 * mes, contado por la fecha de la función.
 */
@Component({
  imports: [Boton, GraficoBarras, Mensaje, SelectorFecha, Spinner],
  selector: 'app-admin-reportes',
  styleUrls: ['../../layout/admin/pantalla-admin.css', './admin-reportes.css'],
  templateUrl: './admin-reportes.html',
})
export class AdminReportes {
  private readonly reportes = inject(Reportes);

  protected readonly hoy = hoyEnElCine();
  protected readonly columnas = COLUMNAS_DE_FACTURACION;
  protected readonly precio = formatearPrecio;

  // ── Rango de la facturación y el candy: por defecto, los últimos 7 días ──
  protected readonly desde = signal(sumarDias(this.hoy, -6));
  protected readonly hasta = signal(this.hoy);

  protected readonly errorDeRango = computed(() => {
    const desde = this.desde();
    const hasta = this.hasta();

    if (!desde || !hasta) {
      return 'Elegí las dos fechas.';
    }
    if (desde > hasta) {
      return 'La fecha de inicio es posterior a la de fin.';
    }
    if (sumarDias(desde, MAXIMO_DE_DIAS) < hasta) {
      return 'El reporte abarca como máximo un año.';
    }
    return '';
  });

  protected readonly rango = computed(() => describirRango(this.desde(), this.hasta()));

  protected readonly cargandoVentas = signal(true);
  protected readonly facturacion = signal<DiaDeFacturacion[] | null>(null);
  protected readonly candy = signal<ProductoVendido[] | null>(null);
  protected readonly errorDeVentas = signal(false);

  protected readonly totales = computed(() => {
    const dias = this.facturacion();
    return dias ? totalesDeFacturacion(dias) : null;
  });

  protected readonly masVendido = computed(() => this.candy()?.[0] ?? null);

  protected readonly barrasDeCandy = computed<DatoDeBarra[]>(() =>
    (this.candy() ?? []).map((p) => ({ etiqueta: p.nombre, valor: p.unidades })),
  );

  protected readonly exportando = signal<'pdf' | 'excel' | null>(null);
  protected readonly errorDeExportacion = signal('');

  // ── Películas más vistas ──
  protected readonly periodo = signal<Periodo>('semana');
  protected readonly referencia = signal(inicioDelPeriodo('semana', this.hoy));
  protected readonly rotuloDelPeriodo = computed(() =>
    describirPeriodo(this.periodo(), this.referencia()),
  );
  protected readonly esElActual = computed(
    () => this.referencia() === inicioDelPeriodo(this.periodo(), this.hoy),
  );

  protected readonly cargandoPeliculas = signal(true);
  protected readonly peliculas = signal<PeliculaVista[] | null>(null);
  protected readonly barrasDePeliculas = computed<DatoDeBarra[]>(() =>
    (this.peliculas() ?? []).map((p) => ({ etiqueta: p.titulo, valor: p.entradas })),
  );

  /**
   * Cada consulta lleva un número: si el admin cambia el rango dos veces seguidas, la respuesta
   * vieja que llega tarde no pisa a la nueva.
   */
  private consultaDeVentas = 0;
  private consultaDePeliculas = 0;

  constructor() {
    effect(() => {
      const desde = this.desde();
      const hasta = this.hasta();
      const valido = !this.errorDeRango();
      untracked(() => {
        if (valido) {
          void this.cargarVentas(desde, hasta);
        }
      });
    });

    effect(() => {
      const periodo = this.periodo();
      const referencia = this.referencia();
      untracked(() => void this.cargarPeliculas(periodo, referencia));
    });
  }

  /** "lun 21/09": la columna del día, corta y con el día de la semana para leerla de un vistazo */
  protected describirDia(iso: string): string {
    const dia = diaDeLaSemana(iso);
    const corto = dia ? DIAS_DE_LA_SEMANA[dia - 1].corto.toLowerCase() : '';
    return `${corto} ${fechaCorta(iso).slice(0, 5)}`.trim();
  }

  protected valorDe(fila: DiaDeFacturacion | ReturnType<typeof totalesDeFacturacion>, i: number) {
    const columna = this.columnas[i];
    const valor = fila[columna.clave];
    return columna.dinero ? formatearPrecio(valor) : String(valor);
  }

  protected elegirPeriodo(periodo: Periodo): void {
    this.periodo.set(periodo);
    this.referencia.set(inicioDelPeriodo(periodo, this.hoy));
  }

  protected moverPeriodo(pasos: number): void {
    this.referencia.update((iso) => moverPeriodo(this.periodo(), iso, pasos));
  }

  protected volverAlActual(): void {
    this.referencia.set(inicioDelPeriodo(this.periodo(), this.hoy));
  }

  protected async exportar(formato: 'pdf' | 'excel'): Promise<void> {
    const dias = this.facturacion();

    if (!dias || this.exportando()) {
      return;
    }

    this.exportando.set(formato);
    this.errorDeExportacion.set('');

    try {
      // El módulo de exportación (y con él jsPDF o SheetJS) se descarga recién acá
      const exportar = await import('../../core/reportes/exportar');
      const desde = this.desde();
      const hasta = this.hasta();
      const archivo =
        formato === 'pdf'
          ? await exportar.generarPdfFacturacion(dias, desde, hasta)
          : await exportar.generarExcelFacturacion(dias, desde, hasta);

      exportar.descargarArchivo(
        archivo,
        `${nombreDelArchivo(desde, hasta)}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`,
      );
    } catch {
      this.errorDeExportacion.set(
        `No pudimos generar el ${formato === 'pdf' ? 'PDF' : 'Excel'}. Probá de nuevo.`,
      );
    }

    this.exportando.set(null);
  }

  private async cargarVentas(desde: string, hasta: string): Promise<void> {
    const consulta = ++this.consultaDeVentas;
    this.cargandoVentas.set(true);

    const [facturacion, candy] = await Promise.all([
      this.reportes.facturacion(desde, hasta),
      this.reportes.productosMasVendidos(desde, hasta),
    ]);

    if (consulta !== this.consultaDeVentas) {
      return;
    }

    this.facturacion.set(facturacion);
    this.candy.set(candy);
    this.errorDeVentas.set(facturacion === null || candy === null);
    this.cargandoVentas.set(false);
  }

  private async cargarPeliculas(periodo: Periodo, referencia: string): Promise<void> {
    const consulta = ++this.consultaDePeliculas;
    this.cargandoPeliculas.set(true);

    const peliculas = await this.reportes.peliculasMasVistas(periodo, referencia);

    if (consulta !== this.consultaDePeliculas) {
      return;
    }

    this.peliculas.set(peliculas);
    this.cargandoPeliculas.set(false);
  }
}
