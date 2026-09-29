import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertaDeEstreno } from '../../core/models/alerta';
import { Pelicula } from '../../core/models/pelicula';
import { Alertas } from '../../core/services/alertas';
import { Auth } from '../../core/services/auth';
import { Catalogo } from '../../core/services/catalogo';
import { hoyIso, sumarDias } from '../../shared/selector-fecha/fechas';
import { Proximamente } from './proximamente';

const HOY = hoyIso();

function pelicula(id: string, dias: number, preventa: number | null = null): Pelicula {
  return {
    id,
    titulo: `Película ${id}`,
    sinopsis: '',
    poster_url: null,
    duracion_minutos: 100,
    restriccion_edad: 0,
    fecha_estreno: sumarDias(HOY, dias),
    destacada: false,
    precio_preventa: preventa,
    en_cartelera: false,
    generos: [],
  };
}

interface Escenario {
  proximas?: Pelicula[] | null;
  conSesion?: boolean;
  aLaVenta?: AlertaDeEstreno[];
}

async function montar({ proximas = [], conSesion = false, aLaVenta = [] }: Escenario = {}) {
  const alertas = {
    peliculasConAlerta: signal(new Set<string>()),
    aLaVenta: signal(aLaVenta),
    cargar: vi.fn(async () => undefined),
    marcarAvisadas: vi.fn(async () => undefined),
    desactivar: vi.fn(async () => null),
  };

  await TestBed.configureTestingModule({
    imports: [Proximamente],
    providers: [
      provideRouter([]),
      { provide: Catalogo, useValue: { cargarProximas: vi.fn(async () => proximas) } },
      { provide: Auth, useValue: { haySesion: signal(conSesion) } },
      { provide: Alertas, useValue: alertas },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Proximamente);
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  return { raiz: fixture.nativeElement as HTMLElement, alertas };
}

describe('Proximamente', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lista las próximas y ofrece el aviso solo a las que no se venden todavía', async () => {
    const { raiz } = await montar({
      proximas: [pelicula('preventa', 3, 3000), pelicula('lejana', 30)],
    });

    const fichas = raiz.querySelectorAll('app-ficha-proxima');
    expect(fichas.length).toBe(2);
    expect(fichas[0].querySelector('app-boton-alerta')).toBeNull();
    expect(fichas[1].querySelector('app-boton-alerta')).not.toBeNull();
  });

  it('sin estrenos anunciados lo dice', async () => {
    const { raiz } = await montar();

    expect(raiz.textContent).toContain('no hay estrenos anunciados');
  });

  it('si la base falla ofrece reintentar', async () => {
    const { raiz } = await montar({ proximas: null });

    expect(raiz.textContent).toContain('No pudimos cargar');
  });

  it('con sesión lista los avisos que ya salieron a la venta y los marca como vistos', async () => {
    const aviso: AlertaDeEstreno = {
      pelicula_id: 'a',
      notificada_at: null,
      creado_at: '2026-09-01T00:00:00Z',
      pelicula: {
        id: 'a',
        titulo: 'Ecos de medianoche',
        fecha_estreno: sumarDias(HOY, -1),
        precio_preventa: null,
        poster_url: null,
      },
    };
    const { raiz, alertas } = await montar({ conSesion: true, aLaVenta: [aviso] });

    expect(raiz.querySelector('#avisos')?.textContent).toContain('Ecos de medianoche');
    expect(raiz.querySelector('#avisos')?.textContent).toContain('Nuevo');
    expect(alertas.cargar).toHaveBeenCalled();
    expect(alertas.marcarAvisadas).toHaveBeenCalled();
  });

  it('sin sesión no muestra la sección de avisos', async () => {
    const { raiz, alertas } = await montar({ proximas: [pelicula('x', 30)] });

    expect(raiz.querySelector('#avisos')).toBeNull();
    expect(alertas.cargar).not.toHaveBeenCalled();
  });
});
