import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Funcion } from '../../core/models/sala';
import { Funciones } from '../../core/services/funciones';
import { ElegirFuncion } from './elegir-funcion';

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
    expect(texto(fixture)).toContain('todavía no tiene funciones programadas');
    expect(enlace(fixture)).toBeNull();
  });

  it('si la lectura falla lo avisa como un error, no como "no hay funciones"', async () => {
    const fixture = await montar(null);
    expect(texto(fixture)).toContain('No pudimos cargar las funciones');
  });

  it('con una sola función posible queda elegida y lleva a comprarla', async () => {
    const fixture = await montar([funcion('f1', '2030-10-05T21:00:00Z')]);

    expect(enlace(fixture)?.getAttribute('href')).toBe('/comprar/f1');
    expect(texto(fixture)).toContain('18:00');
  });

  it('dos funciones a la misma hora se distinguen por formato e idioma, y hay que elegir una', async () => {
    const fixture = await montar([
      funcion('f1', '2030-10-05T21:00:00Z'),
      funcion('f2', '2030-10-05T21:00:00Z', '3D', 'subtitulada'),
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
      funcion('f1', '2030-10-05T18:00:00Z'),
      funcion('f2', '2030-10-05T21:00:00Z'),
    ]);

    expect(enlace(fixture)).toBeNull();
    expect(texto(fixture)).toContain('Elegí un día y un horario');
  });
});
