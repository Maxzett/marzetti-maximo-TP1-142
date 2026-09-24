import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EntradaComprada } from '../../core/models/orden';
import { Compra } from '../../core/services/compra';
import { Entrada } from './entrada';

function comprada(cambios: Partial<EntradaComprada> = {}): EntradaComprada {
  return {
    codigo: 'AB12CD34EF56GH78IJ90',
    estado: 'pagada',
    email: 'a@b.com',
    total: 15000,
    pagada_at: '2026-10-05T15:00:00Z',
    entrada_validada_at: null,
    pelicula: 'Mar de cenizas',
    restriccion_edad: 0,
    requiere_acompanante: false,
    inicio: '2026-10-09T21:00:00Z',
    formato: '2D',
    idioma: 'castellano',
    sala: 'Sala 2',
    butacas: [{ fila: 'A', numero: 1, tipo: 'estandar', precio: 6500 }],
    ...cambios,
  };
}

async function montar(respuesta: EntradaComprada | null): Promise<ComponentFixture<Entrada>> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: Compra, useValue: { obtenerEntrada: vi.fn(async () => respuesta) } },
    ],
  });

  const fixture = TestBed.createComponent(Entrada);
  fixture.componentRef.setInput('codigo', 'AB12CD34EF56GH78IJ90');
  fixture.detectChanges();
  // La carga la lanza un effect y el QR se importa recién al hacer falta: se espera a que termine
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-spinner')).toBeNull();
  });
  return fixture;
}

const el = (f: ComponentFixture<Entrada>) => f.nativeElement as HTMLElement;
const texto = (f: ComponentFixture<Entrada>) => el(f).textContent?.replace(/\s+/g, ' ') ?? '';

describe('Entrada', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('una compra pagada muestra los datos, el código escrito y el QR', async () => {
    const fixture = await montar(comprada());
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el(fixture).querySelector('img.qr')).not.toBeNull();
    });

    expect(texto(fixture)).toContain('Mar de cenizas');
    expect(texto(fixture)).toContain('Sala 2');
    // El código escrito es la alternativa al QR: el empleado lo puede ingresar a mano
    expect(el(fixture).querySelector('.valor')?.textContent).toBe('AB12CD34EF56GH78IJ90');
    expect(el(fixture).querySelector('img.qr')?.getAttribute('alt')).toContain(
      'AB12CD34EF56GH78IJ90',
    );
  });

  it('una película con restricción lleva la leyenda de adulto acompañante', async () => {
    const fixture = await montar(comprada({ restriccion_edad: 18 }));
    expect(texto(fixture)).toContain('debe ir acompañado por un adulto');
  });

  it('una película para todo público no la lleva', async () => {
    const fixture = await montar(comprada());
    expect(texto(fixture)).not.toContain('acompañado por un adulto');
  });

  it('avisa si la entrada ya se usó para ingresar', async () => {
    const fixture = await montar(comprada({ entrada_validada_at: '2026-10-09T20:50:00Z' }));
    expect(texto(fixture)).toContain('ya se usó para ingresar');
  });

  it('una compra sin pagar no muestra entrada ni QR', async () => {
    const fixture = await montar(comprada({ estado: 'pendiente' }));

    expect(texto(fixture)).toContain('todavía no fue pagada');
    expect(el(fixture).querySelector('img.qr')).toBeNull();
  });

  it('una compra vencida o cancelada lo dice', async () => {
    expect(texto(await montar(comprada({ estado: 'expirada' })))).toContain('la reserva venció');
    TestBed.resetTestingModule();
    expect(texto(await montar(comprada({ estado: 'cancelada' })))).toContain('fue cancelada');
  });

  it('un código que no existe lo dice', async () => {
    const fixture = await montar(null);
    expect(texto(fixture)).toContain('No encontramos esa entrada');
  });
});
