import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RolUsuario } from '../models/perfil';
import { Auth } from '../services/auth';

/**
 * Guards de sesión.
 *
 * Son ayudas de interfaz, NO seguridad (RNF-09). Evitan que alguien llegue a una
 * pantalla que no le sirve y vea un error feo; no protegen ningún dato. Quien
 * quiera saltearlos solo tiene que llamar a la API de Supabase desde la consola, y
 * ahí las únicas reglas que corren son las políticas RLS de la base.
 *
 * Funcionan sincrónicamente porque provideAppInitializer ya esperó a que la sesión
 * se restaure antes de que el router evalúe la primera ruta.
 */

/** Exige sesión iniciada. Recuerda a dónde quería ir, para volver después de entrar. */
export const sesionIniciada: CanActivateFn = (_ruta, estado) => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (auth.haySesion()) {
    return true;
  }

  return router.createUrlTree(['/ingresar'], { queryParams: { volverA: estado.url } });
};

/** Lo contrario: /ingresar y /registrarme no tienen sentido con la sesión abierta. */
export const soloInvitados: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  return auth.haySesion() ? router.createUrlTree(['/perfil']) : true;
};

/**
 * Fábrica de guards por rol, para los paneles de empleado (F8) y admin (F9).
 * Es una función que devuelve el guard, y no un guard con `data`, para que el rol
 * exigido quede a la vista en la definición de la ruta.
 */
export function rolRequerido(...roles: readonly RolUsuario[]): CanActivateFn {
  return () => {
    const auth = inject(Auth);
    const router = inject(Router);
    const rol = auth.rol();

    if (rol !== null && roles.includes(rol)) {
      return true;
    }

    // A quien tiene sesión pero no el rol se lo manda a la portada, no a /ingresar:
    // volver a entrar no le va a dar un rol que no tiene.
    return router.createUrlTree([auth.haySesion() ? '/' : '/ingresar']);
  };
}
