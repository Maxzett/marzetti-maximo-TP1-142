import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/services/auth';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Mensaje } from '../../shared/mensaje/mensaje';

@Component({
  imports: [Boton, Campo, Mensaje, RouterLink],
  selector: 'app-ingresar',
  styleUrl: './ingresar.css',
  templateUrl: './ingresar.html',
})
export class Ingresar {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  /**
   * Llega como query param gracias a withComponentInputBinding(): el guard
   * sesionIniciada lo pone al rebotar, para devolver a la pantalla que se quiso abrir.
   */
  readonly volverA = input('');

  protected readonly email = signal('');
  protected readonly password = signal('');

  protected readonly enviando = signal(false);
  protected readonly errorGeneral = signal('');

  /**
   * Los errores de cada campo no se muestran hasta el primer intento de envío:
   * marcar en rojo un formulario que ni se empezó a completar es hostil.
   */
  protected readonly intentoHecho = signal(false);

  protected readonly errorEmail = computed(() => {
    if (!this.intentoHecho()) return '';
    if (!this.email().trim()) return 'Escribí tu mail.';
    return '';
  });

  protected readonly errorPassword = computed(() => {
    if (!this.intentoHecho()) return '';
    if (!this.password()) return 'Escribí tu contraseña.';
    return '';
  });

  protected async alEnviar(evento: Event): Promise<void> {
    evento.preventDefault();
    this.intentoHecho.set(true);
    this.errorGeneral.set('');

    if (this.errorEmail() || this.errorPassword()) {
      return;
    }

    this.enviando.set(true);
    const error = await this.auth.ingresar(this.email().trim(), this.password());
    this.enviando.set(false);

    if (error) {
      this.errorGeneral.set(error);
      return;
    }

    await this.router.navigateByUrl(this.volverA() || '/perfil');
  }
}
