import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
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

  protected readonly haySesion = this.auth.haySesion;
  protected readonly perfil = this.auth.perfil;
  protected readonly esPersonal = this.auth.esPersonal;
  protected readonly esAdmin = this.auth.esAdmin;

  protected async salir(): Promise<void> {
    await this.auth.salir();
    // A la portada: las pantallas de cuenta que quedaron atrás ya no le corresponden.
    await this.router.navigateByUrl('/');
  }
}
