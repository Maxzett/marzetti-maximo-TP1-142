import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CandyGestionado } from '../../core/models/gestion';
import { Gestion } from '../../core/services/gestion';
import { AdminCandy } from './admin-candy';

const CANDY: CandyGestionado = {
  categorias: [
    { id: 'c1', nombre: 'Pochoclos', orden: 1 },
    { id: 'c2', nombre: 'Bebidas', orden: 2 },
  ],
  productos: [
    {
      id: 'p1',
      categoria_id: 'c1',
      nombre: 'Pochoclo mediano',
      descripcion: 'Balde mediano',
      precio: 5000,
      activo: true,
    },
    {
      id: 'p2',
      categoria_id: 'c2',
      nombre: 'Gaseosa 500 ml',
      descripcion: '',
      precio: 2800,
      activo: true,
    },
    {
      id: 'p3',
      categoria_id: 'c2',
      nombre: 'Agua tónica',
      descripcion: '',
      precio: 2000,
      activo: false,
    },
  ],
  combos: [
    {
      id: 'k1',
      nombre: 'Combo Entrada',
      descripcion: '',
      precio: 9800,
      destacado: true,
      activo: true,
      combo_items: [
        { producto_id: 'p1', incluye_entrada: false, cantidad: 1 },
        { producto_id: null, incluye_entrada: true, cantidad: 1 },
      ],
    },
  ],
};

describe('AdminCandy', () => {
  let fixture: ComponentFixture<AdminCandy>;
  let servicio: Record<string, ReturnType<typeof vi.fn>>;

  async function estabilizar() {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function crear(error: string | null = null) {
    servicio = {
      cargarCandy: vi.fn(async () => CANDY),
      guardarCategoria: vi.fn(async () => error),
      guardarProducto: vi.fn(async () => error),
      guardarCombo: vi.fn(async () => error),
    };

    // jsdom no implementa <dialog>.showModal(): se le da una versión mínima
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    await TestBed.configureTestingModule({
      imports: [AdminCandy],
      providers: [{ provide: Gestion, useValue: servicio }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminCandy);
    await estabilizar();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const texto = () => (raiz().textContent ?? '').replace(/\s+/g, ' ');
  const instancia = () =>
    fixture.componentInstance as unknown as Record<string, WritableSignal<unknown>> & {
      abrirProducto(p: unknown): void;
      abrirCombo(c: unknown): void;
      guardarProducto(): Promise<void>;
      guardarCombo(): Promise<void>;
      agregarRenglon(): void;
      cambiarRenglon(i: number, cambio: object): void;
    };

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('lista productos con categoría, precio y estado escrito (RNF-10)', async () => {
    await crear();
    const filas = Array.from(raiz().querySelectorAll('section:first-of-type tbody tr')).map((f) =>
      f.textContent?.replace(/\s+/g, ' '),
    );

    expect(filas[0]).toContain('Pochoclo mediano');
    expect(filas[0]).toContain('Pochoclos');
    expect(filas[0]).toContain('A la venta');
    expect(filas[2]).toContain('De baja');
    expect(raiz().querySelector('.dado-de-baja')?.textContent).toContain('Agua tónica');
  });

  it('describe el contenido de cada combo, la entrada primero', async () => {
    await crear();

    expect(texto()).toContain('1 entrada · 1 × Pochoclo mediano');
  });

  it('un precio inválido no llega a la base', async () => {
    await crear();
    instancia().abrirProducto(null);
    instancia()['prodNombre'].set('Palito');
    instancia()['prodPrecio'].set('-5');

    await instancia().guardarProducto();
    await estabilizar();

    expect(servicio['guardarProducto']).not.toHaveBeenCalled();
    expect(texto()).toContain('El precio es un importe en pesos');
  });

  it('guarda un producto nuevo y avisa', async () => {
    await crear();
    instancia().abrirProducto(null);
    instancia()['prodNombre'].set('Palito');
    instancia()['prodPrecio'].set('1500,50');

    await instancia().guardarProducto();
    await estabilizar();

    expect(servicio['guardarProducto']).toHaveBeenCalledWith({
      id: null,
      categoria_id: 'c1',
      nombre: 'Palito',
      descripcion: '',
      precio: 1500.5,
      activo: true,
    });
    expect(instancia()['productoAbierto']()).toBe(false);
    expect(texto()).toContain('Guardamos Palito.');
  });

  it('si la base rechaza, el motivo queda en el diálogo abierto', async () => {
    await crear('El producto está en el combo "Combo Entrada": dalo de baja o cambialo primero');
    instancia().abrirProducto(CANDY.productos[0]);
    instancia()['prodActivo'].set(false);

    await instancia().guardarProducto();
    await estabilizar();

    expect(instancia()['productoAbierto']()).toBe(true);
    expect(texto()).toContain('El producto está en el combo');
  });

  it('el combo manda la entrada y los productos como renglones', async () => {
    await crear();
    instancia().abrirCombo(CANDY.combos[0]);
    instancia()['comboPrecio'].set('10500');

    await instancia().guardarCombo();

    expect(servicio['guardarCombo']).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'k1',
        precio: 10500,
        combo_items: [
          { producto_id: null, incluye_entrada: true, cantidad: 1 },
          { producto_id: 'p1', incluye_entrada: false, cantidad: 1 },
        ],
      }),
    );
  });

  it('un producto repetido en el combo se avisa antes de ir a la base', async () => {
    await crear();
    instancia().abrirCombo(CANDY.combos[0]);
    instancia().agregarRenglon();
    instancia().cambiarRenglon(1, { producto_id: 'p1' });

    await instancia().guardarCombo();
    await estabilizar();

    expect(servicio['guardarCombo']).not.toHaveBeenCalled();
    expect(texto()).toContain('Cada producto va una sola vez');
  });

  it('para armar un combo solo se ofrecen productos activos', async () => {
    await crear();
    instancia().abrirCombo(null);
    instancia().agregarRenglon();
    await estabilizar();

    const opciones = Array.from(raiz().querySelectorAll('app-dialogo select option')).map((o) =>
      o.textContent?.trim(),
    );
    expect(opciones).toContain('Gaseosa 500 ml');
    expect(opciones).not.toContain('Agua tónica');
  });
});
