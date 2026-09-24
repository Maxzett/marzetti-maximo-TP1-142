import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MapaDeEstados } from '../../core/compra/estado-butacas';
import { Pelicula } from '../../core/models/pelicula';
import { Funcion } from '../../core/models/sala';
import { ResultadoDeOrden, ResultadoDePago } from '../../core/models/orden';
import { salaDeMuestra } from '../../core/salas/muestra';
import { Auth } from '../../core/services/auth';
import { Catalogo } from '../../core/services/catalogo';
import { Compra as ServicioDeCompra } from '../../core/services/compra';
import { Funciones } from '../../core/services/funciones';
import { Salas } from '../../core/services/salas';
import { Compra } from './compra';

const MANANA = new Date(Date.now() + 86_400_000).toISOString();

function funcionDeMuestra(): Funcion {
  return {
    id: 'f1',
    pelicula_id: 'p1',
    sala_id: 's1',
    inicio: MANANA,
    formato: '2D',
    idioma: 'castellano',
    precio_base: 6500,
    activa: true,
    pelicula: { titulo: 'Mar de cenizas', duracion_minutos: 120 },
    sala: { nombre: 'Sala 1' },
  };
}

function peliculaDeMuestra(restriccion: 0 | 13 | 18): Pelicula {
  return {
    id: 'p1',
    titulo: 'Mar de cenizas',
    sinopsis: '',
    poster_url: null,
    duracion_minutos: 120,
    restriccion_edad: restriccion,
    fecha_estreno: null,
    destacada: false,
    precio_preventa: null,
    generos: [],
  };
}

interface Opciones {
  funcion?: Funcion | null;
  restriccion?: 0 | 13 | 18;
  haySesion?: boolean;
  retener?: ReturnType<typeof vi.fn>;
  crearOrden?: ResultadoDeOrden;
  pago?: ResultadoDePago;
}

async function montar(opciones: Opciones = {}) {
  const butacas = salaDeMuestra();
  const estados: MapaDeEstados = { estados: new Map(), vencimientos: new Map() };
  const cerrarCanal = vi.fn();

  const servicio = {
    sesionId: 'sesion-de-prueba-0001',
    cargarEstados: vi.fn(async () => estados),
    retener: opciones.retener ?? vi.fn(async () => ({ estado: 'reservada', expiraAt: null })),
    liberar: vi.fn(async () => null),
    crearOrden: vi.fn(async () => opciones.crearOrden),
    confirmarPago: vi.fn(async () => opciones.pago),
    escuchar: vi.fn(() => cerrarCanal),
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ServicioDeCompra, useValue: servicio },
      {
        provide: Funciones,
        useValue: {
          cargarUna: vi.fn(async () =>
            opciones.funcion === undefined ? funcionDeMuestra() : opciones.funcion,
          ),
        },
      },
      {
        provide: Catalogo,
        useValue: {
          cargarPelicula: vi.fn(async () => peliculaDeMuestra(opciones.restriccion ?? 0)),
        },
      },
      { provide: Salas, useValue: { cargarButacas: vi.fn(async () => butacas) } },
      {
        provide: Auth,
        useValue: { haySesion: signal(opciones.haySesion ?? false), perfil: signal(null) },
      },
    ],
  });

  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Compra);
  fixture.componentRef.setInput('funcionId', 'f1');
  fixture.detectChanges();
  await asentar(fixture);

  return { fixture, servicio, butacas, navegar, cerrarCanal };
}

/**
 * Deja resolver las promesas sueltas del componente (la carga que lanza un effect no es una
 * tarea pendiente de Angular, así que whenStable no la espera) y vuelve a pintar.
 */
async function asentar(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver, 0));
  fixture.detectChanges();
}

const el = (f: ComponentFixture<Compra>) => f.nativeElement as HTMLElement;
const texto = (f: ComponentFixture<Compra>) => el(f).textContent?.replace(/\s+/g, ' ') ?? '';

const refrescar = asentar;

function botonDeTexto(f: ComponentFixture<Compra>, contiene: string): HTMLButtonElement {
  const boton = [...el(f).querySelectorAll('app-boton button')].find((b) =>
    b.textContent?.includes(contiene),
  );
  return boton as HTMLButtonElement;
}

describe('Compra', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('carga la función, dibuja el mapa para elegir y abre el canal en vivo', async () => {
    const { fixture, servicio } = await montar();

    expect(texto(fixture)).toContain('Mar de cenizas');
    expect(texto(fixture)).toContain('Sala 1');
    expect(el(fixture).querySelectorAll('button.celda')).toHaveLength(532);
    expect(servicio.escuchar).toHaveBeenCalledWith('f1', expect.any(Function));
  });

  it('cierra el canal en vivo al salir de la pantalla', async () => {
    const { fixture, cerrarCanal } = await montar();
    fixture.destroy();
    expect(cerrarCanal).toHaveBeenCalled();
  });

  it('una función que no existe lo dice y no muestra un mapa vacío', async () => {
    const { fixture } = await montar({ funcion: null });

    expect(texto(fixture)).toContain('No encontramos esa función');
    expect(el(fixture).querySelector('button.celda')).toBeNull();
  });

  it('elegir una butaca la reserva y la suma a la lista; Continuar se habilita', async () => {
    const { fixture, servicio } = await montar();
    expect(botonDeTexto(fixture, 'Continuar').disabled).toBe(true);

    (el(fixture).querySelector('button.celda') as HTMLButtonElement).click();
    await refrescar(fixture);

    expect(servicio.retener).toHaveBeenCalledWith('f1', expect.any(String));
    expect(texto(fixture)).toContain('1 butaca elegida');
    expect(botonDeTexto(fixture, 'Continuar').disabled).toBe(false);
  });

  it('si la butaca ya la tomó otra persona muestra el motivo y vuelve a leer el mapa', async () => {
    const retener = vi.fn(async () => ({
      estado: 'error',
      mensaje: 'Otra persona está eligiendo esa butaca en este momento.',
    }));
    const { fixture, servicio } = await montar({ retener });
    const lecturasAntes = servicio.cargarEstados.mock.calls.length;

    (el(fixture).querySelector('button.celda') as HTMLButtonElement).click();
    await refrescar(fixture);

    expect(texto(fixture)).toContain('Otra persona está eligiendo esa butaca');
    expect(servicio.cargarEstados.mock.calls.length).toBe(lecturasAntes + 1);
    expect(texto(fixture)).toContain('Todavía no elegiste ninguna butaca');
  });

  it('elegir una butaca VIP avisa que cuesta más, antes de seguir', async () => {
    const { fixture, butacas } = await montar();
    const vip = butacas.find((b) => b.tipo === 'vip')!;
    (el(fixture).querySelector(`button[data-id="${vip.id}"]`) as HTMLButtonElement).click();
    await refrescar(fixture);

    expect(texto(fixture)).toContain('Elegiste butacas VIP');
  });

  describe('restricción de edad (RN-04, D-02)', () => {
    async function hastaLosDatos(opciones: Opciones) {
      const montado = await montar(opciones);
      (el(montado.fixture).querySelector('button.celda') as HTMLButtonElement).click();
      await refrescar(montado.fixture);
      botonDeTexto(montado.fixture, 'Continuar').click();
      await refrescar(montado.fixture);
      return montado;
    }

    it('una película +18 avisa del adulto acompañante desde la primera pantalla', async () => {
      const { fixture } = await montar({ restriccion: 18 });
      expect(texto(fixture)).toContain('acompañado por un adulto');
    });

    it('sin cuenta pide declarar la fecha de nacimiento', async () => {
      const { fixture } = await hastaLosDatos({ restriccion: 18 });
      expect(el(fixture).querySelector('app-selector-fecha')).not.toBeNull();
    });

    it('con cuenta no la pide: usa la registrada', async () => {
      const { fixture } = await hastaLosDatos({ restriccion: 18, haySesion: true });
      expect(el(fixture).querySelector('app-selector-fecha')).toBeNull();
    });

    it('un menor es rechazado sin ir a la base', async () => {
      const { fixture, servicio } = await hastaLosDatos({ restriccion: 18 });
      fixture.componentInstance['email'].set('a@b.com');
      fixture.componentInstance['nacimiento'].set('2015-01-01');

      el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
      await refrescar(fixture);

      expect(texto(fixture)).toContain('es para mayores de 18 años');
      expect(servicio.crearOrden).not.toHaveBeenCalled();
    });

    it('un email inválido se avisa antes de ir a la base', async () => {
      const { fixture, servicio } = await hastaLosDatos({});
      fixture.componentInstance['email'].set('mal');

      el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
      await refrescar(fixture);

      expect(texto(fixture)).toContain('Ingresá un email válido');
      expect(servicio.crearOrden).not.toHaveBeenCalled();
    });
  });

  describe('resumen y pago', () => {
    const resumen = {
      orden_id: 'o1',
      codigo: 'ABC123',
      expira_at: new Date(Date.now() + 600_000).toISOString(),
      subtotal: 8500,
      total: 8500,
      tiene_vip: true,
      requiere_acompanante: false,
      items: [
        { butaca_id: 'b1', fila: 'A', numero: 1, tipo: 'estandar', precio: 6500 },
        { butaca_id: 'b2', fila: 'R', numero: 5, tipo: 'vip', precio: 8500 },
      ],
    } as const;

    async function hastaElPago(opciones: Opciones) {
      const montado = await montar({
        crearOrden: { estado: 'creada', resumen: { ...resumen, items: [...resumen.items] } },
        ...opciones,
      });
      (el(montado.fixture).querySelector('button.celda') as HTMLButtonElement).click();
      await refrescar(montado.fixture);
      botonDeTexto(montado.fixture, 'Continuar').click();
      await refrescar(montado.fixture);
      montado.fixture.componentInstance['email'].set('a@b.com');
      el(montado.fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
      await refrescar(montado.fixture);
      return montado;
    }

    it('muestra el detalle con el precio de cada butaca y el aviso de VIP antes de pagar (RF-17)', async () => {
      const { fixture } = await hastaElPago({});

      expect(texto(fixture)).toContain('Tu compra incluye butacas VIP');
      expect(texto(fixture)).toContain('VIP');
      expect(el(fixture).querySelectorAll('tbody tr')).toHaveLength(2);
    });

    it('sin elegir medio de pago no paga', async () => {
      const { fixture, servicio } = await hastaElPago({});

      botonDeTexto(fixture, 'Pagar').click();
      await refrescar(fixture);

      expect(texto(fixture)).toContain('Elegí un medio de pago');
      expect(servicio.confirmarPago).not.toHaveBeenCalled();
    });

    it('un pago exitoso lleva a la entrada', async () => {
      const { fixture, navegar } = await hastaElPago({
        pago: { estado: 'pagada', codigo: 'ABC123' },
      });
      fixture.componentInstance['medio'].set('tarjeta_debito');

      botonDeTexto(fixture, 'Pagar').click();
      await refrescar(fixture);

      expect(navegar).toHaveBeenCalledWith(['/entrada', 'ABC123']);
    });

    it('si la reserva venció vuelve al mapa con el aviso, sin tratarlo como una falla', async () => {
      const { fixture } = await hastaElPago({
        pago: { estado: 'vencida', mensaje: 'La reserva venció. Elegí las butacas de nuevo.' },
      });
      fixture.componentInstance['medio'].set('transferencia');

      botonDeTexto(fixture, 'Pagar').click();
      await refrescar(fixture);

      expect(texto(fixture)).toContain('La reserva venció');
      expect(texto(fixture)).toContain('Elegí tus butacas');
    });
  });
});
