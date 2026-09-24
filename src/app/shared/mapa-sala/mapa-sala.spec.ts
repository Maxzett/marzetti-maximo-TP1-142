import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EstadoDeButaca } from '../../core/models/orden';
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

describe('MapaSala seleccionable', () => {
  afterEach(() => TestBed.resetTestingModule());

  function crearSeleccionable(estados: Map<string, EstadoDeButaca> = new Map()) {
    const butacas = salaDeMuestra();
    const fixture = TestBed.createComponent(MapaSala);
    const elegidas: Butaca[] = [];
    fixture.componentInstance.elegida.subscribe((b) => elegidas.push(b));
    fixture.componentRef.setInput('butacas', butacas);
    fixture.componentRef.setInput('seleccionable', true);
    fixture.componentRef.setInput('estados', estados);
    fixture.detectChanges();
    const botones = () =>
      [...fixture.nativeElement.querySelectorAll('button.celda')] as HTMLElement[];
    return { fixture, butacas, elegidas, botones };
  }

  it('cada ubicación es un botón con nombre accesible completo', () => {
    const { botones, butacas } = crearSeleccionable();
    expect(botones()).toHaveLength(532);

    const vip = butacas.find((b) => b.tipo === 'vip')!;
    const boton = botones().find((b) => b.dataset['id'] === vip.id)!;
    expect(boton.getAttribute('aria-label')).toBe(
      `Fila ${vip.fila}, butaca ${vip.numero}, VIP, libre`,
    );
  });

  it('los espacios de silla de ruedas se nombran como espacio, no como butaca', () => {
    const { botones, butacas } = crearSeleccionable();
    const silla = butacas.find((b) => b.tipo === 'silla_ruedas')!;
    const boton = botones().find((b) => b.dataset['id'] === silla.id)!;
    expect(boton.getAttribute('aria-label')).toContain('espacio');
  });

  it('solo un botón entra en el orden de Tab', () => {
    const { botones } = crearSeleccionable();
    expect(botones().filter((b) => b.tabIndex === 0)).toHaveLength(1);
  });

  it('elegir una butaca libre emite esa butaca', () => {
    const { botones, butacas, elegidas } = crearSeleccionable();
    botones()[3].click();
    expect(elegidas).toEqual([butacas.find((b) => b.id === botones()[3].dataset['id'])]);
  });

  it('las vendidas y las reservadas por otro quedan con aria-disabled pero siguen enfocables', () => {
    const base = salaDeMuestra();
    const estados = new Map<string, EstadoDeButaca>([
      [base[0].id, 'ocupada'],
      [base[1].id, 'retenida'],
    ]);
    const fixture = TestBed.createComponent(MapaSala);
    const elegidas: Butaca[] = [];
    fixture.componentInstance.elegida.subscribe((b) => elegidas.push(b));
    fixture.componentRef.setInput('butacas', base);
    fixture.componentRef.setInput('seleccionable', true);
    fixture.componentRef.setInput('estados', estados);
    fixture.detectChanges();

    const botones = [...fixture.nativeElement.querySelectorAll('button.celda')] as HTMLElement[];
    const vendida = botones.find((b) => b.dataset['id'] === base[0].id)!;
    const otra = botones.find((b) => b.dataset['id'] === base[1].id)!;

    expect(vendida.getAttribute('aria-disabled')).toBe('true');
    expect(vendida.hasAttribute('disabled')).toBe(false);
    expect(vendida.getAttribute('aria-label')).toContain('vendida');
    expect(otra.getAttribute('aria-label')).toContain('otra persona');

    vendida.click();
    otra.click();
    expect(elegidas).toHaveLength(0);
  });

  it('la elegida por uno mismo se marca como presionada y se puede soltar', () => {
    const base = salaDeMuestra();
    const fixture = TestBed.createComponent(MapaSala);
    const elegidas: Butaca[] = [];
    fixture.componentInstance.elegida.subscribe((b) => elegidas.push(b));
    fixture.componentRef.setInput('butacas', base);
    fixture.componentRef.setInput('seleccionable', true);
    fixture.componentRef.setInput(
      'estados',
      new Map<string, EstadoDeButaca>([[base[5].id, 'propia']]),
    );
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(`[data-id="${base[5].id}"]`) as HTMLElement;
    expect(boton.getAttribute('aria-pressed')).toBe('true');

    boton.click();
    expect(elegidas).toEqual([base[5]]);
  });

  it('las flechas mueven el foco dentro de la fila y entre filas', () => {
    const base = salaDeMuestra();
    const fixture = TestBed.createComponent(MapaSala);
    fixture.componentRef.setInput('butacas', base);
    fixture.componentRef.setInput('seleccionable', true);
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);

    const botones = [...fixture.nativeElement.querySelectorAll('button.celda')] as HTMLElement[];
    botones[0].focus();
    botones[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(botones[1]);

    botones[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(botones[0]);

    const antes = document.activeElement as HTMLElement;
    antes.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const despues = document.activeElement as HTMLElement;
    expect(despues.getAttribute('aria-label')).toContain('Fila B');

    fixture.nativeElement.remove();
  });

  it('en modo lectura no hay botones y el plano sigue siendo una imagen', () => {
    const fixture = TestBed.createComponent(MapaSala);
    fixture.componentRef.setInput('butacas', salaDeMuestra());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
  });
});
