import { TestBed } from '@angular/core/testing';
import { CREAR_LECTOR_QR, LectorQr } from '../../../core/validacion/lector-qr';
import { Escaner, INTERVALO_DE_LECTURA_MS, PAUSA_MISMO_CODIGO_MS } from './escaner';

/** Lo que se ve frente a la cámara, cuadro a cuadro */
let enCamara: string | null = null;
const lector: LectorQr = { leer: async () => enCamara };

function pistaFalsa() {
  return { stop: vi.fn() };
}

function instalarCamara(getUserMedia: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
}

async function montar() {
  TestBed.configureTestingModule({
    providers: [{ provide: CREAR_LECTOR_QR, useValue: async () => lector }],
  });

  const fixture = TestBed.createComponent(Escaner);
  const leidos: string[] = [];
  fixture.componentInstance.leido.subscribe((texto) => leidos.push(texto));
  fixture.detectChanges();

  return { fixture, leidos, elemento: fixture.nativeElement as HTMLElement };
}

function boton(elemento: HTMLElement, texto: string): HTMLButtonElement {
  const encontrado = [...elemento.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(texto),
  );
  if (!encontrado) {
    throw new Error(`No hay botón "${texto}"`);
  }
  return encontrado;
}

describe('Escaner', () => {
  beforeEach(() => {
    enCamara = null;
    vi.useFakeTimers();
    // jsdom no reproduce video
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  });

  it('no prende la cámara al entrar: espera al botón', async () => {
    instalarCamara(async () => ({ getTracks: () => [] }));
    const { elemento } = await montar();

    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(boton(elemento, 'Activar cámara')).toBeTruthy();
  });

  it('prende la cámara de atrás, lee y emite el código', async () => {
    const pista = pistaFalsa();
    instalarCamara(async () => ({ getTracks: () => [pista] }));
    const { fixture, leidos, elemento } = await montar();

    boton(elemento, 'Activar cámara').click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    expect((elemento.querySelector('.visor') as HTMLElement).hidden).toBe(false);

    enCamara = '8EEDB649A1B646698A52';
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_LECTURA_MS);

    expect(leidos).toEqual(['8EEDB649A1B646698A52']);
  });

  it('no repite el mismo código mientras siga frente a la cámara', async () => {
    instalarCamara(async () => ({ getTracks: () => [] }));
    const { leidos, elemento } = await montar();
    boton(elemento, 'Activar cámara').click();
    await vi.advanceTimersByTimeAsync(0);

    enCamara = 'AAAAAAAAAAAAAAAAAAAA';
    await vi.advanceTimersByTimeAsync(PAUSA_MISMO_CODIGO_MS * 2);
    expect(leidos).toEqual(['AAAAAAAAAAAAAAAAAAAA']);

    // Otro código sí se avisa enseguida
    enCamara = 'BBBBBBBBBBBBBBBBBBBB';
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_LECTURA_MS);
    expect(leidos).toEqual(['AAAAAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBB']);
  });

  it('el mismo código vuelve a avisarse si salió de cuadro un rato', async () => {
    instalarCamara(async () => ({ getTracks: () => [] }));
    const { leidos, elemento } = await montar();
    boton(elemento, 'Activar cámara').click();
    await vi.advanceTimersByTimeAsync(0);

    enCamara = 'AAAAAAAAAAAAAAAAAAAA';
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_LECTURA_MS);
    enCamara = null;
    await vi.advanceTimersByTimeAsync(PAUSA_MISMO_CODIGO_MS + INTERVALO_DE_LECTURA_MS);
    enCamara = 'AAAAAAAAAAAAAAAAAAAA';
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_LECTURA_MS);

    expect(leidos).toEqual(['AAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAA']);
  });

  it('al apagar corta la cámara y deja de leer', async () => {
    const pista = pistaFalsa();
    instalarCamara(async () => ({ getTracks: () => [pista] }));
    const { fixture, leidos, elemento } = await montar();
    boton(elemento, 'Activar cámara').click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    boton(elemento, 'Apagar cámara').click();
    enCamara = 'AAAAAAAAAAAAAAAAAAAA';
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_LECTURA_MS * 3);

    expect(pista.stop).toHaveBeenCalled();
    expect(leidos).toEqual([]);
  });

  it('al salir de la pantalla apaga la cámara', async () => {
    const pista = pistaFalsa();
    instalarCamara(async () => ({ getTracks: () => [pista] }));
    const { fixture, elemento } = await montar();
    boton(elemento, 'Activar cámara').click();
    await vi.advanceTimersByTimeAsync(0);

    fixture.destroy();

    expect(pista.stop).toHaveBeenCalled();
  });

  it('con el permiso negado lo dice y remite al código a mano', async () => {
    instalarCamara(async () => {
      throw new DOMException('negado', 'NotAllowedError');
    });
    const { fixture, elemento } = await montar();

    boton(elemento, 'Activar cámara').click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(elemento.textContent).toContain('no dio permiso');
    expect(elemento.textContent).toContain('código a mano');
  });

  it('sin cámara en el navegador (por ejemplo sin HTTPS) remite al código a mano', async () => {
    const { fixture, elemento } = await montar();

    boton(elemento, 'Activar cámara').click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(elemento.textContent).toContain('Ingresá el código a mano');
  });
});
