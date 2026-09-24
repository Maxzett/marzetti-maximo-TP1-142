import { Component, computed, signal } from '@angular/core';
import { NIVEL_AA, contraste } from '../../core/a11y/contraste';
import { EstadoDeButaca } from '../../core/models/orden';
import { Pelicula } from '../../core/models/pelicula';
import { Butaca } from '../../core/models/sala';
import { COLORES_DE_OJOS, TIPOS_DE_SANGRE } from '../../core/models/perfil';
import { salaDeMuestra } from '../../core/salas/muestra';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Chip } from '../../shared/chip/chip';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Estrellas } from '../../shared/estrellas/estrellas';
import { FichaPelicula } from '../../shared/ficha-pelicula/ficha-pelicula';
import { MapaSala } from '../../shared/mapa-sala/mapa-sala';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Poster } from '../../shared/poster/poster';
import { hoyIso } from '../../shared/selector-fecha/fechas';
import { SelectorFecha } from '../../shared/selector-fecha/selector-fecha';
import { SelectorHora } from '../../shared/selector-hora/selector-hora';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { Spinner } from '../../shared/spinner/spinner';
import { Tarjeta } from '../../shared/tarjeta/tarjeta';
import { Temporizador } from '../../shared/temporizador/temporizador';

/**
 * Catálogo vivo de los componentes de shared/. No es una pantalla del producto:
 * sirve para revisar estados y accesibilidad en un solo lugar, y para mostrarlos en la defensa.
 */
@Component({
  imports: [
    Boton,
    Campo,
    Chip,
    Dialogo,
    Estrellas,
    FichaPelicula,
    MapaSala,
    Mensaje,
    Poster,
    Seleccion,
    SelectorFecha,
    SelectorHora,
    Spinner,
    Tarjeta,
    Temporizador,
  ],
  selector: 'app-sistema',
  styleUrl: './sistema.css',
  templateUrl: './sistema.html',
})
export class Sistema {
  protected readonly mail = signal('');
  protected readonly mailInvalido = signal('maxi@');

  // Las listas del registro (RF-38): salen de los modelos, que son los mismos
  // valores que acepta el CHECK de la base
  protected readonly tipoSangre = signal('');
  protected readonly colorOjos = signal('');
  protected readonly opcionesSangre: readonly OpcionSeleccion[] = TIPOS_DE_SANGRE.map((valor) => ({
    valor,
    texto: valor,
  }));
  protected readonly opcionesOjos: readonly OpcionSeleccion[] = COLORES_DE_OJOS.map((valor) => ({
    valor,
    texto: valor.charAt(0).toUpperCase() + valor.slice(1),
  }));
  // Mapa de sala (F5): la distribución real de la base, armada en memoria
  protected readonly salaDeMuestra = salaDeMuestra();
  // Mapa seleccionable (F6): la primera butaca vendida, la segunda reservada por otra persona
  protected readonly estadosDeMuestra = signal<ReadonlyMap<string, EstadoDeButaca>>(
    new Map<string, EstadoDeButaca>([
      [this.salaDeMuestra[0].id, 'ocupada'],
      [this.salaDeMuestra[1].id, 'retenida'],
    ]),
  );
  protected readonly vencimientoDeMuestra = new Date(Date.now() + 10 * 60_000).toISOString();

  protected alternarDeMuestra(butaca: Butaca): void {
    const siguiente = new Map(this.estadosDeMuestra());

    if (siguiente.get(butaca.id) === 'propia') {
      siguiente.delete(butaca.id);
    } else {
      siguiente.set(butaca.id, 'propia');
    }

    this.estadosDeMuestra.set(siguiente);
  }

  protected readonly dialogoAbierto = signal(false);
  protected readonly procesando = signal(false);

  // Catálogo (F4): datos de muestra para ver el póster, las estrellas y la ficha en sus estados
  protected readonly calificacion = signal(0);
  protected readonly comentarioDeMuestra = signal('');
  protected readonly peliculasDeMuestra: readonly Pelicula[] = [
    {
      id: 'muestra-1',
      titulo: 'Mar de cenizas',
      sinopsis: '',
      poster_url: null,
      duracion_minutos: 131,
      restriccion_edad: 13,
      fecha_estreno: null,
      destacada: true,
      precio_preventa: null,
      generos: [
        { id: 'a', nombre: 'Acción', slug: 'accion' },
        { id: 'b', nombre: 'Ciencia ficción', slug: 'ciencia-ficcion' },
      ],
    },
    {
      id: 'muestra-2',
      titulo: 'La casa del lago seco',
      sinopsis: '',
      poster_url: null,
      duracion_minutos: 109,
      restriccion_edad: 18,
      fecha_estreno: null,
      destacada: false,
      precio_preventa: null,
      generos: [{ id: 'c', nombre: 'Terror', slug: 'terror' }],
    },
  ];

  // Los tres casos del RNF-08, con datos de ejemplo
  protected readonly fechaDeFuncion = signal('');
  protected readonly fechaDeNacimiento = signal('');
  protected readonly fechaDeAlta = signal('');
  protected readonly horarioDeFuncion = signal('');
  protected readonly horarioDeAlta = signal('');

  /** Días con función de "El último tren a Retiro", como los devolvería la base en la F5 */
  protected readonly diasConFuncion = [
    '2026-09-17',
    '2026-09-18',
    '2026-09-19',
    '2026-09-24',
    '2026-09-25',
    '2026-09-26',
  ];

  protected readonly horariosDelDia = ['18:40', '21:10', '23:30'];

  /** La fecha de nacimiento no puede ser futura (RF-38) */
  protected readonly hoy = hoyIso();

  /**
   * Los pares de color que la interfaz usa de verdad, con la superficie sobre la que se apoyan.
   * Es la misma tabla que verifica core/a11y/contraste.spec.ts en cada corrida de los tests;
   * acá se calcula en el navegador, leyendo los tokens ya resueltos, para poder mostrarla.
   */
  protected readonly contrastes = computed(() =>
    PARES_DE_COLOR.flatMap((par) => {
      const frente = this.token(par.frente);
      const fondo = this.token(par.fondo);

      // Sin hoja de estilos aplicada los tokens vienen vacíos: pasa en los tests, con jsdom
      if (!frente || !fondo) {
        return [];
      }

      const ratio = contraste(frente, fondo);
      return [{ ...par, frente, fondo, ratio, cumple: ratio >= par.umbral }];
    }),
  );

  /** Solo para ver el estado de carga del botón: no hay nada que enviar todavía */
  protected simularEnvio(): void {
    this.procesando.set(true);
    setTimeout(() => this.procesando.set(false), 1800);
  }

  /** El valor ya resuelto del token, tal como lo está pintando el navegador */
  private token(nombre: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  }
}

interface ParDeColor {
  que: string;
  frente: string;
  fondo: string;
  umbral: number;
  /** Qué pide WCAG para este par, en palabras, porque el número solo no se explica */
  regla: string;
}

const PARES_DE_COLOR: readonly ParDeColor[] = [
  {
    que: 'Texto de cuerpo sobre el fondo',
    frente: '--texto',
    fondo: '--fondo',
    umbral: NIVEL_AA.texto,
    regla: 'Texto normal',
  },
  {
    que: 'Metadato sobre una tarjeta',
    frente: '--texto-tenue',
    fondo: '--superficie',
    umbral: NIVEL_AA.texto,
    regla: 'Texto normal',
  },
  {
    que: 'Texto del botón primario',
    frente: '--texto-sobre-acento',
    fondo: '--acento',
    umbral: NIVEL_AA.texto,
    regla: 'Texto normal',
  },
  {
    que: 'Error de un campo',
    frente: '--rojo-claro',
    fondo: '--superficie',
    umbral: NIVEL_AA.texto,
    regla: 'Texto normal',
  },
  {
    que: 'Día sin función, que sigue siendo enfocable',
    frente: '--texto-tenue',
    fondo: '--superficie',
    umbral: NIVEL_AA.texto,
    regla: 'Texto normal',
  },
  {
    que: 'Anillo de foco sobre el fondo',
    frente: '--acento',
    fondo: '--fondo',
    umbral: NIVEL_AA.noTexto,
    regla: 'Indicador de foco',
  },
  {
    que: 'Borde de input y botón secundario',
    frente: '--borde-fuerte',
    fondo: '--fondo',
    umbral: NIVEL_AA.noTexto,
    regla: 'Borde de control',
  },
  {
    que: 'Borde punteado de "hoy"',
    frente: '--acento-hondo',
    fondo: '--superficie',
    umbral: NIVEL_AA.noTexto,
    regla: 'Borde de control',
  },
];
