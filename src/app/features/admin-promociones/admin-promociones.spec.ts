import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Promociones } from '../../core/models/gestion';
import { Gestion } from '../../core/services/gestion';
import { AdminPromociones } from './admin-promociones';

const DATOS: Promociones = {
  cupones: [
    {
      id: 'u1',
      codigo: 'BIENVENIDA',
      tipo: 'bienvenida',
      tipo_descuento: 'porcentaje',
      valor: 20,
      edad_minima: null,
      vigente_desde: null,
      vigente_hasta: null,
      activo: true,
    },
    {
      id: 'u2',
      codigo: 'PLATINO50',
      tipo: 'por_edad',
      tipo_descuento: 'porcentaje',
      valor: 25,
      edad_minima: 50,
      vigente_desde: '2026-09-01',
      vigente_hasta: '2026-12-31',
      activo: false,
    },
  ],
  recompensas: [
    {
      id: 'r1',
      nombre: 'Entrada gratis',
      tipo: 'entrada',
      producto_id: null,
      costo_puntos: 65000,
      activa: true,
    },
  ],
  configuracion: { recargo_vip: 2000, max_butacas_por_orden: 8, max_unidades_por_producto: 20 },
  productos: [{ id: 'p1', nombre: 'Pochoclo grande' }],
};

describe('AdminPromociones', () => {
  let fixture: ComponentFixture<AdminPromociones>;
  let servicio: Record<string, ReturnType<typeof vi.fn>>;

  async function estabilizar() {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function crear(errorConfiguracion: string | null = null) {
    servicio = {
      cargarPromociones: vi.fn(async () => DATOS),
      guardarCupon: vi.fn(async () => null),
      guardarRecompensa: vi.fn(async () => null),
      guardarConfiguracion: vi.fn(async () => errorConfiguracion),
    };

    // jsdom no implementa <dialog>.showModal(): se le da una versión mínima
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    await TestBed.configureTestingModule({
      imports: [AdminPromociones],
      providers: [{ provide: Gestion, useValue: servicio }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPromociones);
    await estabilizar();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const texto = () => (raiz().textContent ?? '').replace(/\s+/g, ' ');
  const instancia = () =>
    fixture.componentInstance as unknown as Record<string, WritableSignal<unknown>> & {
      abrirCupon(c: unknown): void;
      guardarCupon(): Promise<void>;
      abrirRecompensa(r: unknown): void;
      guardarRecompensa(): Promise<void>;
      cambiarValor(clave: string, valor: string): void;
      guardarConfiguracion(): Promise<void>;
    };

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('describe cada cupón: descuento, a quién aplica y vigencia', async () => {
    await crear();

    expect(texto()).toContain('20 % · primera compra de cada cuenta');
    expect(texto()).toContain('25 % · desde los 50 años');
    expect(texto()).toContain('Sin vencimiento');
    expect(texto()).toContain('Del 01/09/2026 al 31/12/2026');
  });

  it('las recompensas muestran el costo con separador de miles', async () => {
    await crear();

    expect(texto()).toContain('65.000 puntos');
  });

  it('el código del cupón se manda en mayúsculas', async () => {
    await crear();
    instancia().abrirCupon(null);
    instancia()['cupCodigo'].set('primavera');
    instancia()['cupValor'].set('10');

    await instancia().guardarCupon();

    expect(servicio['guardarCupon']).toHaveBeenCalledWith(
      expect.objectContaining({ id: null, codigo: 'PRIMAVERA', valor: 10, vigente_desde: null }),
    );
  });

  it('un porcentaje mayor a 100 no llega a la base', async () => {
    await crear();
    instancia().abrirCupon(null);
    instancia()['cupCodigo'].set('MUCHO');
    instancia()['cupValor'].set('150');

    await instancia().guardarCupon();
    await estabilizar();

    expect(servicio['guardarCupon']).not.toHaveBeenCalled();
    expect(texto()).toContain('no puede superar el 100 %');
  });

  it('un cupón por edad sin edad mínima se avisa', async () => {
    await crear();
    instancia().abrirCupon(null);
    instancia()['cupCodigo'].set('MAYORES');
    instancia()['cupTipo'].set('por_edad');
    instancia()['cupValor'].set('10');

    await instancia().guardarCupon();
    await estabilizar();

    expect(servicio['guardarCupon']).not.toHaveBeenCalled();
    expect(texto()).toContain('necesita la edad mínima');
  });

  it('una recompensa de producto exige elegir el producto', async () => {
    await crear();
    instancia().abrirRecompensa(null);
    instancia()['recNombre'].set('Pochoclo gratis');
    instancia()['recCosto'].set('65000');

    await instancia().guardarRecompensa();
    await estabilizar();

    expect(servicio['guardarRecompensa']).not.toHaveBeenCalled();
    expect(texto()).toContain('Elegí el producto');
  });

  it('la configuración guarda solo lo que cambió', async () => {
    await crear();
    instancia().cambiarValor('recargo_vip', '2500');

    await instancia().guardarConfiguracion();
    await estabilizar();

    expect(servicio['guardarConfiguracion']).toHaveBeenCalledOnce();
    expect(servicio['guardarConfiguracion']).toHaveBeenCalledWith('recargo_vip', 2500);
    expect(texto()).toContain('Guardamos la configuración');
  });

  it('sin cambios no llama a la base', async () => {
    await crear();

    await instancia().guardarConfiguracion();
    await estabilizar();

    expect(servicio['guardarConfiguracion']).not.toHaveBeenCalled();
    expect(texto()).toContain('No hay cambios para guardar');
  });

  it('si la base rechaza un valor, dice cuál', async () => {
    await crear('El valor va de 1 a 20');
    instancia().cambiarValor('max_butacas_por_orden', '40');

    await instancia().guardarConfiguracion();
    await estabilizar();

    expect(texto()).toContain('Butacas por compra: El valor va de 1 a 20');
  });
});
