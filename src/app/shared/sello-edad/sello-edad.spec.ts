import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RestriccionEdad } from '../../core/models/pelicula';
import { SelloEdad } from './sello-edad';

describe('SelloEdad', () => {
  let fixture: ComponentFixture<SelloEdad>;

  async function crear(edad: RestriccionEdad) {
    await TestBed.configureTestingModule({ imports: [SelloEdad] }).compileComponents();
    fixture = TestBed.createComponent(SelloEdad);
    fixture.componentRef.setInput('edad', edad);
    await fixture.whenStable();
  }

  const sello = () => (fixture.nativeElement as HTMLElement).querySelector('.sello')!;

  afterEach(() => TestBed.resetTestingModule());

  it('sin restricción dibuja ATP como píldora y lo dice completo', async () => {
    await crear(0);

    expect(sello().querySelector('[aria-hidden]')?.textContent).toBe('ATP');
    expect(sello().querySelector('.solo-lectores')?.textContent).toBe('Apta para todo público');
    expect(sello().classList).not.toContain('sello--13');
    expect(sello().classList).not.toContain('sello--18');
  });

  it('+13 lleva su propia forma', async () => {
    await crear(13);

    expect(sello().textContent).toContain('+13');
    expect(sello().classList).toContain('sello--13');
    expect(sello().querySelector('.solo-lectores')?.textContent).toBe('Mayores de 13 años');
  });

  it('+18 lleva su propia forma', async () => {
    await crear(18);

    expect(sello().textContent).toContain('+18');
    expect(sello().classList).toContain('sello--18');
    expect(sello().querySelector('.solo-lectores')?.textContent).toBe('Mayores de 18 años');
  });
});
