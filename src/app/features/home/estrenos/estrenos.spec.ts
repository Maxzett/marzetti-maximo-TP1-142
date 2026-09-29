import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Pelicula } from '../../../core/models/pelicula';
import { Alertas } from '../../../core/services/alertas';
import { Auth } from '../../../core/services/auth';
import { Estrenos } from './estrenos';

const HOY = '2026-10-05';

function futura(titulo: string, estreno: string, preventa: number | null = null): Pelicula {
  return {
    id: titulo.toLowerCase(),
    titulo,
    sinopsis: 'Una sinopsis.',
    poster_url: null,
    duracion_minutos: 106,
    restriccion_edad: 13,
    fecha_estreno: estreno,
    destacada: false,
    precio_preventa: preventa,
    generos: [{ id: 'g1', nombre: 'Drama', slug: 'drama' }],
  };
}

describe('Estrenos', () => {
  let fixture: ComponentFixture<Estrenos>;

  async function crear(peliculas: Pelicula[]) {
    await TestBed.configureTestingModule({
      imports: [Estrenos],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: { haySesion: signal(false) } },
        { provide: Alertas, useValue: { peliculasConAlerta: signal(new Set<string>()) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Estrenos);
    fixture.componentRef.setInput('peliculas', peliculas);
    fixture.componentRef.setInput('hoy', HOY);
    await fixture.whenStable();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;

  afterEach(() => TestBed.resetTestingModule());

  it('dibuja la fecha como un taco de calendario y la dice completa al lector', async () => {
    await crear([futura('Marea', '2026-10-15')]);

    const taco = raiz().querySelector('.taco')!;
    expect(taco.querySelector('.taco__dia')?.textContent).toBe('Jue');
    expect(taco.querySelector('.taco__numero')?.textContent).toBe('15');
    expect(taco.querySelector('.taco__mes')?.textContent?.toLowerCase()).toBe('oct');
    expect(taco.querySelector('.solo-lectores')?.textContent).toContain('jueves 15 de octubre');
  });

  it('muestra géneros, duración en horas y el sello de edad', async () => {
    await crear([futura('Marea', '2026-10-15')]);

    expect(raiz().querySelector('.datos')?.textContent).toBe('Drama · 1 h 46 min');
    expect(raiz().querySelector('app-sello-edad .sello--13')).not.toBeNull();
  });

  it('si todavía no se vende, ofrece el aviso (RF-42)', async () => {
    await crear([futura('Marea', '2026-10-15')]);

    expect(raiz().querySelector('app-boton-alerta')).not.toBeNull();
    expect(raiz().querySelector('.venta')).toBeNull();
  });

  // En preventa ya se compra desde la ficha: el aviso no tiene nada que avisar
  it('en preventa dice el precio en vez del aviso', async () => {
    await crear([futura('Marea', '2026-10-08', 3500)]);

    expect(raiz().querySelector('app-boton-alerta')).toBeNull();
    expect(raiz().querySelector('.venta')?.textContent).toContain('En preventa');
  });

  it('un solo enlace por estreno, a la ficha de la película', async () => {
    await crear([futura('Marea', '2026-10-15')]);

    const enlaces = Array.from(raiz().querySelectorAll('h3 a'));
    expect(enlaces.map((a) => a.getAttribute('href'))).toEqual(['/peliculas/marea']);
  });
});
