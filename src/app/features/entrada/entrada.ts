import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { datosDeLaEntrada, leyendaDeAcompanante, nombreDelPdf } from '../../core/entrada/entrada';
import { EntradaComprada } from '../../core/models/orden';
import { Compra } from '../../core/services/compra';
import { Boton } from '../../shared/boton/boton';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Spinner } from '../../shared/spinner/spinner';
import { Tarjeta } from '../../shared/tarjeta/tarjeta';

/**
 * La entrada comprada (RF-27): datos, código QR y descarga en PDF. No pide sesión: se llega por
 * el código de la orden, que no se puede adivinar y es la llave (la compra es anónima, RF-26).
 *
 * El QR y el PDF se generan en el navegador y se importan recién cuando hacen falta.
 */
@Component({
  imports: [Boton, Mensaje, RouterLink, Spinner, Tarjeta],
  selector: 'app-entrada',
  styleUrl: './entrada.css',
  templateUrl: './entrada.html',
})
export class Entrada {
  private readonly compra = inject(Compra);
  private readonly titulo = inject(Title);

  readonly codigo = input.required<string>();

  protected readonly cargando = signal(true);
  protected readonly entrada = signal<EntradaComprada | null>(null);
  protected readonly qr = signal('');
  protected readonly errorDeQr = signal(false);
  protected readonly descargando = signal(false);
  protected readonly errorDeDescarga = signal('');

  protected readonly datos = computed(() => {
    const entrada = this.entrada();
    return entrada ? datosDeLaEntrada(entrada) : [];
  });

  protected readonly leyenda = computed(() => {
    const entrada = this.entrada();
    return entrada ? leyendaDeAcompanante(entrada) : '';
  });

  constructor() {
    effect(() => {
      const codigo = this.codigo();
      untracked(() => void this.cargar(codigo));
    });
  }

  protected async descargar(): Promise<void> {
    const entrada = this.entrada();

    if (!entrada || !this.qr() || this.descargando()) {
      return;
    }

    this.descargando.set(true);
    this.errorDeDescarga.set('');

    try {
      // El PDF (con jsPDF) se descarga recién acá
      const { generarPdf } = await import('../../core/entrada/pdf');
      const archivo = await generarPdf(entrada, this.qr());
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreDelPdf(entrada);
      enlace.click();
      URL.revokeObjectURL(url);
    } catch {
      this.errorDeDescarga.set('No pudimos generar el PDF. Probá de nuevo.');
    }

    this.descargando.set(false);
  }

  private async cargar(codigo: string): Promise<void> {
    this.cargando.set(true);
    this.entrada.set(null);
    this.qr.set('');
    this.errorDeQr.set(false);

    const entrada = await this.compra.obtenerEntrada(codigo);

    // Si mientras tanto cambió el código de la ruta, esta respuesta ya no corresponde
    if (codigo !== this.codigo()) {
      return;
    }

    this.entrada.set(entrada);

    if (entrada?.estado === 'pagada') {
      this.titulo.setTitle(`Tu entrada · ${entrada.pelicula} · Cine Emezeta`);

      try {
        const { qrComoImagen } = await import('../../core/entrada/qr');
        const imagen = await qrComoImagen(entrada.codigo);

        if (codigo === this.codigo()) {
          this.qr.set(imagen);
        }
      } catch (error) {
        // Sin QR dibujado el código escrito sigue sirviendo: se tipea en la puerta (RF-53).
        // Se avisa en pantalla y se deja el rastro en consola: un fallo mudo ya nos costó un bug.
        console.error('No se pudo generar el QR', error);
        this.errorDeQr.set(true);
      }
    }

    this.cargando.set(false);
  }
}
