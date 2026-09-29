import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Sistema } from './sistema';

describe('Sistema', () => {
  let fixture: ComponentFixture<Sistema>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sistema],
      // La ficha de película lleva un routerLink
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Sistema);
    await fixture.whenStable();
  });

  // Si un componente de shared/ deja de compilar, el catálogo es el primero en avisar
  it('muestra los quince componentes del sistema', () => {
    const etiquetas = [
      'app-boton',
      'app-campo',
      'app-chip',
      'app-tarjeta',
      'app-mensaje',
      'app-spinner',
      'app-dialogo',
      'app-chips-opcion',
      'app-campo-fecha',
      'app-campo-hora',
      'app-poster',
      'app-estrellas',
      'app-ficha-pelicula',
      'app-sello-edad',
      'app-grafico-barras',
      'app-promociones-orden',
    ];

    for (const etiqueta of etiquetas) {
      expect(fixture.nativeElement.querySelector(etiqueta), etiqueta).not.toBeNull();
    }
  });

  it('muestra el campo en su variante multilínea', () => {
    expect(fixture.nativeElement.querySelector('app-campo textarea')).not.toBeNull();
  });
});
