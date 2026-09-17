import { Routes } from '@angular/router';
import { Home } from './features/home/home';
import { NotFound } from './features/not-found/not-found';

export const routes: Routes = [
  { path: '', component: Home, title: 'Cine' },

  // Comodín: va último porque el router usa la primera ruta que coincide.
  // Una URL profunda abierta directo (o recargada) llega hasta acá gracias al rewrite
  // de vercel.json, que entrega index.html en lugar de un 404 del servidor.
  { path: '**', component: NotFound, title: 'Página no encontrada · Cine' },
];
