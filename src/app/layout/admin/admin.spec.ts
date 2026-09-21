import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Admin } from './admin';

@Component({ template: '<p>contenido de la sección</p>' })
class Seccion {}

describe('Admin', () => {
  async function montar(url: string) {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'admin',
            component: Admin,
            children: [
              { path: 'funciones', component: Seccion },
              { path: 'salas', component: Seccion },
            ],
          },
        ]),
      ],
    }).compileComponents();

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness.fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('ofrece las dos secciones: funciones y salas', async () => {
    const raiz = await montar('/admin/funciones');
    const enlaces = Array.from(raiz.querySelectorAll('nav a')).map((a) => [
      a.textContent?.trim(),
      a.getAttribute('href'),
    ]);

    expect(enlaces).toEqual([
      ['Funciones', '/admin/funciones'],
      ['Salas', '/admin/salas'],
    ]);
  });

  it('marca la sección actual con aria-current, no solo con un color', async () => {
    const raiz = await montar('/admin/salas');
    const actual = raiz.querySelector('nav a[aria-current="page"]');

    expect(actual?.textContent?.trim()).toBe('Salas');
    expect(raiz.querySelectorAll('nav a[aria-current]')).toHaveLength(1);
  });

  it('dibuja la sección elegida debajo de la navegación', async () => {
    const raiz = await montar('/admin/funciones');

    expect(raiz.textContent).toContain('contenido de la sección');
  });
});
