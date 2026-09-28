import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CREAR_LECTOR_QR, LectorQr } from '../../../core/validacion/lector-qr';
import { Boton } from '../../../shared/boton/boton';
import { Mensaje } from '../../../shared/mensaje/mensaje';

export type EstadoDeCamara = 'apagada' | 'iniciando' | 'activa' | 'sin_camara' | 'denegada';

/** Cada cuánto se mira un cuadro. Más seguido no se nota al escanear y gasta batería */
export const INTERVALO_DE_LECTURA_MS = 200;

/**
 * Mientras el mismo QR siga frente a la cámara no se vuelve a avisar: sin esto, una entrada
 * sostenida un segundo dispararía cinco consultas. Tiene que salir de cuadro este tiempo.
 */
export const PAUSA_MISMO_CODIGO_MS = 3000;

/**
 * Escáner de QR con la cámara (RF-51, RF-52). Solo lee: emite el texto del QR y la pantalla
 * decide qué hacer con él.
 *
 * La cámara se prende con un botón y no al entrar: el navegador pide el permiso en ese momento,
 * y un pedido de permiso que aparece solo, sin que la persona haya hecho nada, se suele negar.
 * Si no hay cámara o se niega el permiso, queda el código a mano (RF-53).
 *
 * La cámara se apaga al salir de la pantalla: un stream abierto deja la luz de la cámara
 * encendida y el celular gastando batería aunque nadie esté mirando.
 */
@Component({
  imports: [Boton, Mensaje],
  selector: 'app-escaner',
  styleUrl: './escaner.css',
  templateUrl: './escaner.html',
})
export class Escaner {
  private readonly crearLector = inject(CREAR_LECTOR_QR);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  readonly leido = output<string>();

  protected readonly estado = signal<EstadoDeCamara>('apagada');

  private flujo: MediaStream | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private ultimo = { texto: '', visto: 0 };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.apagar());
  }

  protected async activar(): Promise<void> {
    if (this.estado() === 'iniciando' || this.estado() === 'activa') {
      return;
    }

    // Sin HTTPS, o en un navegador sin cámara, mediaDevices directamente no existe
    if (!navigator.mediaDevices?.getUserMedia) {
      this.estado.set('sin_camara');
      return;
    }

    this.estado.set('iniciando');

    try {
      const [flujo, lector] = await Promise.all([
        // La cámara de atrás si hay: es la que apunta a la entrada que muestra el cliente
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        }),
        this.crearLector(),
      ]);

      // Si mientras se pedía el permiso la pantalla se cerró o se apagó, no hay que prenderla
      if (this.estado() !== 'iniciando') {
        flujo.getTracks().forEach((pista) => pista.stop());
        return;
      }

      this.flujo = flujo;
      const video = this.video().nativeElement;
      video.srcObject = flujo;
      await video.play();

      this.estado.set('activa');
      this.programar(lector);
    } catch (error) {
      this.apagar();
      this.estado.set(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'denegada'
          : 'sin_camara',
      );
    }
  }

  apagar(): void {
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }

    this.flujo?.getTracks().forEach((pista) => pista.stop());
    this.flujo = null;

    const video = this.video().nativeElement;
    video.srcObject = null;

    this.ultimo = { texto: '', visto: 0 };
    this.estado.set('apagada');
  }

  /**
   * Un setTimeout que se reprograma al terminar, y no un setInterval: si decodificar un cuadro
   * tarda más que el intervalo, un setInterval apilaría lecturas una encima de otra.
   */
  private programar(lector: LectorQr): void {
    this.temporizador = setTimeout(async () => {
      if (this.estado() !== 'activa') {
        return;
      }

      try {
        const texto = await lector.leer(this.video().nativeElement);

        if (texto) {
          this.avisar(texto);
        }
      } catch {
        // Un cuadro que no se pudo leer no es un error: se prueba con el siguiente
      }

      if (this.estado() === 'activa') {
        this.programar(lector);
      }
    }, INTERVALO_DE_LECTURA_MS);
  }

  private avisar(texto: string): void {
    const ahora = Date.now();
    const repetido =
      texto === this.ultimo.texto && ahora - this.ultimo.visto < PAUSA_MISMO_CODIGO_MS;

    // Se actualiza siempre: la pausa cuenta desde la última vez que se vio, no desde la primera
    this.ultimo = { texto, visto: ahora };

    if (!repetido) {
      // Una vibración corta confirma la lectura sin tener que mirar la pantalla
      navigator.vibrate?.(80);
      this.leido.emit(texto);
    }
  }
}
