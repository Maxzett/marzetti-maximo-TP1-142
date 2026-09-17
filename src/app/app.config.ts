import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding() hace que los parámetros de ruta (:id, query params)
    // lleguen a los componentes como input(), sin inyectar ActivatedRoute
    provideRouter(routes, withComponentInputBinding()),
    // El service worker solo corre en producción: en desarrollo cachearía los archivos
    // y ocultaría los cambios al recargar. registerWhenStable espera a que la app termine
    // de arrancar (30 s como máximo) para que el precacheo no compita con la carga inicial.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
