import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFound } from './not-found';

describe('NotFound', () => {
  let fixture: ComponentFixture<NotFound>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFound],
      // routerLink necesita un router configurado
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(NotFound);
    await fixture.whenStable();
  });

  it('ofrece volver al inicio', () => {
    const enlace = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(enlace?.getAttribute('href')).toBe('/');
  });
});
