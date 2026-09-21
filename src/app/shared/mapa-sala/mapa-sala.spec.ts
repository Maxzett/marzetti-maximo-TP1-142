import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Butaca } from '../../core/models/sala';
import { salaDeMuestra } from '../../core/salas/muestra';
import { MapaSala } from './mapa-sala';

function crear(butacas: readonly Butaca[], etiqueta?: string): ComponentFixture<MapaSala> {
  const fixture = TestBed.createComponent(MapaSala);
  fixture.componentRef.setInput('butacas', butacas);

  if (etiqueta) {
    fixture.componentRef.setInput('etiqueta', etiqueta);
  }

  fixture.detectChanges();
  return fixture;
}

describe('MapaSala', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('dibuja las 532 ubicaciones de la sala, una por butaca', () => {
    const fixture = crear(salaDeMuestra());
    const ubicaciones = fixture.nativeElement.querySelectorAll('.plano .ubicacion');

    expect(ubicaciones).toHaveLength(532);
  });

  it('dibuja las 20 filas, con sus letras de la A a la T', () => {
    const fixture = crear(salaDeMuestra());
    const letras = [...fixture.nativeElement.querySelectorAll('.fila')].map((fila) =>
      (fila as HTMLElement).querySelector('.letra')?.textContent?.trim(),
    );

    expect(letras.join('')).toBe('ABCDEFGHIJKLMNOPQRST');
  });

  it('cada tipo lleva su marca en data-tipo, que es lo que elige la silueta', () => {
    const fixture = crear(salaDeMuestra());
    const cuenta = (tipo: string) =>
      fixture.nativeElement.querySelectorAll(`.plano .ubicacion[data-tipo="${tipo}"]`).length;

    expect(cuenta('estandar')).toBe(420);
    expect(cuenta('silla_ruedas')).toBe(28);
    expect(cuenta('vip')).toBe(84);
  });

  it('el plano es una sola imagen con su descripción, no 532 elementos para el lector de pantalla', () => {
    const fixture = crear(salaDeMuestra(), 'la Sala 2');
    const plano: HTMLElement = fixture.nativeElement.querySelector('.plano');

    expect(plano.getAttribute('role')).toBe('img');
    expect(plano.getAttribute('aria-label')).toBe(
      'Mapa de la Sala 2: 532 ubicaciones en 20 filas. 420 butacas estándar, ' +
        '28 espacios para silla de ruedas (filas J y K) y 84 butacas VIP (filas R, S y T).',
    );
  });

  it('el contenedor se puede enfocar con el teclado, para desplazar un mapa más ancho que la pantalla', () => {
    const fixture = crear(salaDeMuestra());
    const region: HTMLElement = fixture.nativeElement.querySelector('.desplazable');

    expect(region.getAttribute('role')).toBe('region');
    expect(region.tabIndex).toBe(0);
    expect(region.getAttribute('aria-label')).toContain('Mapa de');
  });

  it('la leyenda dice en texto cuántas hay de cada tipo, sin depender del dibujo', () => {
    const fixture = crear(salaDeMuestra());
    const leyenda = (fixture.nativeElement.querySelector('.leyenda') as HTMLElement).textContent;

    expect(leyenda).toContain('Estándar');
    expect(leyenda).toContain('420');
    expect(leyenda).toContain('Silla de ruedas');
    expect(leyenda).toContain('28');
    expect(leyenda).toContain('VIP');
    expect(leyenda).toContain('84');
  });

  it('las filas J y K tienen 2, 10 y 2 espacios (D-01)', () => {
    const fixture = crear(salaDeMuestra());
    const filas: HTMLElement[] = [...fixture.nativeElement.querySelectorAll('.fila')];
    const fila = filas.find((f) => f.querySelector('.letra')?.textContent?.trim() === 'J')!;
    const bloques = [...fila.querySelectorAll('.bloque')].map(
      (bloque) => bloque.querySelectorAll('.ubicacion').length,
    );

    expect(bloques).toEqual([2, 10, 2]);
  });

  it('sin butacas avisa que la sala está vacía en vez de dibujar un cuadro en blanco', () => {
    const fixture = crear([]);
    const elemento: HTMLElement = fixture.nativeElement;

    expect(elemento.textContent).toContain('todavía no tiene butacas');
    expect(elemento.querySelector('.plano')).toBeNull();
  });
});
