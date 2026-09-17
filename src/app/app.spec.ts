import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // RouterOutlet y los routerLink del header necesitan un router configurado
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renderiza el layout: header, contenido y footer', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-header')).toBeTruthy();
    expect(compiled.querySelector('main router-outlet')).toBeTruthy();
    expect(compiled.querySelector('app-footer')).toBeTruthy();
  });

  // WCAG 2.4.1: el salto tiene que ser lo primero que encuentra el teclado, antes del header
  it('abre con el salto al contenido y apunta al main', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const salto = compiled.querySelector('a.salto') as HTMLAnchorElement;
    const principal = compiled.querySelector('main') as HTMLElement;

    expect(compiled.firstElementChild).toBe(salto);
    expect(salto.getAttribute('href')).toBe(`#${principal.id}`);
    // tabindex -1: el main se enfoca por programa, pero no entra en el orden de tabulación
    expect(principal.getAttribute('tabindex')).toBe('-1');
  });

  it('mueve el foco al contenido cuando se usa el salto', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    (compiled.querySelector('a.salto') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(document.activeElement).toBe(compiled.querySelector('main'));
  });

  // El router cambia de pantalla sin recargar: el cambio hay que anunciarlo a mano
  it('tiene una región viva para anunciar el cambio de ruta', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const region = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region.classList.contains('solo-lectores')).toBe(true);
  });
});
