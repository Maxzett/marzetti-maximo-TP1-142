import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Pelicula, Puntaje, Resena } from '../../core/models/pelicula';
import { Auth } from '../../core/services/auth';
import { Catalogo } from '../../core/services/catalogo';
import { Resenas } from '../../core/services/resenas';
import { PeliculaDetalle } from './pelicula-detalle';

const PELICULA: Pelicula = {
  id: 'p1',
  titulo: 'Mar de cenizas',
  sinopsis: 'Una piloto de rescate cruza un océano en llamas.',
  poster_url: null,
  duracion_minutos: 131,
  restriccion_edad: 13,
  fecha_estreno: null,
  destacada: true,
  precio_preventa: null,
  generos: [
    { id: 'g1', nombre: 'Acción', slug: 'accion' },
    { id: 'g2', nombre: 'Ciencia ficción', slug: 'ciencia-ficcion' },
  ],
};

const DE_OTRA: Resena = {
  id: 'r-otra',
  estrellas: 4,
  comentario: 'Muy entretenida',
  creado_at: '2026-09-10T15:00:00Z',
  autor: 'Ana G.',
  es_propia: false,
};

const PROPIA: Resena = {
  id: 'r-mia',
  estrellas: 5,
  comentario: 'La mejor del año',
  creado_at: '2026-09-12T15:00:00Z',
  autor: 'Maxi M.',
  es_propia: true,
};

interface Escenario {
  pelicula?: Pelicula | null;
  resenas?: Resena[] | null;
  puntaje?: Puntaje;
  conSesion?: boolean;
  errorAlGuardar?: string | null;
}

describe('PeliculaDetalle', () => {
  let fixture: ComponentFixture<PeliculaDetalle>;
  let catalogo: {
    cargarPelicula: ReturnType<typeof vi.fn>;
    cargarPuntajes: ReturnType<typeof vi.fn>;
  };
  let resenas: {
    deLaPelicula: ReturnType<typeof vi.fn>;
    guardar: ReturnType<typeof vi.fn>;
    borrar: ReturnType<typeof vi.fn>;
  };

  /**
   * El componente carga en un effect y encadena promesas propias (película, después reseñas).
   * fixture.whenStable() solo espera lo que Angular conoce, y termina antes de que la última
   * respuesta vuelva y se redibuje: por eso se cede un turno más y se vuelve a estabilizar.
   */
  async function estabilizar() {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function crear(escenario: Escenario = {}) {
    const { pelicula = PELICULA, puntaje } = escenario;
    const lista = escenario.resenas === undefined ? [DE_OTRA] : escenario.resenas;

    catalogo = {
      cargarPelicula: vi.fn(async () => pelicula),
      cargarPuntajes: vi.fn(async () => new Map(puntaje ? [[puntaje.pelicula_id, puntaje]] : [])),
    };
    resenas = {
      deLaPelicula: vi.fn(async () => lista),
      guardar: vi.fn(async () => escenario.errorAlGuardar ?? null),
      borrar: vi.fn(async () => null),
    };

    await TestBed.configureTestingModule({
      imports: [PeliculaDetalle],
      providers: [
        provideRouter([]),
        { provide: Catalogo, useValue: catalogo },
        { provide: Resenas, useValue: resenas },
        { provide: Auth, useValue: { haySesion: signal(escenario.conSesion ?? false) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PeliculaDetalle);
    fixture.componentRef.setInput('id', 'p1');
    await estabilizar();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const formulario = () => raiz().querySelector<HTMLFormElement>('form');
  const texto = () => raiz().textContent ?? '';

  async function elegirEstrellas(cantidad: number) {
    raiz().querySelectorAll<HTMLButtonElement>('[role="radio"]')[cantidad - 1].click();
    await estabilizar();
  }

  async function escribirComentario(valor: string) {
    const area = raiz().querySelector('textarea')!;
    area.value = valor;
    area.dispatchEvent(new Event('input'));
    await estabilizar();
  }

  async function enviar() {
    formulario()!.dispatchEvent(new Event('submit', { cancelable: true }));
    await estabilizar();
  }

  const boton = (etiqueta: string) =>
    Array.from(raiz().querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes(etiqueta),
    );

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('la película', () => {
    it('muestra título, duración, sinopsis y géneros', async () => {
      await crear();

      expect(raiz().querySelector('h1')?.textContent).toBe('Mar de cenizas');
      expect(texto()).toContain('131 min');
      expect(texto()).toContain('Una piloto de rescate');
      expect(texto()).toContain('Acción');
      expect(texto()).toContain('Ciencia ficción');
    });

    it('pide la película por el id de la ruta', async () => {
      await crear();

      expect(catalogo.cargarPelicula).toHaveBeenCalledWith('p1');
    });

    it('pone el nombre de la película en el título de la pestaña', async () => {
      await crear();

      expect(TestBed.inject(Title).getTitle()).toBe('Mar de cenizas · Cine Emezeta');
    });

    it('muestra el promedio y la cantidad de reseñas (RF-11)', async () => {
      await crear({ puntaje: { pelicula_id: 'p1', promedio: 4.5, cantidad: 8 } });

      const puntaje = raiz().querySelector('.datos [role="img"]');
      expect(puntaje?.getAttribute('aria-label')).toBe('Puntaje 4,5 de 5, 8 reseñas');
    });

    it('sin reseñas dice "Sin reseñas" en el puntaje', async () => {
      await crear();

      expect(raiz().querySelector('.datos .sin-resenas')?.textContent).toBe('Sin reseñas');
    });

    it('reserva el lugar de las funciones, que llegan en la F5', async () => {
      await crear();

      expect(texto()).toContain('Funciones y entradas');
    });
  });

  describe('restricción de edad (RF-28, RF-29)', () => {
    it('avisa antes de la compra que hace falta un adulto acompañante', async () => {
      await crear();

      const aviso = raiz().querySelector('.datos app-mensaje')?.textContent ?? '';
      expect(aviso).toContain('mayores de 13 años');
      expect(aviso).toContain('acompañado por un adulto');
    });

    it('con +18 dice 18', async () => {
      await crear({ pelicula: { ...PELICULA, restriccion_edad: 18 } });

      expect(raiz().querySelector('.datos app-mensaje')?.textContent).toContain('mayores de 18');
      expect(raiz().querySelector('.edad--mayores')).not.toBeNull();
    });

    it('una película sin restricción no muestra el aviso', async () => {
      await crear({ pelicula: { ...PELICULA, restriccion_edad: 0 } });

      expect(raiz().querySelector('.datos app-mensaje')).toBeNull();
      expect(raiz().querySelector('.edad')?.textContent).toContain('ATP');
    });
  });

  describe('estados', () => {
    it('una película que no existe lo dice y ofrece volver', async () => {
      await crear({ pelicula: null });

      expect(texto()).toContain('No pudimos encontrar esta película');
      expect(raiz().querySelector('a[href="/peliculas"]')).not.toBeNull();
      // Sin película no tiene sentido ir a buscar sus reseñas
      expect(resenas.deLaPelicula).not.toHaveBeenCalled();
    });

    it('muestra un spinner mientras carga', async () => {
      catalogo = {
        cargarPelicula: vi.fn(() => new Promise<Pelicula>(() => {})),
        cargarPuntajes: vi.fn(),
      };
      await TestBed.configureTestingModule({
        imports: [PeliculaDetalle],
        providers: [
          provideRouter([]),
          { provide: Catalogo, useValue: catalogo },
          { provide: Resenas, useValue: {} },
          { provide: Auth, useValue: { haySesion: signal(false) } },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(PeliculaDetalle);
      fixture.componentRef.setInput('id', 'p1');
      fixture.detectChanges();

      expect(raiz().querySelector('app-spinner')).not.toBeNull();
    });

    it('carga la película nueva cuando cambia el id sin salir de la ruta', async () => {
      await crear();

      fixture.componentRef.setInput('id', 'p2');
      await estabilizar();

      expect(catalogo.cargarPelicula).toHaveBeenLastCalledWith('p2');
    });
  });

  describe('las reseñas son visibles para todos (RF-10)', () => {
    it('lista autor, comentario y estrellas de cada una', async () => {
      await crear({ resenas: [DE_OTRA] });

      const item = raiz().querySelector('.resena');
      expect(item?.textContent).toContain('Ana G.');
      expect(item?.textContent).toContain('Muy entretenida');
      expect(item?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
        'Puntaje 4,0 de 5',
      );
    });

    it('escribe la fecha en castellano', async () => {
      await crear({ resenas: [DE_OTRA] });

      expect(raiz().querySelector('.resena time')?.textContent).toContain('septiembre');
    });

    it('una reseña sin comentario muestra solo las estrellas', async () => {
      await crear({ resenas: [{ ...DE_OTRA, comentario: '' }] });

      expect(raiz().querySelector('.comentario')).toBeNull();
    });

    it('sin reseñas lo dice', async () => {
      await crear({ resenas: [] });

      expect(texto()).toContain('Todavía nadie dejó su reseña');
    });

    // Una lista que no se pudo leer no es lo mismo que una película sin reseñas
    it('si no se pudieron leer avisa, en vez de decir que no hay', async () => {
      await crear({ resenas: null });

      expect(texto()).toContain('No pudimos cargar las reseñas');
      expect(texto()).not.toContain('Todavía nadie');
    });

    it('la propia lleva la marca "Tu reseña", escrita', async () => {
      await crear({ conSesion: true, resenas: [PROPIA, DE_OTRA] });

      const propias = raiz().querySelectorAll('.resena--propia');
      expect(propias).toHaveLength(1);
      expect(propias[0].textContent).toContain('Tu reseña');
    });
  });

  describe('sin sesión', () => {
    it('invita a ingresar o crear una cuenta y no muestra el formulario', async () => {
      await crear({ conSesion: false });

      expect(formulario()).toBeNull();
      expect(raiz().querySelector('a[href="/ingresar"]')).not.toBeNull();
      expect(raiz().querySelector('a[href="/registrarme"]')).not.toBeNull();
    });
  });

  describe('con sesión, sin reseña propia', () => {
    it('muestra el formulario con el radiogroup de estrellas y el comentario', async () => {
      await crear({ conSesion: true });

      expect(formulario()).not.toBeNull();
      expect(raiz().querySelectorAll('form [role="radio"]')).toHaveLength(5);
      expect(raiz().querySelector('form textarea')).not.toBeNull();
      expect(texto()).toContain('Dejá tu reseña');
    });

    it('guarda con las estrellas y el comentario, como reseña nueva', async () => {
      await crear({ conSesion: true });

      await elegirEstrellas(4);
      await escribirComentario('Muy buena');
      await enviar();

      expect(resenas.guardar).toHaveBeenCalledWith(
        'p1',
        { estrellas: 4, comentario: 'Muy buena' },
        null,
      );
    });

    it('al guardar recarga las reseñas y el promedio, y avisa', async () => {
      await crear({ conSesion: true });
      expect(resenas.deLaPelicula).toHaveBeenCalledTimes(1);

      await elegirEstrellas(5);
      await enviar();

      expect(resenas.deLaPelicula).toHaveBeenCalledTimes(2);
      expect(catalogo.cargarPuntajes).toHaveBeenCalledTimes(2);
      expect(texto()).toContain('Guardamos tu reseña');
    });

    it('muestra el error que devuelve el servicio y deja el formulario para corregir', async () => {
      await crear({ conSesion: true, errorAlGuardar: 'Elegí de 1 a 5 estrellas.' });

      await enviar();

      // Dentro de las reseñas: arriba de todo hay otro mensaje, el aviso de edad
      expect(raiz().querySelector('.resenas app-mensaje')?.textContent).toContain(
        'Elegí de 1 a 5 estrellas.',
      );
      expect(formulario()).not.toBeNull();
      // No recargó: no se guardó nada
      expect(resenas.deLaPelicula).toHaveBeenCalledTimes(1);
    });

    it('frena el envío nativo del formulario', async () => {
      await crear({ conSesion: true });
      const evento = new Event('submit', { cancelable: true });

      formulario()!.dispatchEvent(evento);

      expect(evento.defaultPrevented).toBe(true);
    });
  });

  describe('con sesión y reseña propia', () => {
    // jsdom no implementa <dialog>.showModal(): el diálogo se apoya en el del navegador,
    // así que acá se le da una versión mínima para poder abrirlo y cerrarlo
    beforeEach(() => {
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    });

    it('no muestra el formulario: una reseña por persona y por película', async () => {
      await crear({ conSesion: true, resenas: [PROPIA] });

      expect(formulario()).toBeNull();
      expect(texto()).toContain('Ya dejaste tu reseña');
    });

    it('"Editar" abre el formulario con la reseña cargada', async () => {
      await crear({ conSesion: true, resenas: [PROPIA] });

      boton('Editar mi reseña')!.click();
      await estabilizar();

      expect(formulario()).not.toBeNull();
      expect(texto()).toContain('Corregí tu reseña');
      expect(raiz().querySelector('textarea')?.value).toBe('La mejor del año');
      const marcada = raiz().querySelector('form [aria-checked="true"]');
      expect(marcada?.getAttribute('aria-label')).toBe('5 estrellas');
    });

    it('al guardar la corrección manda el id de la reseña existente', async () => {
      await crear({ conSesion: true, resenas: [PROPIA] });
      boton('Editar mi reseña')!.click();
      await estabilizar();

      await elegirEstrellas(3);
      await enviar();

      expect(resenas.guardar).toHaveBeenCalledWith(
        'p1',
        { estrellas: 3, comentario: 'La mejor del año' },
        'r-mia',
      );
    });

    it('"Cancelar" cierra el formulario sin guardar', async () => {
      await crear({ conSesion: true, resenas: [PROPIA] });
      boton('Editar mi reseña')!.click();
      await estabilizar();

      boton('Cancelar')!.click();
      await estabilizar();

      expect(formulario()).toBeNull();
      expect(resenas.guardar).not.toHaveBeenCalled();
    });

    it('borrar pide confirmación antes de tocar la base', async () => {
      await crear({ conSesion: true, resenas: [PROPIA] });

      boton('Borrar')!.click();
      await estabilizar();

      expect(raiz().querySelector('app-dialogo h2')?.textContent).toContain('¿Borrar tu reseña?');
      expect(resenas.borrar).not.toHaveBeenCalled();
    });

    it('confirmar el borrado borra la reseña propia y recarga', async () => {
      await crear({ conSesion: true, resenas: [PROPIA] });
      boton('Borrar')!.click();
      await estabilizar();

      boton('Borrar reseña')!.click();
      await estabilizar();

      expect(resenas.borrar).toHaveBeenCalledWith('r-mia');
      expect(resenas.deLaPelicula).toHaveBeenCalledTimes(2);
      expect(texto()).toContain('Borramos tu reseña');
    });
  });
});
