import { Routes } from '@angular/router';
import { sesionIniciada, soloInvitados } from './core/guards/sesion';
import { Home } from './features/home/home';
import { NotFound } from './features/not-found/not-found';

export const routes: Routes = [
  { path: '', component: Home, title: 'Cine Emezeta' },

  // Las pantallas de cuenta van en su propio chunk: quien entra a comprar de forma
  // anónima (RF-26) no tiene por qué descargarse el formulario de registro.
  // Los guards son ayudas de interfaz, no seguridad: eso lo hace RLS (RNF-09).
  {
    path: 'ingresar',
    canActivate: [soloInvitados],
    loadComponent: () => import('./features/ingresar/ingresar').then((m) => m.Ingresar),
    title: 'Ingresar · Cine Emezeta',
  },
  {
    path: 'registrarme',
    canActivate: [soloInvitados],
    loadComponent: () => import('./features/registrarme/registrarme').then((m) => m.Registrarme),
    title: 'Crear cuenta · Cine Emezeta',
  },
  {
    path: 'perfil',
    canActivate: [sesionIniciada],
    loadComponent: () => import('./features/perfil/perfil').then((m) => m.Perfil),
    title: 'Mi perfil · Cine Emezeta',
  },

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
