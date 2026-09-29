import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginaDeActividad, RegistroDeActividad } from '../../core/models/reportes';
import { Reportes } from '../../core/services/reportes';
import { AdminActividad } from './admin-actividad';

const registro = (id: number, cambios: Partial<RegistroDeActividad> = {}): RegistroDeActividad => ({
  id,
  accion: 'modificar_precio_producto',
  entidad: 'producto',
  entidad_id: 'p1',
  detalle: { nombre: 'Pochoclo grande', antes: 6500, despues: 7000 },
  creado_at: '2026-09-27T21:15:00Z',
  actor_email: 'alma@cine.com',
  actor_rol: 'admin',
  actor: { nombre: 'Alma', apellido: 'Admin' },
  ...cambios,
});

describe('AdminActividad', () => {
  let fixture: ComponentFixture<AdminActividad>;
  let actividad: ReturnType<typeof vi.fn>;

  async function estabilizar() {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function crear(respuesta: PaginaDeActividad | null) {
    actividad = vi.fn(async () => respuesta);

    await TestBed.configureTestingModule({
      imports: [AdminActividad],
      providers: [{ provide: Reportes, useValue: { actividad } }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminActividad);
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

  it('cada fila dice cuándo, quién y qué hizo, en palabras (RF-61)', async () => {
    await crear({ registros: [registro(1)], total: 1 });
    const fila = raiz().querySelector('tbody tr')!.textContent!.replace(/\s+/g, ' ');

    // 21:15 UTC son las 18:15 del cine
    expect(fila).toContain('27/09/2026 18:15');
    expect(fila).toContain('Alma A.');
    expect(fila).toContain('Administración');
    expect(fila).toContain('Precio de producto');
    expect(fila.replace(/\$\s*/g, '$')).toContain('de $6.500 a $7.000');
  });

  it('pide la primera página sin filtros', async () => {
    await crear({ registros: [], total: 0 });

    expect(actividad).toHaveBeenCalledWith({ accion: '', desde: '', hasta: '' }, 0);
    expect(texto()).toContain('Todavía no hay actividad.');
  });

  it('"Ver más" suma la tanda siguiente debajo de la que ya estaba', async () => {
    await crear({ registros: [registro(1), registro(2)], total: 4 });
    expect(texto()).toContain('2 de 4 registros');

    actividad.mockResolvedValueOnce({ registros: [registro(3), registro(4)], total: 4 });
    boton('Ver más actividad')!.click();
    await estabilizar();

    expect(actividad).toHaveBeenLastCalledWith({ accion: '', desde: '', hasta: '' }, 1);
    expect(raiz().querySelectorAll('tbody tr').length).toBe(4);
    expect(texto()).toContain('4 de 4 registros');
  });

  it('con la última tanda se va el botón y el foco pasa al contador', async () => {
    await crear({ registros: [registro(1)], total: 2 });

    actividad.mockResolvedValueOnce({ registros: [registro(2)], total: 2 });
    boton('Ver más actividad')!.click();
    await estabilizar();

    expect(boton('Ver más actividad')).toBeUndefined();
    expect(document.activeElement?.classList).toContain('cuenta');
  });

  it('no repite un registro que ya se mostraba si el log se corrió entre tandas', async () => {
    await crear({ registros: [registro(1), registro(2)], total: 3 });

    actividad.mockResolvedValueOnce({ registros: [registro(2), registro(3)], total: 3 });
    boton('Ver más actividad')!.click();
    await estabilizar();

    expect(raiz().querySelectorAll('tbody tr').length).toBe(3);
  });

  it('si falla una tanda, lo ya mostrado queda y se puede reintentar', async () => {
    await crear({ registros: [registro(1)], total: 2 });

    actividad.mockResolvedValueOnce(null);
    boton('Ver más actividad')!.click();
    await estabilizar();

    expect(raiz().querySelectorAll('tbody tr').length).toBe(1);
    expect(texto()).toContain('No pudimos traer más actividad');

    actividad.mockResolvedValueOnce({ registros: [registro(2)], total: 2 });
    boton('Ver más actividad')!.click();
    await estabilizar();

    expect(actividad).toHaveBeenLastCalledWith({ accion: '', desde: '', hasta: '' }, 1);
    expect(raiz().querySelectorAll('tbody tr').length).toBe(2);
  });

  it('cambiar un filtro vuelve a la primera tanda', async () => {
    await crear({ registros: [registro(1)], total: 120 });
    boton('Ver más actividad')!.click();
    await estabilizar();

    const select = raiz().querySelector('select')!;
    select.value = 'validar_entrada';
    select.dispatchEvent(new Event('change'));
    await estabilizar();

    expect(actividad).toHaveBeenLastCalledWith(
      { accion: 'validar_entrada', desde: '', hasta: '' },
      0,
    );
    expect(boton('Quitar filtros')).toBeTruthy();
  });

  it('si el log no carga lo dice, y no lo confunde con "no hay actividad"', async () => {
    await crear(null);

    expect(texto()).toContain('No pudimos cargar la actividad');
    expect(texto()).not.toContain('Todavía no hay actividad');
  });
});
