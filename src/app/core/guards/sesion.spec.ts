import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { RolUsuario } from '../models/perfil';
import { Auth } from '../services/auth';
import { rolRequerido, sesionIniciada, soloInvitados } from './sesion';

/**
 * Doble de Auth con lo único que los guards leen: si hay sesión y cuál es el rol.
 * No hace falta imitar Supabase, porque los guards nunca hablan con la base: son
 * ayudas de interfaz (RNF-09).
 */
function crearAuthFalso(haySesion: boolean, rol: RolUsuario | null = null) {
  return {
    haySesion: () => haySesion,
    rol: () => rol,
  };
}

/** Ejecuta un guard dentro del contexto de inyección, que es lo que inject() necesita */
function correr(
  guard: ReturnType<typeof rolRequerido> | typeof sesionIniciada,
  url = '/perfil',
): boolean | UrlTree {
  return TestBed.runInInjectionContext(
    () => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot) as boolean | UrlTree,
  );
}

function configurar(haySesion: boolean, rol: RolUsuario | null = null) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: Auth, useValue: crearAuthFalso(haySesion, rol) }],
  });
}

describe('guards de sesión', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('sesionIniciada', () => {
    it('deja pasar con la sesión abierta', () => {
      configurar(true, 'cliente');

      expect(correr(sesionIniciada)).toBe(true);
    });

    it('manda a /ingresar y recuerda a dónde quería ir', () => {
      configurar(false);

      const resultado = correr(sesionIniciada, '/perfil');
      const destino = TestBed.inject(Router).serializeUrl(resultado as UrlTree);

      expect(destino).toContain('/ingresar');
      // El query param es lo que permite volver a la pantalla pedida después de entrar
      expect(destino).toContain('volverA=%2Fperfil');
    });
  });

  describe('soloInvitados', () => {
    it('deja ver /ingresar a quien no tiene sesión', () => {
      configurar(false);

      expect(correr(soloInvitados, '/ingresar')).toBe(true);
    });

    it('saca de /ingresar a quien ya entró', () => {
      configurar(true, 'cliente');

      const resultado = correr(soloInvitados, '/ingresar');

      expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toBe('/perfil');
    });
  });

  describe('rolRequerido', () => {
    it('deja pasar al rol que la ruta pide', () => {
      configurar(true, 'admin');

      expect(correr(rolRequerido('admin'), '/admin')).toBe(true);
    });

    it('acepta cualquiera de los roles enumerados', () => {
      configurar(true, 'empleado');

      expect(correr(rolRequerido('empleado', 'admin'), '/validar')).toBe(true);
    });

    it('manda a la portada al cliente que intenta entrar al panel: volver a ingresar no le daría el rol', () => {
      configurar(true, 'cliente');

      const resultado = correr(rolRequerido('admin'), '/admin');

      expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toBe('/');
    });

    it('manda a /ingresar a quien ni siquiera tiene sesión', () => {
      configurar(false);

      const resultado = correr(rolRequerido('admin'), '/admin');

      expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toBe('/ingresar');
    });
  });
});
