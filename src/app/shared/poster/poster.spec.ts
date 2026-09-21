import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Poster } from './poster';

describe('Poster', () => {
  let fixture: ComponentFixture<Poster>;

  async function crear(entradas: { titulo: string; url?: string | null; decorativo?: boolean }) {
    await TestBed.configureTestingModule({ imports: [Poster] }).compileComponents();

    fixture = TestBed.createComponent(Poster);
    fixture.componentRef.setInput('titulo', entradas.titulo);
    if (entradas.url !== undefined) {
      fixture.componentRef.setInput('url', entradas.url);
    }
    if (entradas.decorativo !== undefined) {
      fixture.componentRef.setInput('decorativo', entradas.decorativo);
    }
    await fixture.whenStable();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;

  afterEach(() => TestBed.resetTestingModule());

  describe('con imagen', () => {
    it('muestra la imagen con su texto alternativo', async () => {
      await crear({ titulo: 'Mar de cenizas', url: 'https://ejemplo.com/mar.jpg' });

      const img = raiz().querySelector('img');
      expect(img?.getAttribute('src')).toBe('https://ejemplo.com/mar.jpg');
      expect(img?.getAttribute('alt')).toBe('Póster de Mar de cenizas');
    });

    it('no dibuja el póster tipográfico', async () => {
      await crear({ titulo: 'Mar de cenizas', url: 'https://ejemplo.com/mar.jpg' });

      expect(raiz().querySelector('.tipografico')).toBeNull();
    });

    it('con decorativo deja el alt vacío, para que no se lea el título dos veces', async () => {
      await crear({ titulo: 'Mar', url: 'https://ejemplo.com/mar.jpg', decorativo: true });

      expect(raiz().querySelector('img')?.getAttribute('alt')).toBe('');
    });
  });

  describe('sin imagen', () => {
    it('dibuja el póster tipográfico con el título', async () => {
      await crear({ titulo: 'Mar de cenizas' });

      expect(raiz().querySelector('img')).toBeNull();
      expect(raiz().querySelector('.titulo')?.textContent).toContain('Mar de cenizas');
    });

    it('lo anuncia como una imagen con el título completo', async () => {
      await crear({ titulo: 'Mar de cenizas', url: null });

      const poster = raiz().querySelector('.tipografico');
      expect(poster?.getAttribute('role')).toBe('img');
      expect(poster?.getAttribute('aria-label')).toBe('Póster de Mar de cenizas');
    });

    it('con decorativo lo esconde de los lectores de pantalla', async () => {
      await crear({ titulo: 'Mar', decorativo: true });

      const poster = raiz().querySelector('.tipografico');
      expect(poster?.getAttribute('aria-hidden')).toBe('true');
      expect(poster?.hasAttribute('role')).toBe(false);
      expect(poster?.hasAttribute('aria-label')).toBe(false);
    });

    it('las guirnaldas de bombillas son decoración y no se leen', async () => {
      await crear({ titulo: 'Mar' });

      const guirnaldas = raiz().querySelectorAll('.guirnalda');
      expect(guirnaldas).toHaveLength(2);
      guirnaldas.forEach((g) => expect(g.getAttribute('aria-hidden')).toBe('true'));
    });
  });
});
