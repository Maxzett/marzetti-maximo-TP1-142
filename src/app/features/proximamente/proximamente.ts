import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { estadoDeVenta } from '../../core/catalogo/venta';
import { Pelicula } from '../../core/models/pelicula';
import { Alertas } from '../../core/services/alertas';
import { Auth } from '../../core/services/auth';
import { Catalogo } from '../../core/services/catalogo';
import { FichaProxima } from '../../shared/ficha-proxima/ficha-proxima';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { formatearDiaYMes, hoyIso } from '../../shared/selector-fecha/fechas';
import { Spinner } from '../../shared/spinner/spinner';
import { BotonAlerta } from './boton-alerta';

/**
 * Próximamente (RF-08): las películas que todavía no se estrenaron, de la más cercana a la más
 * lejana, con la preventa si la tienen (RF-49) y el aviso de venta (RF-42).
 *
 * Arriba, con sesión, "Tus avisos": las películas con alerta que ya salieron a la venta. Hace
 * falta aparte de la grilla porque una película sin preventa sale a la venta el día del estreno,
 * y ese mismo día deja de ser de Próximamente: sin esta lista, el aviso se perdería justo cuando
 * se cumple. Mirar esta pantalla cuenta como haber recibido el aviso.
 */
@Component({
  imports: [BotonAlerta, FichaProxima, Mensaje, RouterLink, Spinner],
  selector: 'app-proximamente',
  styleUrl: './proximamente.css',
  templateUrl: './proximamente.html',
})
export class Proximamente {
  private readonly catalogo = inject(Catalogo);
  private readonly alertas = inject(Alertas);
  private readonly auth = inject(Auth);

  protected readonly haySesion = this.auth.haySesion;
  protected readonly cargando = signal(true);
  protected readonly fallo = signal(false);
  protected readonly proximas = signal<Pelicula[]>([]);

  protected readonly avisos = computed(() =>
    this.alertas.aLaVenta().map((alerta) => {
      const { enPreventa } = estadoDeVenta(alerta.pelicula, hoyIso());
      const estreno = alerta.pelicula.fecha_estreno;
      return {
        id: alerta.pelicula_id,
        titulo: alerta.pelicula.titulo,
        nueva: alerta.notificada_at === null,
        detalle: enPreventa
          ? `En preventa hasta el estreno${estreno ? `, el ${formatearDiaYMes(estreno)}` : ''}.`
          : 'Ya a la venta.',
      };
    }),
  );

  protected readonly errorAlQuitar = signal('');

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.fallo.set(false);

    const [proximas] = await Promise.all([
      this.catalogo.cargarProximas(),
      this.haySesion() ? this.alertas.cargar() : Promise.resolve(),
    ]);

    if (proximas === null) {
      this.fallo.set(true);
    } else {
      this.proximas.set(proximas);
    }

    this.cargando.set(false);

    // Ya están en pantalla: dejan de contar como nuevas en el header
    await this.alertas.marcarAvisadas();
  }

  protected async quitarAviso(peliculaId: string): Promise<void> {
    this.errorAlQuitar.set((await this.alertas.desactivar(peliculaId)) ?? '');
  }

  protected aLaVenta(pelicula: Pelicula): boolean {
    return estadoDeVenta(pelicula, hoyIso()).aLaVenta;
  }
}
