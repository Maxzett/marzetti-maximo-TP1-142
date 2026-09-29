import {
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  model,
  viewChild,
} from '@angular/core';
import { Campo } from '../campo/campo';
import {
  aDisplay,
  aIsoDesdeDisplay,
  dentroDelRango,
  formatearLargo,
} from '../selector-fecha/fechas';

/** Va agregando '/' a medida que se completan día y mes, y frena en 8 dígitos (DDMMAAAA) */
function conBarras(textoCrudo: string): string {
  const digitos = textoCrudo.replace(/\D/g, '').slice(0, 8);
  const dia = digitos.slice(0, 2);
  const mes = digitos.slice(2, 4);
  const anio = digitos.slice(4, 8);
  return [dia, mes, anio].filter(Boolean).join('/');
}

/**
 * Campo de fecha con máscara DD/MM/AAAA (RNF-08): reemplaza al calendario donde la fecha
 * es libre (nacimiento, vigencia de un cupón, rango de un reporte). Nunca <input type=date>
 * (el navegador abre su propio calendario) ni <select> de día/mes/año (en iOS es una rueda).
 *
 * Por dentro es un app-campo de texto: lo que se ve mientras se tipea (`texto`) viaja
 * separado del valor en ISO que ve el resto de la app (`valor`), porque a mitad de tipeo
 * ("31/0") todavía no hay una fecha que convertir.
 *
 * Formato inválido o fuera de rango se avisan solos, apenas se completan los 10 caracteres:
 * son datos activamente mal escritos. "Vacío y obligatorio" no lo decide este componente,
 * porque recién importa después de intentar enviar el formulario (como en el resto del
 * sistema): lo dice `error`, igual que en app-campo.
 */
@Component({
  imports: [Campo],
  selector: 'app-campo-fecha',
  templateUrl: './campo-fecha.html',
})
export class CampoFecha {
  readonly etiqueta = input.required<string>();
  readonly minimo = input('');
  readonly maximo = input('');
  readonly requerido = input(false);
  /** Error externo (p. ej. "obligatorio", gateado por el intento de envío de la pantalla) */
  readonly error = input('');
  /** Fecha en ISO 'AAAA-MM-DD'. Vacío mientras no haya una fecha válida y en rango */
  readonly valor = model('');

  /** Lo que se ve en el input. Se resincroniza cuando `valor` cambia desde afuera */
  protected readonly texto = linkedSignal(() => aDisplay(this.valor()));

  private readonly campoInstancia = viewChild<Campo>('campoRef');
  private readonly campoElemento = viewChild('campoRef', { read: ElementRef<HTMLElement> });

  protected readonly errorMostrado = computed(() => this.error() || this.errorDeFormato());

  private readonly errorDeFormato = computed(() => {
    const texto = this.texto();

    if (!texto || texto.length < 10) {
      // Vacío o todavía tipeando: ninguno de los dos es un error propio
      return '';
    }

    const iso = aIsoDesdeDisplay(texto);

    if (iso === null) {
      return 'Ingresá una fecha válida (DD/MM/AAAA).';
    }

    if (!dentroDelRango(iso, this.minimo(), this.maximo())) {
      return this.mensajeDeRango();
    }

    return '';
  });

  protected alEscribir(textoCrudo: string): void {
    const conSeparadores = conBarras(textoCrudo);
    this.texto.set(conSeparadores);
    this.forzarTexto(conSeparadores);

    if (conSeparadores === '') {
      this.valor.set('');
      return;
    }

    const iso = aIsoDesdeDisplay(conSeparadores);

    if (iso !== null && dentroDelRango(iso, this.minimo(), this.maximo())) {
      this.valor.set(iso);
    }
  }

  /**
   * app-campo ya escribió el texto crudo (con la basura tipeada de más) en su propia señal
   * `valor`, porque ese es su trabajo con cualquier campo de texto libre. Si el texto filtrado
   * da lo mismo que ya tenía este componente, Angular compara contra el último valor que
   * pintó y no contra los pasos intermedios: no vuelve a escribir el <input> aunque la señal
   * de app-campo haya pasado por un estado sucio en el medio. Se corrige a mano en dos partes:
   * la señal de app-campo (para que la próxima tecla parta de un estado limpio) y el <input>
   * de verdad (para que lo que se ve ahora sea correcto, sin esperar el próximo render).
   */
  private forzarTexto(texto: string): void {
    this.campoInstancia()?.valor.set(texto);

    const input = this.campoElemento()?.nativeElement.querySelector('input');
    if (input && input.value !== texto) {
      input.value = texto;
    }
  }

  private mensajeDeRango(): string {
    const minimo = this.minimo();
    const maximo = this.maximo();

    if (minimo && maximo) {
      return `Tiene que estar entre el ${formatearLargo(minimo)} y el ${formatearLargo(maximo)}.`;
    }
    if (minimo) {
      return `Tiene que ser desde el ${formatearLargo(minimo)}.`;
    }
    if (maximo) {
      return `Tiene que ser hasta el ${formatearLargo(maximo)}.`;
    }
    return 'Ingresá una fecha válida (DD/MM/AAAA).';
  }
}
