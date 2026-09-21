import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Estrellas } from './estrellas';

describe('Estrellas', () => {
  let fixture: ComponentFixture<Estrellas>;

  async function crear(entradas: Record<string, unknown>) {
    await TestBed.configureTestingModule({ imports: [Estrellas] }).compileComponents();

    fixture = TestBed.createComponent(Estrellas);
    for (const [nombre, valor] of Object.entries(entradas)) {
      fixture.componentRef.setInput(nombre, valor);
    }
    await fixture.whenStable();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const botones = () => Array.from(raiz().querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const valor = () => fixture.componentInstance.valor();

  function teclear(elemento: HTMLElement, key: string) {
    elemento.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('en lectura', () => {
    it('anuncia el puntaje y la cantidad de reseñas como una sola imagen', async () => {
      await crear({ valor: 4.5, cantidad: 12 });

      const imagen = raiz().querySelector('[role="img"]');
      expect(imagen?.getAttribute('aria-label')).toBe('Puntaje 4,5 de 5, 12 reseñas');
    });

    it('usa el singular con una sola reseña', async () => {
      await crear({ valor: 5, cantidad: 1 });

      expect(raiz().querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
        'Puntaje 5,0 de 5, 1 reseña',
      );
    });

    // RNF-10: el dato no depende del dibujo
    it('escribe el número al lado, con coma decimal', async () => {
      await crear({ valor: 3.5, cantidad: 4 });

      expect(raiz().textContent).toContain('3,5');
      expect(raiz().textContent).toContain('(4)');
    });

    it('recorta la fila llena al porcentaje del promedio', async () => {
      await crear({ valor: 4.5, cantidad: 2 });

      const llena = raiz().querySelector<HTMLElement>('.fila--llena');
      expect(llena?.style.width).toBe('90%');
    });

    it('acota un valor fuera de rango al ancho de la fila', async () => {
      await crear({ valor: 9, cantidad: 2 });

      expect(raiz().querySelector<HTMLElement>('.fila--llena')?.style.width).toBe('100%');
    });

    it('dibuja cinco estrellas en cada fila', async () => {
      await crear({ valor: 3, cantidad: 2 });

      expect(raiz().querySelectorAll('.fila--vacia svg')).toHaveLength(5);
      expect(raiz().querySelectorAll('.fila--llena svg')).toHaveLength(5);
    });

    it('con cero reseñas dice "Sin reseñas" en vez de dibujar estrellas vacías', async () => {
      await crear({ valor: 0, cantidad: 0 });

      expect(raiz().textContent).toContain('Sin reseñas');
      expect(raiz().querySelector('svg')).toBeNull();
    });

    it('sin cantidad muestra el puntaje sin el paréntesis', async () => {
      await crear({ valor: 4 });

      expect(raiz().querySelector('.cantidad')).toBeNull();
      expect(raiz().querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
        'Puntaje 4,0 de 5',
      );
    });

    it('no ofrece ningún control: es solo lectura', async () => {
      await crear({ valor: 4, cantidad: 2 });

      expect(botones()).toHaveLength(0);
    });
  });

  describe('en edición', () => {
    it('es un radiogroup con cinco opciones', async () => {
      await crear({ editable: true, etiqueta: 'Tu calificación' });

      const grupo = raiz().querySelector('[role="radiogroup"]');
      expect(grupo?.getAttribute('aria-label')).toBe('Tu calificación');
      expect(botones()).toHaveLength(5);
    });

    it('cada estrella dice cuántas son, con el singular de la primera', async () => {
      await crear({ editable: true });

      expect(botones().map((b) => b.getAttribute('aria-label'))).toEqual([
        '1 estrella',
        '2 estrellas',
        '3 estrellas',
        '4 estrellas',
        '5 estrellas',
      ]);
    });

    it('elegir una estrella la marca con aria-checked y la guarda en el modelo', async () => {
      await crear({ editable: true });

      botones()[2].click();
      await fixture.whenStable();

      expect(valor()).toBe(3);
      expect(botones().map((b) => b.getAttribute('aria-checked'))).toEqual([
        'false',
        'false',
        'true',
        'false',
        'false',
      ]);
    });

    it('rellena todas las estrellas hasta la elegida', async () => {
      await crear({ editable: true, valor: 3 });

      expect(botones().map((b) => b.classList.contains('estrella--llena'))).toEqual([
        true,
        true,
        true,
        false,
        false,
      ]);
    });

    it('anuncia lo elegido en una región de estado, con el número escrito', async () => {
      await crear({ editable: true, valor: 4 });

      expect(raiz().querySelector('[role="status"]')?.textContent).toContain('4 de 5');
    });

    it('con nada elegido lo dice', async () => {
      await crear({ editable: true });

      expect(raiz().querySelector('[role="status"]')?.textContent).toContain(
        'Todavía no elegiste estrellas',
      );
    });

    describe('teclado', () => {
      it('el grupo es una sola parada de Tab: solo la elegida tiene tabindex 0', async () => {
        await crear({ editable: true, valor: 3 });

        expect(botones().map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
      });

      it('con nada elegido, la parada de Tab es la primera', async () => {
        await crear({ editable: true });

        expect(botones().map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1]);
      });

      it('la flecha derecha elige la siguiente', async () => {
        await crear({ editable: true, valor: 2 });

        teclear(botones()[1], 'ArrowRight');
        await fixture.whenStable();

        expect(valor()).toBe(3);
      });

      it('la flecha izquierda elige la anterior', async () => {
        await crear({ editable: true, valor: 4 });

        teclear(botones()[3], 'ArrowLeft');
        await fixture.whenStable();

        expect(valor()).toBe(3);
      });

      it('arriba y abajo hacen lo mismo que derecha e izquierda', async () => {
        await crear({ editable: true, valor: 2 });

        teclear(botones()[1], 'ArrowUp');
        await fixture.whenStable();
        expect(valor()).toBe(3);

        teclear(botones()[2], 'ArrowDown');
        await fixture.whenStable();
        expect(valor()).toBe(2);
      });

      it('da la vuelta en los bordes, como un radiogroup nativo', async () => {
        await crear({ editable: true, valor: 5 });

        teclear(botones()[4], 'ArrowRight');
        await fixture.whenStable();
        expect(valor()).toBe(1);

        teclear(botones()[0], 'ArrowLeft');
        await fixture.whenStable();
        expect(valor()).toBe(5);
      });

      it('Home elige la primera y End la última', async () => {
        await crear({ editable: true, valor: 3 });

        teclear(botones()[2], 'End');
        await fixture.whenStable();
        expect(valor()).toBe(5);

        teclear(botones()[4], 'Home');
        await fixture.whenStable();
        expect(valor()).toBe(1);
      });

      // Con nada elegido el foco está en la primera: la derecha tiene que ir a la segunda
      it('parte de la estrella con foco y no de la elegida', async () => {
        await crear({ editable: true });

        teclear(botones()[0], 'ArrowRight');
        await fixture.whenStable();

        expect(valor()).toBe(2);
      });

      it('mueve el foco a la estrella elegida', async () => {
        await crear({ editable: true, valor: 2 });

        teclear(botones()[1], 'ArrowRight');
        await fixture.whenStable();

        expect(document.activeElement).toBe(botones()[2]);
      });

      it('no elige nada con una tecla que no es de navegación', async () => {
        await crear({ editable: true, valor: 2 });

        teclear(botones()[1], 'a');
        await fixture.whenStable();

        expect(valor()).toBe(2);
      });

      it('frena el scroll de la página con las flechas', async () => {
        await crear({ editable: true, valor: 2 });
        const evento = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        });

        botones()[1].dispatchEvent(evento);

        expect(evento.defaultPrevented).toBe(true);
      });
    });
  });
});
