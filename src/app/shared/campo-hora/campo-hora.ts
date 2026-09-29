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

/** Va agregando ':' a medida que se completa la hora, y frena en 4 dígitos (HHMM) */
function conDosPuntos(textoCrudo: string): string {
  const digitos = textoCrudo.replace(/\D/g, '').slice(0, 4);
  const hora = digitos.slice(0, 2);
  const minuto = digitos.slice(2, 4);
  return [hora, minuto].filter(Boolean).join(':');
}

/**
 * Campo de horario con máscara HH:MM (RNF-08): reemplaza a la rueda de horario donde el
 * horario es libre (alta de una función). 'HH:MM' ya es el formato interno, así que no hace
 * falta ninguna conversión de ida y vuelta como en app-campo-fecha, solo enmascarar y validar.
 *
 * Igual que app-campo-fecha: el formato o el rango mal escritos se avisan solos; "vacío y
 * obligatorio" lo decide la pantalla que lo usa, vía `error` (como en app-campo).
 */
@Component({
  imports: [Campo],
  selector: 'app-campo-hora',
  templateUrl: './campo-hora.html',
})
export class CampoHora {
  readonly etiqueta = input.required<string>();
  /** Minutos entre horario y horario. 0 significa sin restricción de múltiplo */
  readonly pasoMinutos = input(0);
  readonly requerido = input(false);
  /** Error externo (p. ej. "obligatorio", gateado por el intento de envío de la pantalla) */
  readonly error = input('');
  readonly valor = model('');

  protected readonly texto = linkedSignal(() => this.valor());

  private readonly campoInstancia = viewChild<Campo>('campoRef');
  private readonly campoElemento = viewChild('campoRef', { read: ElementRef<HTMLElement> });

  protected readonly errorMostrado = computed(() => this.error() || this.errorDeFormato());

  private readonly errorDeFormato = computed(() => {
    const texto = this.texto();

    if (!texto || texto.length < 5) {
      return '';
    }

    const partes = /^([0-2]\d):([0-5]\d)$/.exec(texto);

    if (!partes || Number(partes[1]) > 23) {
      return 'Ingresá un horario válido (HH:MM).';
    }

    const paso = this.pasoMinutos();

    if (paso > 0 && Number(partes[2]) % paso !== 0) {
      return `El horario tiene que ser cada ${paso} minutos.`;
    }

    return '';
  });

  protected alEscribir(textoCrudo: string): void {
    const conSeparador = conDosPuntos(textoCrudo);
    this.texto.set(conSeparador);
    this.forzarTexto(conSeparador);

    if (conSeparador === '') {
      this.valor.set('');
      return;
    }

    const partes = /^([0-2]\d):([0-5]\d)$/.exec(conSeparador);
    const paso = this.pasoMinutos();
    const enPaso = !partes || paso <= 0 || Number(partes[2]) % paso === 0;

    if (partes && Number(partes[1]) <= 23 && enPaso) {
      this.valor.set(conSeparador);
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
}
