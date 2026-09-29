import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiaDeFacturacion } from '../../core/models/reportes';
import { hoyEnElCine, inicioDelPeriodo } from '../../core/reportes/periodos';
import { Reportes } from '../../core/services/reportes';
import { sumarDias } from '../../shared/selector-fecha/fechas';
import { AdminReportes } from './admin-reportes';

const DIAS: DiaDeFacturacion[] = [
  {
    dia: '2026-09-26',
    ordenes: 0,
    entradas: 0,
    cobrado: 0,
    credito: 0,
    descuentos: 0,
    canceladas: 0,
  },
  {
    dia: '2026-09-27',
    ordenes: 3,
    entradas: 4,
    cobrado: 26000,
    credito: 500,
    descuentos: 1300,
    canceladas: 1,
  },
];

interface Escenario {
  facturacion?: DiaDeFacturacion[] | null;
}

describe('AdminReportes', () => {
  let fixture: ComponentFixture<AdminReportes>;
  let servicio: {
    facturacion: ReturnType<typeof vi.fn>;
    productosMasVendidos: ReturnType<typeof vi.fn>;
    peliculasMasVistas: ReturnType<typeof vi.fn>;
  };

  async function estabilizar() {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function crear(escenario: Escenario = {}) {
    servicio = {
      facturacion: vi.fn(async () =>
        escenario.facturacion === undefined ? DIAS : escenario.facturacion,
      ),
      productosMasVendidos: vi.fn(async () => [
        { producto_id: 'p1', nombre: 'Pochoclo mediano', unidades: 7 },
        { producto_id: 'p2', nombre: 'Gaseosa 500 ml', unidades: 5 },
      ]),
      peliculasMasVistas: vi.fn(async () => [{ pelicula_id: 'x', titulo: 'Dune', entradas: 4 }]),
    };

    await TestBed.configureTestingModule({
      imports: [AdminReportes],
      providers: [{ provide: Reportes, useValue: servicio }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminReportes);
    await estabilizar();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const texto = () => (raiz().textContent ?? '').replace(/\s+/g, ' ');
  const boton = (contiene: string) =>
    Array.from(raiz().querySelectorAll('button')).find((b) => b.textContent?.includes(contiene));

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('arranca con los últimos 7 días, en la fecha del cine', async () => {
    await crear();
    const hoy = hoyEnElCine();

    expect(servicio.facturacion).toHaveBeenCalledWith(sumarDias(hoy, -6), hoy);
    expect(servicio.productosMasVendidos).toHaveBeenCalledWith(sumarDias(hoy, -6), hoy);
  });

  it('muestra un día por fila y el total al pie', async () => {
    await crear();
    const filas = raiz().querySelectorAll('tbody tr');
    const pie = raiz().querySelector('tfoot tr')?.textContent?.replace(/\s+/g, '');

    expect(filas).toHaveLength(2);
    // Un día sin ventas queda en la tabla: el cero también es un dato
    expect(filas[0].classList).toContain('sin-ventas');
    expect(pie).toContain('Total');
    expect(pie).toContain('26.000');
  });

  it('los totales del período van antes del detalle', async () => {
    await crear();
    const cifras = Array.from(raiz().querySelectorAll('.cifra')).map((c) =>
      c.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(cifras[1]).toMatch(/^Entradas vendidass*4$/);
    expect(cifras[3]).toMatch(/^Canceladass*1$/);
  });

  it('el candy más vendido encabeza el gráfico, con sus unidades', async () => {
    await crear();

    const primera = raiz().querySelector('app-grafico-barras li');
    expect(primera?.textContent).toContain('Pochoclo mediano');
    expect(primera?.textContent).toContain('7 unidades');
  });

  it('las películas arrancan por la semana actual', async () => {
    await crear();

    expect(servicio.peliculasMasVistas).toHaveBeenCalledWith(
      'semana',
      inicioDelPeriodo('semana', hoyEnElCine()),
    );
    expect(texto()).toContain('4 entradas');
  });

  it('pasar a "Mes" pide el mes actual; "Anterior" el mes previo', async () => {
    await crear();

    const mes = raiz().querySelector<HTMLInputElement>('input[value="mes"]')!;
    mes.checked = true;
    mes.dispatchEvent(new Event('change'));
    await estabilizar();

    const inicio = inicioDelPeriodo('mes', hoyEnElCine());
    expect(servicio.peliculasMasVistas).toHaveBeenLastCalledWith('mes', inicio);

    boton('Anterior')!.click();
    await estabilizar();

    const anterior = servicio.peliculasMasVistas.mock.lastCall![1] as string;
    expect(anterior < inicio).toBe(true);
    expect(anterior.endsWith('-01')).toBe(true);
    // Fuera del período actual aparece el atajo para volver
    expect(boton('Este mes')).toBeTruthy();
  });

  it('un rango invertido se avisa y no se consulta', async () => {
    await crear();
    servicio.facturacion.mockClear();

    const instancia = fixture.componentInstance as unknown as {
      desde: { set(v: string): void };
      hasta: { set(v: string): void };
    };
    instancia.desde.set('2026-09-27');
    instancia.hasta.set('2026-09-20');
    await estabilizar();

    expect(texto()).toContain('La fecha de inicio es posterior a la de fin.');
    expect(servicio.facturacion).not.toHaveBeenCalled();
  });

  it('si el reporte no carga lo dice, y no muestra un período en cero', async () => {
    await crear({ facturacion: null });

    expect(texto()).toContain('No pudimos cargar el reporte');
    expect(raiz().querySelector('table')).toBeNull();
  });

  it('ofrece la descarga en PDF y en Excel (RF-58)', async () => {
    await crear();

    expect(boton('Descargar PDF')).toBeTruthy();
    expect(boton('Descargar Excel')).toBeTruthy();
  });
});
