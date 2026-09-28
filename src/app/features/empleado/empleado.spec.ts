import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ConsultaDeOrden,
  OrdenParaPersonal,
  ResultadoDeValidacion,
} from '../../core/models/validacion';
import { Validacion } from '../../core/services/validacion';
import { Empleado } from './empleado';
import { Escaner } from './escaner/escaner';

const CODIGO = '8EEDB649A1B646698A52';

function orden(cambios: Partial<OrdenParaPersonal> = {}): OrdenParaPersonal {
  return {
    codigo: CODIGO,
    estado: 'pagada',
    subtotal: 15000,
    descuento_cupon: 0,
    credito_aplicado: 0,
    total: 15000,
    pagada_at: '2026-09-27T15:00:00Z',
    cancelada_at: null,
    entrada_validada_at: null,
    candy_entregado_at: null,
    tiene_candy: true,
    candy: [{ nombre: 'Pochoclo grande', cantidad: 1, por_canje: false, incluye: [] }],
    pelicula: 'Mar de cenizas',
    restriccion_edad: 0,
    requiere_acompanante: false,
    inicio: '2026-09-27T21:00:00Z',
    formato: '2D',
    idioma: 'castellano',
    sala: 'Sala 2',
    butacas: [
      { fila: 'A', numero: 1, tipo: 'estandar', precio: 6500 },
      { fila: 'A', numero: 2, tipo: 'estandar', precio: 6500 },
    ],
    tramos: {
      entrada: { usado_at: null, usado_por: null },
      candy: { usado_at: null, usado_por: null },
    },
    ventana: { desde: '2026-09-27T20:00:00Z', hasta: '2026-09-27T23:00:00Z', estado: 'abierta' },
    ...cambios,
  };
}

function crearServicio(
  consulta: ConsultaDeOrden = { estado: 'encontrada', orden: orden() },
  validacion?: ResultadoDeValidacion,
) {
  return {
    consultar: vi.fn(async (_codigo: string) => consulta),
    validar: vi.fn(
      async (_codigo: string, tramo: 'entrada' | 'candy'): Promise<ResultadoDeValidacion> =>
        validacion ?? {
          estado: 'validada',
          tramo,
          uso: { usado_at: '2026-09-27T20:40:00Z', usado_por: 'Ana G.' },
        },
    ),
  };
}

async function montar(servicio = crearServicio()) {
  TestBed.configureTestingModule({ providers: [{ provide: Validacion, useValue: servicio }] });
  const fixture = TestBed.createComponent(Empleado);
  fixture.detectChanges();
  return { fixture, servicio, elemento: fixture.nativeElement as HTMLElement };
}

async function estabilizar(fixture: ComponentFixture<Empleado>) {
  await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges();
  await fixture.whenStable();
}

async function ingresarCodigo(fixture: ComponentFixture<Empleado>, texto: string) {
  const campo = fixture.nativeElement.querySelector('app-campo input') as HTMLInputElement;
  campo.value = texto;
  campo.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
    new Event('submit'),
  );
  await estabilizar(fixture);
}

function botones(elemento: HTMLElement): string[] {
  return [...elemento.querySelectorAll('.tramos button')].map((b) => b.textContent!.trim());
}

function pulsar(elemento: HTMLElement, texto: string) {
  const boton = [...elemento.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(texto),
  );
  boton!.click();
}

describe('Empleado', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('un código mal tipeado no llega a la base y explica el formato (RF-53)', async () => {
    const { fixture, servicio, elemento } = await montar();

    await ingresarCodigo(fixture, '8EEDB649');

    expect(servicio.consultar).not.toHaveBeenCalled();
    expect(elemento.textContent).toContain('20 caracteres');
  });

  it('busca el código a mano normalizado y muestra la orden', async () => {
    const { fixture, servicio, elemento } = await montar();

    await ingresarCodigo(fixture, '8eed b649 a1b6 4669 8a52');

    expect(servicio.consultar).toHaveBeenCalledWith(CODIGO);
    expect(elemento.querySelector('h2[tabindex="-1"]')?.textContent).toContain('Mar de cenizas');
    expect(elemento.textContent).toContain('A1 y A2');
    expect(elemento.textContent).toContain('1 × Pochoclo grande');
    expect(botones(elemento)).toEqual(['Validar ingreso', 'Entregar candy']);
  });

  it('busca lo que lee la cámara', async () => {
    const { fixture, servicio } = await montar();

    fixture.debugElement.query(By.directive(Escaner)).componentInstance.leido.emit(CODIGO);
    await estabilizar(fixture);

    expect(servicio.consultar).toHaveBeenCalledWith(CODIGO);
  });

  it('un QR que no es una entrada no se consulta', async () => {
    const { fixture, servicio, elemento } = await montar();

    fixture.debugElement.query(By.directive(Escaner)).componentInstance.leido.emit('hola');
    await estabilizar(fixture);

    expect(servicio.consultar).not.toHaveBeenCalled();
    expect(elemento.textContent).toContain('no es una entrada');
  });

  it('validar el ingreso marca ese tramo y deja el candy disponible (D-03)', async () => {
    const { fixture, servicio, elemento } = await montar();
    await ingresarCodigo(fixture, CODIGO);

    pulsar(elemento, 'Validar ingreso');
    await estabilizar(fixture);

    expect(servicio.validar).toHaveBeenCalledWith(CODIGO, 'entrada');
    expect(elemento.textContent).toContain('Ingreso validado');
    expect(elemento.textContent).toContain('por Ana G.');
    expect(botones(elemento)).toEqual(['Entregar candy']);
  });

  it('un tramo ya usado se rechaza diciendo cuándo y por quién (RN-05)', async () => {
    const servicio = crearServicio(undefined, {
      estado: 'rechazada',
      motivo: 'ya_usado',
      mensaje: 'Esta entrada ya se usó para ingresar.',
      uso: { usado_at: '2026-09-27T20:10:00Z', usado_por: 'Beto P.' },
    });
    const { fixture, elemento } = await montar(servicio);
    await ingresarCodigo(fixture, CODIGO);

    pulsar(elemento, 'Validar ingreso');
    await estabilizar(fixture);

    const aviso = elemento.querySelector('app-mensaje')!.textContent!;
    expect(aviso).toContain('ya se usó');
    expect(aviso).toContain('17:10 por Beto P.');
  });

  it('muestra un tramo ya usado sin ofrecer el botón', async () => {
    const servicio = crearServicio({
      estado: 'encontrada',
      orden: orden({
        tramos: {
          entrada: { usado_at: '2026-09-27T20:10:00Z', usado_por: 'Beto P.' },
          candy: { usado_at: null, usado_por: null },
        },
      }),
    });
    const { fixture, elemento } = await montar(servicio);
    await ingresarCodigo(fixture, CODIGO);

    expect(botones(elemento)).toEqual(['Entregar candy']);
    expect(elemento.querySelector('.tramo--usado')?.textContent).toContain('por Beto P.');
  });

  it('una orden sin candy no ofrece retirar candy', async () => {
    const servicio = crearServicio({
      estado: 'encontrada',
      orden: orden({
        tiene_candy: false,
        candy: [],
        tramos: { entrada: { usado_at: null, usado_por: null }, candy: null },
      }),
    });
    const { fixture, elemento } = await montar(servicio);
    await ingresarCodigo(fixture, CODIGO);

    expect(botones(elemento)).toEqual(['Validar ingreso']);
    expect(elemento.textContent).toContain('no incluye candy');
  });

  it('fuera de horario o con la compra cancelada no ofrece validar', async () => {
    const temprano = crearServicio({
      estado: 'encontrada',
      orden: orden({ ventana: { ...orden().ventana, estado: 'antes' } }),
    });
    let montado = await montar(temprano);
    await ingresarCodigo(montado.fixture, CODIGO);
    expect(botones(montado.elemento)).toEqual([]);
    expect(montado.elemento.textContent).toContain('Todavía es temprano');

    TestBed.resetTestingModule();

    const cancelada = crearServicio({
      estado: 'encontrada',
      orden: orden({ estado: 'cancelada' }),
    });
    montado = await montar(cancelada);
    await ingresarCodigo(montado.fixture, CODIGO);
    expect(botones(montado.elemento)).toEqual([]);
    expect(montado.elemento.textContent).toContain('fue cancelada');
  });

  it('avisa la restricción de edad con texto, para pedir documento (D-02)', async () => {
    const servicio = crearServicio({
      estado: 'encontrada',
      orden: orden({ restriccion_edad: 18 }),
    });
    const { fixture, elemento } = await montar(servicio);
    await ingresarCodigo(fixture, CODIGO);

    expect(elemento.querySelector('.edad')?.textContent).toContain('+18');
    expect(elemento.querySelector('.edad')?.textContent).toContain('documento');
  });

  it('muestra el error de la base si la entrada no existe', async () => {
    const servicio = crearServicio({ estado: 'error', mensaje: 'No encontramos esa entrada.' });
    const { fixture, elemento } = await montar(servicio);
    await ingresarCodigo(fixture, CODIGO);

    expect(elemento.textContent).toContain('No encontramos esa entrada.');
    expect(elemento.querySelector('.orden')).toBeNull();
  });

  it('"Siguiente entrada" deja la pantalla vacía para la próxima persona', async () => {
    const { fixture, elemento } = await montar();
    await ingresarCodigo(fixture, CODIGO);

    pulsar(elemento, 'Siguiente entrada');
    fixture.detectChanges();

    expect(elemento.querySelector('.orden')).toBeNull();
    expect(elemento.textContent).toContain('Acá aparece la entrada');
  });
});
