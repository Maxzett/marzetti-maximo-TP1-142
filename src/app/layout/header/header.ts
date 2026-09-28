import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Alertas } from '../../core/services/alertas';
import { Auth } from '../../core/services/auth';

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-header',
  styleUrl: './header.css',
  templateUrl: './header.html',
})
export class Header {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  // El header está en todas las pantallas: es quien crea el servicio de alertas al arrancar, y
  // con eso se cargan y se avisan apenas hay sesión (RF-42)
  private readonly alertas = inject(Alertas);

  protected readonly haySesion = this.auth.haySesion;
  protected readonly perfil = this.auth.perfil;
  protected readonly esPersonal = this.auth.esPersonal;
  protected readonly esAdmin = this.auth.esAdmin;

  protected readonly avisosNuevos = computed(() => this.alertas.nuevas().length);

  protected async salir(): Promise<void> {
    await this.auth.salir();
    // A la portada: las pantallas de cuenta que quedaron atrás ya no le corresponden.
    await this.router.navigateByUrl('/');
  }
}
