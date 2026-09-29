import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { instanteDeFuncion } from '../../core/funciones/programacion';
import { Funcion } from '../../core/models/sala';
import { Funciones } from '../../core/services/funciones';
import { hoyIso, sumarDias } from '../../shared/selector-fecha/fechas';
import { ElegirFuncion } from './elegir-funcion';

/** Un instante a `dias` de hoy, a la hora del cine: la pantalla solo muestra la semana que viene */
const dentroDe = (dias: number, hora = '18:00') =>
  instanteDeFuncion(sumarDias(hoyIso(), dias), hora);

function funcion(id: string, inicio: string, formato = '2D', idioma = 'castellano'): Funcion {
  return {
    id,
    pelicula_id: 'p1',
    sala_id: 's1',
    inicio,
    formato,
    idioma,
    precio_base: 6500,
    activa: true,
    pelicula: { titulo: 'T', duracion_minutos: 100 },
    sala: { nombre: 'Sala 1' },
  } as Funcion;
}

async function montar(respuesta: Funcion[] | null): Promise<ComponentFixture<ElegirFuncion>> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: Funciones, useValue: { cargarProgramacion: vi.fn(async () => respuesta) } },
    ],
  });

  const fixture = TestBed.createComponent(ElegirFuncion);
  fixture.componentRef.setInput('peliculaId', 'p1');
  fixture.detectChanges();
  await asentar(fixture);
  return fixture;
}

/**
 * Deja resolver las promesas sueltas del componente (la carga que lanza un effect no es una
 * tarea pendiente de Angular, así que whenStable no la espera) y vuelve a pintar.
 */
async function asentar(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver, 0));
  fixture.detectChanges();
}

const texto = (f: ComponentFixture<ElegirFuncion>) =>
  (f.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
const enlace = (f: ComponentFixture<ElegirFuncion>) =>
  (f.nativeElement as HTMLElement).querySelector('a.boton') as HTMLAnchorElement | null;

describe('ElegirFuncion', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sin funciones lo dice, en vez de mostrar selectores vacíos', async () => {
    const fixture = await montar([]);
    expect(texto(fixture)).toContain('No hay funciones programadas');
    expect(enlace(fixture)).toBeNull();
  });

  it('si la lectura falla lo avisa como un error, no como "no hay funciones"', async () => {
    const fixture = await montar(null);
    expect(texto(fixture)).toContain('No pudimos cargar las funciones');
  });

  it('con una sola función posible queda elegida y lleva a comprarla', async () => {
    const fixture = await montar([funcion('f1', dentroDe(2))]);

    expect(enlace(fixture)?.getAttribute('href')).toBe('/comprar/f1');
    expect(texto(fixture)).toContain('18:00');
  });

  it('dos funciones a la misma hora se distinguen por formato e idioma, y hay que elegir una', async () => {
    const fixture = await montar([
      funcion('f1', dentroDe(2)),
      funcion('f2', dentroDe(2), '3D', 'subtitulada'),
    ]);

    expect(enlace(fixture)).toBeNull();
    expect(texto(fixture)).toContain('Formato e idioma');

    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    select.value = 'f2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(enlace(fixture)?.getAttribute('href')).toBe('/comprar/f2');
  });

  it('con varios horarios en el día hay que elegir uno antes de comprar', async () => {
    const fixture = await montar([
      funcion('f1', dentroDe(2, '15:00')),
      funcion('f2', dentroDe(2, '18:00')),
    ]);

    expect(enlace(fixture)).toBeNull();
    expect(texto(fixture)).toContain('Elegí un día y un horario');
  });

  describe('la semana que viene', () => {
    const chipsDe = (fixture: ComponentFixture<ElegirFuncion>, etiqueta: string) => {
      const grupo = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('app-chips-opcion'),
      ).find((g) => g.textContent?.includes(etiqueta));
      return grupo ? Array.from(grupo.querySelectorAll<HTMLButtonElement>('[role="radio"]')) : [];
    };

    it('ofrece hasta siete días desde hoy, aunque haya funciones más adelante', async () => {
      const fixture = await montar([
        funcion('f1', dentroDe(0, '23:00')),
        funcion('f2', dentroDe(7)),
        funcion('f3', dentroDe(8)),
        funcion('f4', dentroDe(20)),
      ]);

      const dias = chipsDe(fixture, 'Día de la función').map((b) => b.textContent?.trim());
      const [, mes, dia] = sumarDias(hoyIso(), 7).split('-');
      expect(dias).toHaveLength(2);
      expect(dias[1]).toContain(`${Number(dia)}/${Number(mes)}`);
    });

    it('si todas las funciones empiezan después, dice cuándo en vez de "no hay funciones"', async () => {
      const fixture = await montar([funcion('f1', dentroDe(12))]);

      expect(texto(fixture)).toContain('Las funciones de esta película empiezan el');
      expect(texto(fixture)).not.toContain('No hay funciones programadas');
      expect(enlace(fixture)).toBeNull();
    });
  });

  describe('filtros de formato e idioma', () => {
    const chipsDe = (fixture: ComponentFixture<ElegirFuncion>, etiqueta: string) => {
      const grupo = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('app-chips-opcion'),
      ).find((g) => g.querySelector('[id^="chips-opcion"]')?.textContent?.trim() === etiqueta);
      return grupo ? Array.from(grupo.querySelectorAll<HTMLButtonElement>('[role="radio"]')) : [];
    };
    const chip = (fixture: ComponentFixture<ElegirFuncion>, etiqueta: string, texto: string) =>
      chipsDe(fixture, etiqueta).find((b) => b.textContent?.includes(texto))!;

    const VARIADAS = () => [
      funcion('f1', dentroDe(1, '14:00'), '2D', 'castellano'),
      funcion('f2', dentroDe(1, '19:20'), '3D', 'subtitulada'),
      funcion('f3', dentroDe(2, '22:10'), '4D', 'subtitulada'),
    ];

    it('ofrecen solo lo que hay esa semana, con "Todos" elegido de entrada', async () => {
      const fixture = await montar(VARIADAS());

      expect(chipsDe(fixture, 'Formato').map((b) => b.textContent?.trim())).toEqual([
        'Todos',
        '2D',
        '3D',
        '4D',
      ]);
      expect(chipsDe(fixture, 'Idioma').map((b) => b.textContent?.trim())).toEqual([
        'Todos',
        'Castellano',
        'Subtitulada',
      ]);
      expect(chip(fixture, 'Formato', 'Todos').getAttribute('aria-checked')).toBe('true');
    });

    it('con una sola versión no muestran nada que elegir', async () => {
      const fixture = await montar([funcion('f1', dentroDe(1)), funcion('f2', dentroDe(2))]);

      expect(chipsDe(fixture, 'Formato')).toHaveLength(0);
      expect(chipsDe(fixture, 'Idioma')).toHaveLength(0);
    });

    it('filtrar deja solo los días y horarios de esa versión', async () => {
      const fixture = await montar(VARIADAS());

      chip(fixture, 'Idioma', 'Subtitulada').click();
      fixture.detectChanges();
      chip(fixture, 'Formato', '4D').click();
      fixture.detectChanges();

      // Queda una sola función: el día y el horario se eligen solos y lleva a comprarla
      expect(chipsDe(fixture, 'Día de la función')).toHaveLength(1);
      expect(enlace(fixture)?.getAttribute('href')).toBe('/comprar/f3');
    });

    it('una combinación sin funciones lo dice y ofrece volver a ver todas', async () => {
      const fixture = await montar(VARIADAS());

      chip(fixture, 'Formato', '2D').click();
      fixture.detectChanges();
      chip(fixture, 'Idioma', 'Subtitulada').click();
      fixture.detectChanges();

      expect(texto(fixture)).toContain('No hay funciones en 2D subtitulada');
      expect(enlace(fixture)).toBeNull();

      const verTodas = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ).find((b) => b.textContent?.includes('Ver todas las versiones'))!;
      verTodas.click();
      fixture.detectChanges();

      expect(chipsDe(fixture, 'Día de la función')).toHaveLength(2);
    });
  });
});
