import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Sistema } from './sistema';

describe('Sistema', () => {
  let fixture: ComponentFixture<Sistema>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Sistema] }).compileComponents();
    fixture = TestBed.createComponent(Sistema);
    await fixture.whenStable();
  });

  // Si un componente de shared/ deja de compilar, el catálogo es el primero en avisar
  it('muestra los nueve componentes del sistema', () => {
    const etiquetas = [
      'app-boton',
      'app-campo',
      'app-chip',
      'app-tarjeta',
      'app-mensaje',
      'app-spinner',
      'app-dialogo',
      'app-selector-fecha',
      'app-selector-hora',
    ];

    for (const etiqueta of etiquetas) {
      expect(fixture.nativeElement.querySelector(etiqueta), etiqueta).not.toBeNull();
    }
  });
});
