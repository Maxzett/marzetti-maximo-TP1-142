import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Supabase } from '../../core/services/supabase';
import { Home } from './home';

describe('Home', () => {
  let fixture: ComponentFixture<Home>;

  // Doble del servicio: el test no puede depender de la red ni de un proyecto real
  async function crearCon(conectado: boolean) {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        { provide: Supabase, useValue: { verificarConexion: () => Promise.resolve(conectado) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
  }

  function textoEstado(): string {
    const estado = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
    return estado?.textContent?.trim() ?? '';
  }

  it('muestra que está conectado cuando Supabase responde', async () => {
    await crearCon(true);
    expect(textoEstado()).toBe('Conectado a Supabase');
  });

  it('muestra que no hay conexión cuando Supabase no responde', async () => {
    await crearCon(false);
    expect(textoEstado()).toBe('Sin conexión con Supabase');
  });
});
