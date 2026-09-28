import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NOTIFICADOR } from '../../core/alertas/notificacion';
import { Pelicula } from '../../core/models/pelicula';
import { Alertas } from '../../core/services/alertas';
import { Auth } from '../../core/services/auth';

/**
 * "Avisame cuando salga a la venta" (RF-42). Lo usan las tarjetas de Próximamente y la ficha de
 * una película que todavía no se vende; quien lo pone decide si corresponde mostrarlo.
 *
 * Es un botón de dos estados (aria-pressed), igual que los chips: el estado se dice con texto y
 * con el tilde, no solo con el color (RNF-10). Sin sesión es un enlace a ingresar: la alerta se
 * guarda en la cuenta.
 *
 * El permiso para las notificaciones del sistema se pide acá, al activar la primera alerta: es
 * un gesto de la persona, que es lo único que el navegador acepta, y es el momento en que se
 * entiende para qué se pide. Si lo niega, el aviso igual aparece dentro de la app.
 */
@Component({
  imports: [RouterLink],
  selector: 'app-boton-alerta',
  styleUrl: './boton-alerta.css',
  templateUrl: './boton-alerta.html',
})
export class BotonAlerta {
  private readonly alertas = inject(Alertas);
  private readonly auth = inject(Auth);
  private readonly notificador = inject(NOTIFICADOR);

  readonly pelicula = input.required<Pick<Pelicula, 'id' | 'titulo'>>();

  protected readonly haySesion = this.auth.haySesion;
  protected readonly activa = computed(() =>
    this.alertas.peliculasConAlerta().has(this.pelicula().id),
  );
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  protected readonly nota = signal('');

  protected async alternar(): Promise<void> {
    if (this.guardando()) {
      return;
    }

    this.guardando.set(true);
    this.error.set('');
    this.nota.set('');

    const error = this.activa()
      ? await this.alertas.desactivar(this.pelicula().id)
      : await this.activarConPermiso();

    this.error.set(error ?? '');
    this.guardando.set(false);
  }

  private async activarConPermiso(): Promise<string | null> {
    if (this.notificador.permiso() === 'sin-preguntar') {
      await this.notificador.pedirPermiso();
    }

    const error = await this.alertas.activar(this.pelicula());

    if (!error && this.notificador.permiso() !== 'concedido') {
      this.nota.set('Te vamos a avisar acá, en la app, la próxima vez que entres.');
    }

    return error;
  }
}
