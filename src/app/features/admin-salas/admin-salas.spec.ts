import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Sala } from '../../core/models/sala';
import { salaDeMuestra } from '../../core/salas/muestra';
import { Salas } from '../../core/services/salas';
import { AdminSalas } from './admin-salas';

const SALA_1: Sala = { id: 's1', nombre: 'Sala 1', activa: true };
const SALA_2: Sala = { id: 's2', nombre: 'Sala 2', activa: false };

interface Escenario {
  salas?: Sala[] | null;
  butacas?: ReturnType<typeof salaDeMuestra> | null;
  errorAlCrear?: string | null;
  errorAlActualizar?: string | null;
}

describe('AdminSalas', () => {
  let fixture: ComponentFixture<AdminSalas>;
  let servicio: {
    cargarSalas: ReturnType<typeof vi.fn>;
    cargarButacas: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    actualizar: ReturnType<typeof vi.fn>;
  };

  async function estabilizar() {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function crear(escenario: Escenario = {}) {
    const salas = escenario.salas === undefined ? [SALA_1, SALA_2] : escenario.salas;
    const butacas = escenario.butacas === undefined ? salaDeMuestra() : escenario.butacas;

    servicio = {
      cargarSalas: vi.fn(async () => salas),
      cargarButacas: vi.fn(async () => butacas),
      crear: vi.fn(async () => escenario.errorAlCrear ?? null),
      actualizar: vi.fn(async () => escenario.errorAlActualizar ?? null),
    };

    await TestBed.configureTestingModule({
      imports: [AdminSalas],
      providers: [{ provide: Salas, useValue: servicio }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminSalas);
    await estabilizar();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const texto = () => raiz().textContent ?? '';
  const boton = (contiene: string) =>
    Array.from(raiz().querySelectorAll('button')).find((b) => b.textContent?.includes(contiene));

  function llenar(campo: string, valor: unknown) {
    const instancia = fixture.componentInstance as unknown as Record<
      string,
      WritableSignal<unknown>
    >;
    instancia[campo].set(valor);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('lista las salas con su estado escrito, no solo pintado', async () => {
    await crear();
    const salas = Array.from(raiz().querySelectorAll('.sala')).map((s) => s.textContent);

    expect(salas[0]).toContain('Sala 1');
    expect(salas[0]).toContain('Activa');
    expect(salas[1]).toContain('Sala 2');
    expect(salas[1]).toContain('De baja');
  });

  it('elige la primera sala y dibuja su mapa completo', async () => {
    await crear();

    expect(servicio.cargarButacas).toHaveBeenCalledWith('s1');
    expect(raiz().querySelectorAll('.plano .ubicacion')).toHaveLength(532);
    expect(raiz().querySelector('.sala--elegida')?.textContent).toContain('Sala 1');
    expect(raiz().querySelector('.sala--elegida')?.getAttribute('aria-current')).toBe('true');
  });

  it('al elegir otra sala trae su mapa y avisa que está de baja', async () => {
    await crear();

    (raiz().querySelectorAll('.sala')[1] as HTMLButtonElement).click();
    await estabilizar();

    expect(servicio.cargarButacas).toHaveBeenLastCalledWith('s2');
    expect(texto()).toContain('Esta sala está de baja');
  });

  it('si el mapa no se pudo cargar lo dice, y no dibuja un cuadro vacío', async () => {
    await crear({ butacas: null });

    expect(texto()).toContain('No pudimos cargar el mapa');
    expect(raiz().querySelector('.plano')).toBeNull();
  });

  it('si las salas no se pudieron leer lo dice, y no lo confunde con "no hay salas"', async () => {
    await crear({ salas: null });

    expect(texto()).toContain('No pudimos cargar las salas');
    expect(texto()).not.toContain('Todavía no hay salas');
  });

  describe('crear una sala', () => {
    it('no llama a la base con el nombre vacío', async () => {
      await crear();
      raiz()
        .querySelector('form.alta')!
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await estabilizar();

      expect(servicio.crear).not.toHaveBeenCalled();
      expect(texto()).toContain('Escribí el nombre de la sala.');
    });

    it('crea la sala, recarga la lista y elige la nueva', async () => {
      await crear();
      servicio.cargarSalas.mockResolvedValue([
        SALA_1,
        SALA_2,
        { id: 's3', nombre: 'Sala 3', activa: true },
      ]);
      llenar('nombreNuevo', 'Sala 3');

      raiz()
        .querySelector('form.alta')!
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await estabilizar();

      expect(servicio.crear).toHaveBeenCalledWith('Sala 3');
      expect(raiz().querySelector('.sala--elegida')?.textContent).toContain('Sala 3');
      expect(texto()).toContain('Creamos la sala Sala 3, con su mapa completo');
    });

    it('un nombre repetido se informa con el mensaje de la base', async () => {
      await crear({ errorAlCrear: 'Ya existe una sala con ese nombre.' });
      llenar('nombreNuevo', 'Sala 1');

      raiz()
        .querySelector('form.alta')!
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await estabilizar();

      expect(texto()).toContain('Ya existe una sala con ese nombre.');
    });
  });

  describe('gestionar la sala elegida', () => {
    it('dar de baja manda el estado contrario a la base', async () => {
      await crear();

      boton('Dar de baja la sala')!.click();
      await estabilizar();

      expect(servicio.actualizar).toHaveBeenCalledWith('s1', 'Sala 1', false);
      expect(texto()).toContain('deja de recibir funciones nuevas');
    });

    it('con funciones por delante la base la rechaza y el motivo se muestra', async () => {
      const mensaje = 'La sala tiene funciones programadas: dalas de baja o esperá a que terminen';
      await crear({ errorAlActualizar: mensaje });

      boton('Dar de baja la sala')!.click();
      await estabilizar();

      expect(texto()).toContain(mensaje);
      // La sala sigue activa: no se recargó nada
      expect(servicio.cargarSalas).toHaveBeenCalledTimes(1);
    });

    it('una sala de baja se puede volver a activar', async () => {
      await crear({ salas: [SALA_2] });

      boton('Volver a activar la sala')!.click();
      await estabilizar();

      expect(servicio.actualizar).toHaveBeenCalledWith('s2', 'Sala 2', true);
    });

    it('renombrar manda el nombre nuevo y conserva el estado', async () => {
      await crear();
      llenar('nombreEditado', 'Sala Uno');

      raiz()
        .querySelector('form.renombrar')!
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await estabilizar();

      expect(servicio.actualizar).toHaveBeenCalledWith('s1', 'Sala Uno', true);
    });

    it('no renombra con el nombre vacío', async () => {
      await crear();
      llenar('nombreEditado', '   ');

      raiz()
        .querySelector('form.renombrar')!
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await estabilizar();

      expect(servicio.actualizar).not.toHaveBeenCalled();
      expect(texto()).toContain('Escribí el nombre de la sala.');
    });
  });
});
