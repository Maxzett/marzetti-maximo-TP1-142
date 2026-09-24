import { TestBed } from '@angular/core/testing';
import { formatearCuenta, segundosRestantes, Temporizador } from './temporizador';

describe('segundosRestantes y formatearCuenta', () => {
  const fin = '2026-10-05T18:10:00Z';

  it('cuenta hacia el vencimiento y no baja de cero', () => {
    expect(segundosRestantes(fin, Date.parse('2026-10-05T18:00:00Z'))).toBe(600);
    expect(segundosRestantes(fin, Date.parse('2026-10-05T18:20:00Z'))).toBe(0);
  });

  it('redondea hacia arriba: con 0,4 s de plazo todavía no venció', () => {
    expect(segundosRestantes(fin, Date.parse(fin) - 400)).toBe(1);
  });

  it('una fecha inválida no es un vencimiento', () => {
    expect(segundosRestantes('mañana', 0)).toBeNull();
  });

  it('escribe minutos sin cero adelante y segundos con dos cifras', () => {
    expect(formatearCuenta(545)).toBe('9:05');
    expect(formatearCuenta(42)).toBe('0:42');
    expect(formatearCuenta(600)).toBe('10:00');
  });
});

describe('Temporizador', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T18:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  function crear(expiraAt: string) {
    const fixture = TestBed.createComponent(Temporizador);
    const vencido = vi.fn();
    fixture.componentInstance.vencido.subscribe(vencido);
    fixture.componentRef.setInput('expiraAt', expiraAt);
    fixture.detectChanges();
    return { fixture, vencido };
  }

  const texto = (f: { nativeElement: HTMLElement }, selector: string) =>
    f.nativeElement.querySelector(selector)?.textContent?.trim();

  it('muestra el tiempo que falta y lo actualiza cada segundo', async () => {
    const { fixture } = crear('2026-10-05T18:10:00Z');
    expect(texto(fixture, '.tiempo')).toBe('10:00');

    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();
    expect(texto(fixture, '.tiempo')).toBe('9:55');
  });

  it('no molesta al lector de pantalla hasta el último minuto', async () => {
    const { fixture } = crear('2026-10-05T18:02:00Z');
    expect(texto(fixture, '[role="status"]')).toBe('');

    await vi.advanceTimersByTimeAsync(61_000);
    fixture.detectChanges();
    expect(texto(fixture, '[role="status"]')).toBe('Queda un minuto de reserva.');
  });

  it('al vencer avisa una sola vez', async () => {
    const { fixture, vencido } = crear('2026-10-05T18:00:03Z');
    expect(vencido).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    fixture.detectChanges();

    expect(vencido).toHaveBeenCalledTimes(1);
    expect(texto(fixture, '[role="status"]')).toBe('La reserva venció.');
  });

  it('deja de contar al destruirse', () => {
    const { fixture } = crear('2026-10-05T18:10:00Z');
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
