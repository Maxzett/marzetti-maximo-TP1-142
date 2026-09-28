import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NOTIFICADOR, PermisoDeNotificacion } from '../../core/alertas/notificacion';
import { Alertas } from '../../core/services/alertas';
import { Auth } from '../../core/services/auth';
import { BotonAlerta } from './boton-alerta';

interface Escenario {
  conSesion?: boolean;
  activa?: boolean;
  permiso?: PermisoDeNotificacion;
  permisoTrasPedir?: PermisoDeNotificacion;
  error?: string | null;
}

async function montar({
  conSesion = true,
  activa = false,
  permiso = 'concedido',
  permisoTrasPedir = permiso,
  error = null,
}: Escenario = {}) {
  let permisoActual = permiso;
  const conAlerta = signal(new Set(activa ? ['p1'] : []));
  const alertas = {
    peliculasConAlerta: conAlerta,
    activar: vi.fn(async () => {
      if (!error) conAlerta.set(new Set(['p1']));
      return error;
    }),
    desactivar: vi.fn(async () => {
      conAlerta.set(new Set());
      return null;
    }),
  };
  const notificador = {
    permiso: vi.fn(() => permisoActual),
    pedirPermiso: vi.fn(async () => (permisoActual = permisoTrasPedir)),
    mostrar: vi.fn(async () => true),
  };

  await TestBed.configureTestingModule({
    imports: [BotonAlerta],
    providers: [
      provideRouter([]),
      { provide: Auth, useValue: { haySesion: signal(conSesion) } },
      { provide: Alertas, useValue: alertas },
      { provide: NOTIFICADOR, useValue: notificador },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(BotonAlerta);
  fixture.componentRef.setInput('pelicula', { id: 'p1', titulo: 'Cielo de papel' });
  await fixture.whenStable();

  const raiz = fixture.nativeElement as HTMLElement;
  const boton = () => raiz.querySelector('button') as HTMLButtonElement;
  const tocar = async () => {
    boton().click();
    await fixture.whenStable();
  };
  return { raiz, boton, tocar, alertas, notificador };
}

describe('BotonAlerta', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sin sesión lleva a ingresar', async () => {
    const { raiz } = await montar({ conSesion: false });

    expect(raiz.querySelector('button')).toBeNull();
    expect(raiz.querySelector('a')?.getAttribute('href')).toBe('/ingresar');
  });

  it('es un botón de dos estados con el nombre fijo', async () => {
    const { boton, tocar } = await montar();

    expect(boton().getAttribute('aria-pressed')).toBe('false');
    await tocar();
    expect(boton().getAttribute('aria-pressed')).toBe('true');
    expect(boton().textContent).toContain('Te avisamos');
    expect(boton().getAttribute('aria-label')).toBe(
      'Avisame cuando salga a la venta Cielo de papel',
    );
  });

  it('pide permiso de notificación la primera vez, desde el gesto', async () => {
    const { tocar, notificador, alertas } = await montar({
      permiso: 'sin-preguntar',
      permisoTrasPedir: 'concedido',
    });

    await tocar();

    expect(notificador.pedirPermiso).toHaveBeenCalledOnce();
    expect(alertas.activar).toHaveBeenCalledWith({ id: 'p1', titulo: 'Cielo de papel' });
  });

  it('si niega el permiso, avisa que el aviso llega dentro de la app', async () => {
    const { raiz, tocar } = await montar({ permiso: 'sin-preguntar', permisoTrasPedir: 'negado' });

    await tocar();

    expect(raiz.textContent).toContain('acá, en la app');
  });

  it('activada, al tocarla se quita', async () => {
    const { tocar, alertas, notificador } = await montar({ activa: true });

    await tocar();

    expect(alertas.desactivar).toHaveBeenCalledWith('p1');
    expect(notificador.pedirPermiso).not.toHaveBeenCalled();
  });

  it('muestra el error de la base', async () => {
    const { raiz, tocar } = await montar({
      error: 'Las entradas de esta película ya están a la venta.',
    });

    await tocar();

    expect(raiz.querySelector('[role="alert"]')?.textContent).toContain('ya están a la venta');
  });
});
