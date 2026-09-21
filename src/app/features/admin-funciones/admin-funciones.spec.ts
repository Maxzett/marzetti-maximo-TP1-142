import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pelicula } from '../../core/models/pelicula';
import { Funcion, ResultadoModificacion, ResultadoProgramacion } from '../../core/models/sala';
import { Catalogo } from '../../core/services/catalogo';
import { Funciones } from '../../core/services/funciones';
import { AdminFunciones } from './admin-funciones';

const PELICULA = {
  id: 'p1',
  titulo: 'Noche de marquesina',
  duracion_minutos: 120,
} as Pelicula;

/** 21:00 UTC son las 18:00 de Buenos Aires */
const FUNCION: Funcion = {
  id: 'f1',
  pelicula_id: 'p1',
  sala_id: 's1',
  inicio: '2099-01-05T21:00:00Z',
  formato: '2D',
  idioma: 'castellano',
  precio_base: 6500,
  activa: true,
  pelicula: { titulo: 'Noche de marquesina', duracion_minutos: 120 },
  sala: { nombre: 'Sala 1' },
};

/** Lo que el administrador completa. Las fechas son fijas: la pantalla no las compara con hoy */
const FORMULARIO_VALIDO = {
  peliculaId: 'p1',
  desde: '2026-10-05',
  hasta: '2026-10-18',
  diasElegidos: [1, 2, 5],
  hora: '18:00',
  precio: '6500',
};

interface Escenario {
  funciones?: Funcion[] | null;
  peliculas?: Pelicula[] | null;
  alta?: ResultadoProgramacion;
  modificacion?: ResultadoModificacion;
  errorDeBaja?: string | null;
}

describe('AdminFunciones', () => {
  let fixture: ComponentFixture<AdminFunciones>;
  let servicio: {
    cargarProgramacion: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    modificar: ReturnType<typeof vi.fn>;
    darDeBaja: ReturnType<typeof vi.fn>;
  };

  /** El componente encadena promesas propias: se cede un turno más para que la última se dibuje */
  async function estabilizar() {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function crear(escenario: Escenario = {}) {
    const funciones = escenario.funciones === undefined ? [FUNCION] : escenario.funciones;
    const peliculas = escenario.peliculas === undefined ? [PELICULA] : escenario.peliculas;

    servicio = {
      cargarProgramacion: vi.fn(async () => funciones),
      crear: vi.fn(async () => escenario.alta ?? { estado: 'creadas', creadas: [] }),
      modificar: vi.fn(
        async () => escenario.modificacion ?? { estado: 'modificada', sala: 'Sala 1' },
      ),
      darDeBaja: vi.fn(async () => escenario.errorDeBaja ?? null),
    };

    // jsdom no implementa <dialog>.showModal(): se le da una versión mínima
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    await TestBed.configureTestingModule({
      imports: [AdminFunciones],
      providers: [
        { provide: Catalogo, useValue: { cargarTodas: vi.fn(async () => peliculas) } },
        { provide: Funciones, useValue: servicio },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminFunciones);
    await estabilizar();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const texto = () => raiz().textContent ?? '';

  /** Las señales del formulario son protected: los tests las fijan por la instancia */
  function llenar(valores: Record<string, unknown>) {
    const instancia = fixture.componentInstance as unknown as Record<
      string,
      WritableSignal<unknown>
    >;

    for (const [campo, valor] of Object.entries(valores)) {
      instancia[campo].set(valor);
    }
  }

  const boton = (contiene: string, dentro: ParentNode = raiz()) =>
    Array.from(dentro.querySelectorAll('button')).find((b) => b.textContent?.includes(contiene));

  const dialogos = () => Array.from(raiz().querySelectorAll('dialog'));

  async function programar() {
    const formulario = raiz().querySelector('form') as HTMLFormElement;
    formulario.dispatchEvent(new Event('submit', { cancelable: true }));
    await estabilizar();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('la agenda', () => {
    it('lista las próximas funciones con la sala que asignó el sistema', async () => {
      await crear();
      const fila = raiz().querySelector('tbody tr') as HTMLElement;

      expect(fila.textContent).toContain('Noche de marquesina');
      expect(fila.textContent).toContain('Sala 1');
      expect(fila.textContent).toContain('18:00');
      expect(fila.textContent).toContain('2D');
      expect(fila.textContent).toContain('Castellano');
    });

    it('sin funciones lo dice, no muestra una tabla vacía', async () => {
      await crear({ funciones: [] });

      expect(texto()).toContain('No hay funciones programadas');
      expect(raiz().querySelector('table')).toBeNull();
    });

    it('si la lectura falla lo dice, y no lo confunde con una agenda vacía', async () => {
      await crear({ funciones: null });

      expect(texto()).toContain('No pudimos cargar la programación');
      expect(texto()).not.toContain('No hay funciones programadas');
    });

    it('al filtrar por película vuelve a pedir la agenda de esa película', async () => {
      await crear();
      llenar({ filtroPelicula: 'p1' });
      await estabilizar();

      expect(servicio.cargarProgramacion).toHaveBeenLastCalledWith('p1');
    });
  });

  describe('programar', () => {
    it('no envía nada si falta completar, y dice qué falta', async () => {
      await crear();
      await programar();

      expect(servicio.crear).not.toHaveBeenCalled();
      expect(texto()).toContain('Elegí la película.');
      expect(texto()).toContain('Elegí al menos un día de la semana.');
      expect(texto()).toContain('Elegí el horario.');
      expect(texto()).toContain('Escribí el precio base.');
    });

    it('rechaza un período con la fecha final anterior a la inicial', async () => {
      await crear();
      llenar({ ...FORMULARIO_VALIDO, desde: '2026-10-18', hasta: '2026-10-05' });
      await programar();

      expect(servicio.crear).not.toHaveBeenCalled();
      expect(texto()).toContain('La fecha final no puede ser anterior a la inicial.');
    });

    it('rechaza un precio negativo', async () => {
      await crear();
      llenar({ ...FORMULARIO_VALIDO, precio: '-1' });
      await programar();

      expect(servicio.crear).not.toHaveBeenCalled();
      expect(texto()).toContain('El precio no puede ser negativo.');
    });

    it('acepta el precio escrito con coma', async () => {
      await crear();
      llenar({ ...FORMULARIO_VALIDO, precio: '6500,50' });
      await programar();

      expect(servicio.crear).toHaveBeenCalledWith(expect.objectContaining({ precioBase: 6500.5 }));
    });

    it('dice cuántas funciones se van a crear antes de enviar', async () => {
      await crear();
      // Lunes, martes y viernes entre el 5 y el 18 de octubre de 2026: seis fechas
      llenar(FORMULARIO_VALIDO);
      await estabilizar();

      const previa = raiz().querySelector('.previa') as HTMLElement;

      expect(previa.textContent).toContain('6');
      expect(previa.textContent).toContain('funciones');
      // 18:00 + 120 min de película + 30 de separación (RN-01)
      expect(previa.textContent).toContain('20:30');
    });

    it('avisa cuando la función termina de ocupar la sala pasada la medianoche', async () => {
      await crear();
      llenar({ ...FORMULARIO_VALIDO, hora: '23:00' });
      await estabilizar();

      expect(raiz().querySelector('.previa')?.textContent).toContain('del día siguiente');
    });

    it('manda película, período, días y horario a la base, y ninguna sala (RF-21)', async () => {
      await crear();
      llenar(FORMULARIO_VALIDO);
      await programar();

      expect(servicio.crear).toHaveBeenCalledWith({
        peliculaId: 'p1',
        desde: '2026-10-05',
        hasta: '2026-10-18',
        dias: [1, 2, 5],
        hora: '18:00',
        formato: '2D',
        idioma: 'castellano',
        precioBase: 6500,
      });
      expect(JSON.stringify(servicio.crear.mock.calls[0])).not.toContain('sala');
    });

    it('al salir bien muestra qué sala le tocó a cada función y recarga la agenda', async () => {
      await crear({
        alta: {
          estado: 'creadas',
          creadas: [
            { id: 'a', inicio: '2026-10-05T21:00:00Z', sala_id: 's1', sala: 'Sala 1' },
            { id: 'b', inicio: '2026-10-06T21:00:00Z', sala_id: 's1', sala: 'Sala 1' },
            { id: 'c', inicio: '2026-10-09T21:00:00Z', sala_id: 's2', sala: 'Sala 2' },
          ],
        },
      });
      llenar(FORMULARIO_VALIDO);
      await programar();

      const resultado = raiz().querySelector('.resultado') as HTMLElement;

      expect(resultado.textContent).toContain('Programamos 3 funciones');
      expect(resultado.textContent).toContain('Sala 1 (2)');
      expect(resultado.textContent).toContain('Sala 2 (1)');
      // Una carga al abrir y otra al terminar el alta
      expect(servicio.cargarProgramacion).toHaveBeenCalledTimes(2);
    });

    it('sin sala libre informa cuál fecha falló, que no se creó ninguna y qué horarios hay cerca', async () => {
      await crear({
        alta: {
          estado: 'sin_sala',
          conflictos: [
            {
              fecha: '2026-10-06',
              inicio: '2026-10-06T21:00:00Z',
              sugerencias: ['2026-10-06T22:00:00Z', '2026-10-06T20:00:00Z'],
            },
          ],
        },
      });
      llenar(FORMULARIO_VALIDO);
      await programar();

      const resultado = raiz().querySelector('.resultado') as HTMLElement;

      expect(resultado.textContent).toContain('No se creó ninguna función');
      expect(resultado.textContent).toContain('todo o nada');
      expect(resultado.textContent).toContain('martes, 6 de octubre de 2026');
      // Las sugerencias son botones con la hora del cine (21:00 y 19:00 UTC → 19:00 y 17:00)
      const sugerencias = Array.from(raiz().querySelectorAll('.sugerencia')).map((b) =>
        b.textContent?.trim(),
      );
      expect(sugerencias).toEqual(['19:00', '17:00']);
      // Con el alta rechazada no se recarga la agenda: no cambió nada
      expect(servicio.cargarProgramacion).toHaveBeenCalledTimes(1);
    });

    it('aplicar un horario sugerido cambia la hora y deja volver a programar', async () => {
      await crear({
        alta: {
          estado: 'sin_sala',
          conflictos: [
            {
              fecha: '2026-10-06',
              inicio: '2026-10-06T21:00:00Z',
              sugerencias: ['2026-10-06T22:00:00Z'],
            },
          ],
        },
      });
      llenar(FORMULARIO_VALIDO);
      await programar();

      (raiz().querySelector('.sugerencia') as HTMLButtonElement).click();
      await estabilizar();

      const instancia = fixture.componentInstance as unknown as Record<
        string,
        WritableSignal<unknown>
      >;
      expect(instancia['hora']()).toBe('19:00');
      // El resultado viejo ya no vale: se limpia y se avisa qué se cambió
      expect(raiz().querySelector('.resultado')).toBeNull();
      expect(texto()).toContain('Cambiamos el horario a las 19:00');
    });

    it('un error de la base se muestra tal cual', async () => {
      await crear({ alta: { estado: 'error', mensaje: 'La película no existe' } });
      llenar(FORMULARIO_VALIDO);
      await programar();

      expect(raiz().querySelector('.resultado')?.textContent).toContain('La película no existe');
    });

    it('frena el envío nativo del formulario', async () => {
      await crear();
      const evento = new Event('submit', { cancelable: true });

      raiz().querySelector('form')!.dispatchEvent(evento);

      expect(evento.defaultPrevented).toBe(true);
    });
  });

  describe('modificar', () => {
    async function abrir() {
      boton('Editar')!.click();
      await estabilizar();
    }

    it('abre el diálogo con los datos de la función, en la hora del cine', async () => {
      await crear();
      await abrir();

      const instancia = fixture.componentInstance as unknown as Record<
        string,
        WritableSignal<unknown>
      >;

      expect(dialogos()[0].hasAttribute('open')).toBe(true);
      expect(instancia['edFecha']()).toBe('2099-01-05');
      expect(instancia['edHora']()).toBe('18:00');
      expect(instancia['edPrecio']()).toBe('6500');
    });

    it('guarda el nuevo horario como instante en la hora del cine y avisa la sala en que quedó', async () => {
      await crear({ modificacion: { estado: 'modificada', sala: 'Sala 2' } });
      await abrir();
      llenar({ edHora: '20:00', edPrecio: '7000', edFormato: '3D' });

      boton('Guardar cambios', dialogos()[0])!.click();
      await estabilizar();

      expect(servicio.modificar).toHaveBeenCalledWith('f1', {
        inicio: '2099-01-05T20:00:00-03:00',
        formato: '3D',
        idioma: 'castellano',
        precioBase: 7000,
      });
      expect(dialogos()[0].hasAttribute('open')).toBe(false);
      expect(texto()).toContain('La función quedó en la Sala 2');
    });

    it('sin sala en el nuevo horario deja el diálogo abierto y ofrece horarios cercanos', async () => {
      await crear({
        modificacion: {
          estado: 'sin_sala',
          conflictos: [
            {
              fecha: '2099-01-05',
              inicio: '2099-01-05T23:00:00Z',
              sugerencias: ['2099-01-06T00:00:00Z'],
            },
          ],
        },
      });
      await abrir();
      llenar({ edHora: '20:00' });

      boton('Guardar cambios', dialogos()[0])!.click();
      await estabilizar();

      expect(dialogos()[0].hasAttribute('open')).toBe(true);
      expect(dialogos()[0].textContent).toContain('No hay sala libre en ese horario');
      expect(dialogos()[0].querySelector('.sugerencia')).not.toBeNull();
    });

    it('con entradas vendidas la base rechaza el cambio y el motivo se ve en el diálogo', async () => {
      const mensaje = 'La función tiene entradas vendidas: solo se puede cambiar el precio';
      await crear({ modificacion: { estado: 'error', mensaje } });
      await abrir();

      boton('Guardar cambios', dialogos()[0])!.click();
      await estabilizar();

      expect(dialogos()[0].textContent).toContain(mensaje);
      expect(dialogos()[0].hasAttribute('open')).toBe(true);
    });

    it('no llama a la base con un precio inválido', async () => {
      await crear();
      await abrir();
      llenar({ edPrecio: '' });

      boton('Guardar cambios', dialogos()[0])!.click();
      await estabilizar();

      expect(servicio.modificar).not.toHaveBeenCalled();
      expect(dialogos()[0].textContent).toContain('Escribí el precio base.');
    });
  });

  describe('dar de baja', () => {
    async function pedir() {
      boton('Dar de baja')!.click();
      await estabilizar();
    }

    it('pide confirmación antes de llamar a la base', async () => {
      await crear();
      await pedir();

      expect(dialogos()[1].hasAttribute('open')).toBe(true);
      expect(dialogos()[1].textContent).toContain('Noche de marquesina');
      expect(servicio.darDeBaja).not.toHaveBeenCalled();
    });

    it('al confirmar da de baja, avisa que la sala quedó libre y recarga la agenda', async () => {
      await crear();
      await pedir();

      boton('Dar de baja', dialogos()[1])!.click();
      await estabilizar();

      expect(servicio.darDeBaja).toHaveBeenCalledWith('f1');
      expect(dialogos()[1].hasAttribute('open')).toBe(false);
      expect(texto()).toContain('La Sala 1 quedó libre en ese horario');
      expect(servicio.cargarProgramacion).toHaveBeenCalledTimes(2);
    });

    it('con entradas vendidas la base la rechaza: el diálogo queda abierto con el motivo', async () => {
      const mensaje = 'La función tiene entradas vendidas y no se puede dar de baja';
      await crear({ errorDeBaja: mensaje });
      await pedir();

      boton('Dar de baja', dialogos()[1])!.click();
      await estabilizar();

      expect(dialogos()[1].hasAttribute('open')).toBe(true);
      expect(dialogos()[1].textContent).toContain(mensaje);
      // No se recargó: no cambió nada
      expect(servicio.cargarProgramacion).toHaveBeenCalledTimes(1);
    });

    it('cancelar cierra sin llamar a la base', async () => {
      await crear();
      await pedir();

      boton('Cancelar', dialogos()[1])!.click();
      await estabilizar();

      expect(servicio.darDeBaja).not.toHaveBeenCalled();
      expect(dialogos()[1].hasAttribute('open')).toBe(false);
    });
  });
});
