import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CatalogoDeCandy } from '../../core/models/candy';
import {
  DesgloseDeOrden,
  ResultadoDeConfiguracion,
  ResultadoDeOrdenDeCandy,
  ResultadoDePago,
} from '../../core/models/orden';
import { Auth } from '../../core/services/auth';
import { Candy } from '../../core/services/candy';
import { Compra } from '../../core/services/compra';
import { Cuenta } from '../../core/services/cuenta';
import { CandyBar } from './candy-bar';

const CANDY: CatalogoDeCandy = {
  categorias: [{ id: 'c1', nombre: 'Pochoclos', orden: 1 }],
  productos: [
    {
      id: 'p1',
      categoria_id: 'c1',
      nombre: 'Pochoclo grande',
      descripcion: '',
      imagen_url: null,
      precio: 6500,
    },
  ],
  combos: [
    {
      id: 'k1',
      nombre: 'Combo Pareja',
      descripcion: '',
      imagen_url: null,
      precio: 20000,
      destacado: true,
      combo_items: [{ incluye_entrada: true, cantidad: 2, productos: null }],
    },
    {
      id: 'k2',
      nombre: 'Combo Dulce',
      descripcion: '',
      imagen_url: null,
      precio: 9000,
      destacado: false,
      combo_items: [{ incluye_entrada: false, cantidad: 1, productos: { nombre: 'Pochoclo' } }],
    },
  ],
  recompensas: [],
};

function desglose(cambios: Partial<DesgloseDeOrden> = {}): DesgloseDeOrden {
  return {
    subtotal: 6500,
    descuento_cupon: 0,
    credito_aplicado: 0,
    total: 6500,
    puntos_a_ganar: 0,
    puntos_canje: 0,
    cupon: null,
    tiene_vip: false,
    entradas: [],
    productos: [
      {
        producto_id: 'p1',
        nombre: 'Pochoclo grande',
        cantidad: 1,
        precio_unitario: 6500,
        por_canje: false,
      },
    ],
    combos: [],
    ...cambios,
  };
}

interface Opciones {
  candy?: CatalogoDeCandy | null;
  crear?: ResultadoDeOrdenDeCandy;
  configurar?: ResultadoDeConfiguracion;
  pago?: ResultadoDePago;
}

async function montar(opciones: Opciones = {}) {
  const servicio = {
    crearOrdenCandy: vi.fn(
      async () =>
        opciones.crear ?? {
          estado: 'creada' as const,
          orden: {
            orden_id: 'o1',
            codigo: 'CANDY1',
            expira_at: new Date(Date.now() + 600_000).toISOString(),
          },
        },
    ),
    configurarOrden: vi.fn(
      async () => opciones.configurar ?? { estado: 'configurada' as const, desglose: desglose() },
    ),
    confirmarPago: vi.fn(
      async () => opciones.pago ?? { estado: 'pagada' as const, codigo: 'CANDY1' },
    ),
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: Compra, useValue: servicio },
      {
        provide: Candy,
        useValue: {
          cargar: vi.fn(async () => (opciones.candy === undefined ? CANDY : opciones.candy)),
        },
      },
      { provide: Cuenta, useValue: { saldos: vi.fn(async () => null) } },
      { provide: Auth, useValue: { haySesion: signal(false), perfil: signal(null) } },
    ],
  });

  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(CandyBar);
  fixture.detectChanges();
  await asentar(fixture);

  return { fixture, servicio, navegar };
}

async function asentar(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver, 0));
  fixture.detectChanges();
}

const el = (f: ComponentFixture<CandyBar>) => f.nativeElement as HTMLElement;
const texto = (f: ComponentFixture<CandyBar>) => el(f).textContent?.replace(/\s+/g, ' ') ?? '';

function boton(f: ComponentFixture<CandyBar>, contiene: string): HTMLButtonElement {
  return [...el(f).querySelectorAll('button')].find(
    (b) =>
      (b.textContent ?? '').includes(contiene) || b.getAttribute('aria-label')?.includes(contiene),
  ) as HTMLButtonElement;
}

async function elegirYSeguir(f: ComponentFixture<CandyBar>, email = 'a@b.com'): Promise<void> {
  boton(f, 'Agregar una unidad de Pochoclo grande').click();
  f.componentInstance['email'].set(email);
  await asentar(f);
  el(f).querySelector('form')!.dispatchEvent(new Event('submit'));
  await asentar(f);
}

describe('CandyBar', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ofrece los productos y los combos sin entrada, no los que traen una', async () => {
    const { fixture } = await montar();

    expect(texto(fixture)).toContain('Pochoclo grande');
    expect(texto(fixture)).toContain('Combo Dulce');
    expect(texto(fixture)).not.toContain('Combo Pareja');
  });

  it('sin nada elegido no abre la orden', async () => {
    const { fixture, servicio } = await montar();
    fixture.componentInstance['email'].set('a@b.com');
    el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    await asentar(fixture);

    expect(texto(fixture)).toContain('Elegí al menos un producto');
    expect(servicio.crearOrdenCandy).not.toHaveBeenCalled();
  });

  it('un mail inválido se avisa antes de ir a la base', async () => {
    const { fixture, servicio } = await montar();
    await elegirYSeguir(fixture, 'mal');

    expect(texto(fixture)).toContain('Ingresá un email válido');
    expect(servicio.crearOrdenCandy).not.toHaveBeenCalled();
  });

  it('abre la orden, manda lo elegido y muestra el resumen que calculó la base', async () => {
    const { fixture, servicio } = await montar();
    await elegirYSeguir(fixture);

    expect(servicio.crearOrdenCandy).toHaveBeenCalledWith('a@b.com');
    expect(servicio.configurarOrden).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ productos: [{ id: 'p1', cantidad: 1 }], combos: [] }),
    );
    expect(texto(fixture)).toContain('Resumen y pago');
    expect(texto(fixture)).toContain('no se cancelan');
    expect(el(fixture).querySelector('app-temporizador')).not.toBeNull();
  });

  it('al pagar lleva al ticket, con el mismo QR que una entrada', async () => {
    const { fixture, servicio, navegar } = await montar();
    await elegirYSeguir(fixture);
    fixture.componentInstance['medio'].set('tarjeta_debito');

    boton(fixture, 'Pagar').click();
    await asentar(fixture);

    expect(servicio.confirmarPago).toHaveBeenCalledWith('o1', 'tarjeta_debito');
    expect(navegar).toHaveBeenCalledWith(['/entrada', 'CANDY1']);
  });

  it('si la orden venció vuelve al pedido y lo dice, sin perder lo elegido', async () => {
    const { fixture } = await montar({ pago: { estado: 'vencida', mensaje: 'venció' } });
    await elegirYSeguir(fixture);
    fixture.componentInstance['medio'].set('transferencia');

    boton(fixture, 'Pagar').click();
    await asentar(fixture);

    expect(texto(fixture)).toContain('Pasaron 10 minutos sin pagar');
    expect(texto(fixture)).toContain('¿Qué vas a llevar?');
    expect(fixture.componentInstance['productos']().get('p1')).toBe(1);
  });

  it('si la base rechaza la orden muestra su motivo', async () => {
    const { fixture } = await montar({
      crear: { estado: 'error', mensaje: 'La sesión de compra no es válida.' },
    });
    await elegirYSeguir(fixture);

    expect(texto(fixture)).toContain('La sesión de compra no es válida.');
  });

  it('si no carga el candy lo dice', async () => {
    const { fixture } = await montar({ candy: null });

    expect(texto(fixture)).toContain('No pudimos cargar el candy bar');
  });
});
