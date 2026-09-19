import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { Auth } from './core/services/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding() hace que los parámetros de ruta (:id, query params)
    // lleguen a los componentes como input(), sin inyectar ActivatedRoute
    provideRouter(routes, withComponentInputBinding()),
    // La sesión se restaura ANTES de que el router evalúe la primera ruta. getSession()
    // lee de localStorage de forma asíncrona, así que sin esperarla el guard correría
    // con haySesion() todavía en false y mandaría a /ingresar a alguien que ya entró:
    // el bug se ve al recargar /perfil con la sesión abierta.
    provideAppInitializer(() => inject(Auth).restaurar()),
    // El service worker solo corre en producción: en desarrollo cachearía los archivos
    // y ocultaría los cambios al recargar. registerWhenStable espera a que la app termine
    // de arrancar (30 s como máximo) para que el precacheo no compita con la carga inicial.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
