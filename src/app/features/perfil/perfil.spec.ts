import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Canje, OrdenPropia, ResultadoDeCancelacion, Saldos } from '../../core/models/orden';
import { Perfil as ModeloPerfil, PerfilSensible } from '../../core/models/perfil';
import { Auth } from '../../core/services/auth';
import { Cuenta } from '../../core/services/cuenta';
import { Perfil } from './perfil';

const PERFIL: ModeloPerfil = {
  id: 'uuid-1',
  email: 'ana@ejemplo.com',
  nombre: 'Ana',
  apellido: 'Gómez',
  fecha_nacimiento: '1990-05-14',
  rol: 'cliente',
  creado_at: '2026-09-18T12:00:00Z',
};

const SENSIBLES: PerfilSensible = {
  perfil_id: 'uuid-1',
  tipo_sangre: 'O+',
  color_ojos: 'verdes',
  dias_vacaciones: 21,
};

const SALDOS: Saldos = { puntos: 320, credito: 4500, bienvenida: null };

function orden(cambios: Partial<OrdenPropia> = {}): OrdenPropia {
  return {
    orden_id: 'o1',
    codigo: 'ABC123',
    estado: 'pagada',
    total: 13000,
    credito_aplicado: 2000,
    pagada_at: '2026-10-05T15:00:00Z',
    cancelada_at: null,
    pelicula: 'Mar de cenizas',
    inicio: '2026-10-09T21:00:00Z',
    sala: 'Sala 2',
    entradas: 2,
    tiene_candy: false,
    cancelable: true,
    motivo_no_cancelable: null,
    ...cambios,
  };
}

interface Cuentas {
  saldos?: Saldos | null;
  canjes?: Canje[] | null;
  ordenes?: OrdenPropia[] | null;
  cancelar?: ResultadoDeCancelacion;
}

async function montar(
  perfil: ModeloPerfil | null,
  sensibles: PerfilSensible | null,
  cuenta: Cuentas = {},
): Promise<ComponentFixture<Perfil>> {
  // jsdom no implementa <dialog>.showModal(): se le da una versión mínima
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };

  await TestBed.configureTestingModule({
    imports: [Perfil],
    providers: [
      provideRouter([]),
      {
        provide: Auth,
        useValue: {
          perfil: signal(perfil),
          rol: signal(perfil?.rol ?? null),
          cargarDatosSensibles: vi.fn(async () => sensibles),
        },
      },
      {
        provide: Cuenta,
        useValue: {
          saldos: vi.fn(async () => (cuenta.saldos === undefined ? SALDOS : cuenta.saldos)),
          canjes: vi.fn(async () => (cuenta.canjes === undefined ? [] : cuenta.canjes)),
          ordenes: vi.fn(async () => (cuenta.ordenes === undefined ? [] : cuenta.ordenes)),
          cancelar: vi.fn(async () => cuenta.cancelar ?? { estado: 'cancelada', credito: 15000 }),
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Perfil);
  await fixture.whenStable();
  return fixture;
}

const texto = (f: ComponentFixture<Perfil>) =>
  ((f.nativeElement as HTMLElement).textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ');

function botonDeTexto(f: ComponentFixture<Perfil>, contiene: string): HTMLButtonElement {
  return [...(f.nativeElement as HTMLElement).querySelectorAll('app-boton button')].find((b) =>
    b.textContent?.includes(contiene),
  ) as HTMLButtonElement;
}

describe('Perfil', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('muestra nombre, mail y fecha de nacimiento del titular', async () => {
    const fixture = await montar(PERFIL, SENSIBLES);
    const contenido = fixture.nativeElement.textContent as string;

    expect(contenido).toContain('Ana Gómez');
    expect(contenido).toContain('ana@ejemplo.com');
    // formatearLargo la escribe en castellano, no en ISO
    expect(contenido).toContain('1990');
  });

  it('traduce el rol a un nombre que se entiende', async () => {
    const fixture = await montar({ ...PERFIL, rol: 'admin' }, SENSIBLES);

    expect(fixture.nativeElement.textContent).toContain('Administración');
  });

  // RF-38.1: son los únicos datos del sistema que solo ve su titular
  it('muestra los tres datos sensibles y aclara que no los ve nadie más', async () => {
    const fixture = await montar(PERFIL, SENSIBLES);
    const contenido = fixture.nativeElement.textContent as string;

    expect(contenido).toContain('O+');
    expect(contenido).toContain('verdes');
    expect(contenido).toContain('21');
    expect(contenido).toContain('no los ve nadie más');
  });

  it('pide los datos sensibles en una consulta aparte del perfil', async () => {
    await montar(PERFIL, SENSIBLES);
    const auth = TestBed.inject(Auth) as unknown as {
      cargarDatosSensibles: ReturnType<typeof vi.fn>;
    };

    expect(auth.cargarDatosSensibles).toHaveBeenCalledOnce();
  });

  // Si la política RLS no fuera la que es, la consulta volvería vacía: la pantalla no se rompe
  it('avisa en vez de romperse cuando la base no devuelve los datos sensibles', async () => {
    const fixture = await montar(PERFIL, null);
    const contenido = fixture.nativeElement.textContent as string;

    expect(contenido).toContain('No pudimos traer estos datos.');
    expect(contenido).not.toContain('Tipo de sangre');
  });

  it('muestra un spinner mientras el perfil todavía no llegó', async () => {
    const fixture = await montar(null, null);

    expect(fixture.nativeElement.querySelector('app-spinner')).not.toBeNull();
  });

  // RF-41 llega en la F10: el lugar ya está reservado
  it('reserva el lugar de Mis Películas', async () => {
    const fixture = await montar(PERFIL, SENSIBLES);

    expect(texto(fixture)).toContain('Mis Películas');
  });

  describe('puntos y crédito (RF-40)', () => {
    it('muestra el saldo de puntos y el crédito', async () => {
      const fixture = await montar(PERFIL, SENSIBLES);

      expect(texto(fixture)).toMatch(/Puntos\s*320/);
      expect(texto(fixture)).toMatch(/Crédito\s*\$\s?4\.500/);
    });

    it('ofrece el cupón de bienvenida mientras no se usó (RF-39)', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, {
        saldos: {
          puntos: 0,
          credito: 0,
          bienvenida: { codigo: 'BIENVENIDA', tipo_descuento: 'porcentaje', valor: 20 },
        },
      });

      expect(texto(fixture)).toContain('cupón de bienvenida de 20 %');
    });

    it('sin cupón disponible no lo menciona', async () => {
      const fixture = await montar(PERFIL, SENSIBLES);

      expect(texto(fixture)).not.toContain('cupón de bienvenida');
    });

    it('lista el historial de canjes con lo que costó cada uno', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, {
        canjes: [
          {
            id: 'c1',
            costo_puntos: 150,
            creado_at: '2026-10-01T10:00:00Z',
            recompensas: { nombre: 'Pochoclo grande gratis' },
          },
        ],
      });

      expect(texto(fixture)).toContain('Pochoclo grande gratis');
      expect(texto(fixture)).toContain('150 puntos');
    });

    it('sin canjes lo dice', async () => {
      const fixture = await montar(PERFIL, SENSIBLES);

      expect(texto(fixture)).toContain('Todavía no canjeaste puntos');
    });

    it('si no pudo leer los saldos lo dice y no muestra un cero que engañe', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, { saldos: null });

      expect(texto(fixture)).toContain('No pudimos traer tus puntos y tu crédito');
      expect(texto(fixture)).not.toMatch(/Puntos\s*0\b/);
    });
  });

  describe('mis compras y cancelación (RF-30, RF-31, RN-06)', () => {
    it('sin compras invita a ver las películas', async () => {
      const fixture = await montar(PERFIL, SENSIBLES);

      expect(texto(fixture)).toContain('Todavía no compraste entradas');
    });

    it('una compra cancelable muestra su botón; el estado va escrito', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, { ordenes: [orden()] });

      expect(texto(fixture)).toContain('Mar de cenizas');
      expect(texto(fixture)).toContain('Pagada');
      expect(botonDeTexto(fixture, 'Cancelar compra')).toBeDefined();
    });

    it('una que ya no se puede cancelar no ofrece el botón y explica por qué', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, {
        ordenes: [
          orden({
            cancelable: false,
            motivo_no_cancelable: 'Solo se puede cancelar hasta 2 horas antes de la función.',
          }),
        ],
      });

      expect(botonDeTexto(fixture, 'Cancelar compra')).toBeUndefined();
      expect(texto(fixture)).toContain(
        'No se puede cancelar: Solo se puede cancelar hasta 2 horas antes de la función.',
      );
    });

    it('una compra cancelada lo dice y no tiene entrada para ver', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, {
        ordenes: [orden({ estado: 'cancelada', cancelable: false })],
      });

      expect(texto(fixture)).toContain('Cancelada');
      expect(texto(fixture)).not.toContain('Ver entrada');
    });

    it('antes de cancelar pide confirmar y aclara que no se devuelve dinero', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, { ordenes: [orden()] });
      const cuenta = TestBed.inject(Cuenta) as unknown as { cancelar: ReturnType<typeof vi.fn> };

      botonDeTexto(fixture, 'Cancelar compra').click();
      await fixture.whenStable();

      expect(texto(fixture)).toContain('No se devuelve dinero');
      // Crédito = lo pagado con el medio de pago más el crédito que se había usado: 13.000 + 2.000
      expect(texto(fixture)).toMatch(/acreditan \$\s?15\.000/);
      expect(cuenta.cancelar).not.toHaveBeenCalled();
    });

    it('al confirmar cancela, avisa cuánto crédito quedó y vuelve a leer la cuenta', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, { ordenes: [orden()] });
      const cuenta = TestBed.inject(Cuenta) as unknown as {
        cancelar: ReturnType<typeof vi.fn>;
        saldos: ReturnType<typeof vi.fn>;
      };

      botonDeTexto(fixture, 'Cancelar compra').click();
      await fixture.whenStable();
      botonDeTexto(fixture, 'Sí, cancelar la compra').click();
      await fixture.whenStable();

      expect(cuenta.cancelar).toHaveBeenCalledWith('o1');
      // Una vez al cargar y otra después de cancelar: cambian el crédito, los puntos y el cupón
      expect(cuenta.saldos).toHaveBeenCalledTimes(2);
      expect(texto(fixture)).toMatch(
        /Cancelamos tu compra de Mar de cenizas\. \$\s?15\.000 quedaron/,
      );
    });

    it('si la base rechaza la cancelación muestra su motivo y no la da por hecha', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, {
        ordenes: [orden()],
        cancelar: {
          estado: 'error',
          mensaje: 'Solo se puede cancelar hasta 2 horas antes de la función.',
        },
      });

      botonDeTexto(fixture, 'Cancelar compra').click();
      await fixture.whenStable();
      botonDeTexto(fixture, 'Sí, cancelar la compra').click();
      await fixture.whenStable();

      expect(texto(fixture)).toContain('Solo se puede cancelar hasta 2 horas antes');
      expect(texto(fixture)).not.toContain('Cancelamos tu compra');
    });

    it('si no pudo leer las compras lo dice', async () => {
      const fixture = await montar(PERFIL, SENSIBLES, { ordenes: null });

      expect(texto(fixture)).toContain('No pudimos traer tus compras');
    });
  });
});
