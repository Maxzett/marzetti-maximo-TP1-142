import { Routes } from '@angular/router';
import { Home } from './features/home/home';
import { NotFound } from './features/not-found/not-found';

export const routes: Routes = [
  { path: '', component: Home, title: 'Cine Emezeta' },

  // Catálogo de componentes. No va en la navegación: es una herramienta de desarrollo.
  // loadComponent lo deja en su propio archivo: nadie que entre a comprar se lo descarga.
  {
    path: 'sistema',
    loadComponent: () => import('./features/sistema/sistema').then((m) => m.Sistema),
    title: 'Sistema visual · Cine Emezeta',
  },

  // Comodín: va último porque el router usa la primera ruta que coincide.
  // Una URL profunda abierta directo (o recargada) llega hasta acá gracias al rewrite
  // de vercel.json, que entrega index.html en lugar de un 404 del servidor.
  { path: '**', component: NotFound, title: 'Página no encontrada · Cine Emezeta' },
];
