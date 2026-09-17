import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet, TitleStrategy } from '@angular/router';
import { filter, map } from 'rxjs';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';

@Component({
  imports: [RouterOutlet, Header, Footer],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly titulos = inject(TitleStrategy);
  /** afterNextRender se llama desde adentro de un effect, que ya corre fuera del contexto de inyección */
  private readonly inyector = inject(Injector);

  private readonly contenido = viewChild.required<ElementRef<HTMLElement>>('contenido');

  /**
   * Título de la ruta que se acaba de activar, para anunciarlo en la región viva.
   *
   * Se arma con TitleStrategy.buildTitle() y no con Title.getTitle(): buildTitle lee el
   * árbol de rutas y devuelve siempre el título de la navegación que terminó, sin depender
   * de si el router ya escribió el <title> del documento. Así el anuncio y la pestaña no
   * pueden contradecirse.
   */
  protected readonly anuncioDeRuta = toSignal(
    this.router.events.pipe(
      filter((evento) => evento instanceof NavigationEnd),
      map(() => this.titulos.buildTitle(this.router.routerState.snapshot) ?? ''),
    ),
    { initialValue: '' },
  );

  /** La primera navegación es la carga de la página: ahí el foco lo pone el navegador */
  private esLaPrimeraNavegacion = true;

  constructor() {
    effect(() => {
      if (!this.anuncioDeRuta()) {
        return;
      }

      if (this.esLaPrimeraNavegacion) {
        this.esLaPrimeraNavegacion = false;
        return;
      }

      // afterNextRender: el componente de la ruta nueva todavía no está dibujado
      afterNextRender(() => this.enfocarContenido(), { injector: this.inyector });
    });
  }

  /**
   * El href queda como red por si el JS todavía no cargó, pero el salto se hace acá:
   * así el foco se mueve de verdad —un ancla sola no siempre lo mueve— y la URL no
   * queda ensuciada con el fragmento.
   */
  protected saltarAlContenido(evento: Event): void {
    evento.preventDefault();
    this.enfocarContenido();
  }

  private enfocarContenido(): void {
    this.contenido().nativeElement.focus();
  }
}
