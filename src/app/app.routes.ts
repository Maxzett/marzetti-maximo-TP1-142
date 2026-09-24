import { Routes } from '@angular/router';
import { rolRequerido, sesionIniciada, soloInvitados } from './core/guards/sesion';
import { Home } from './features/home/home';
import { NotFound } from './features/not-found/not-found';

export const routes: Routes = [
  { path: '', component: Home, title: 'Cine Emezeta' },

  // El catálogo y la ficha se cargan aparte de la portada, con el mismo criterio que las
  // pantallas de cuenta. Son públicos: la compra anónima (RF-26) también los recorre.
  // El id llega al componente como input() por withComponentInputBinding.
  {
    path: 'peliculas',
    loadComponent: () => import('./features/peliculas/peliculas').then((m) => m.Peliculas),
    title: 'Películas · Cine Emezeta',
  },
  {
    path: 'peliculas/:id',
    loadComponent: () =>
      import('./features/pelicula-detalle/pelicula-detalle').then((m) => m.PeliculaDetalle),
    title: 'Película · Cine Emezeta',
  },

  // Compra (RF-24 a RF-29). Sin guard: se puede comprar sin cuenta (RF-26), y la seguridad de
  // cada paso la ponen las funciones de la base, no el router. El id llega como input().
  {
    path: 'comprar/:funcionId',
    loadComponent: () => import('./features/compra/compra').then((m) => m.Compra),
    title: 'Comprar entradas · Cine Emezeta',
  },

  // La entrada comprada (RF-27). Sin guard: se llega con el código de la orden, que no se puede
  // adivinar, y la compra es anónima (RF-26). QR y PDF se importan recién cuando hacen falta.
  {
    path: 'entrada/:codigo',
    loadComponent: () => import('./features/entrada/entrada').then((m) => m.Entrada),
    title: 'Tu entrada · Cine Emezeta',
  },

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

  // Panel de administración. El guard es una ayuda de interfaz (RNF-09): lo que protege los
  // datos son las funciones de la base, que verifican el rol por su cuenta. Todo va en chunks
  // aparte: un cliente que compra no descarga una línea del panel.
  {
    path: 'admin',
    canActivate: [rolRequerido('admin')],
    loadComponent: () => import('./layout/admin/admin').then((m) => m.Admin),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'funciones' },
      {
        path: 'funciones',
        loadComponent: () =>
          import('./features/admin-funciones/admin-funciones').then((m) => m.AdminFunciones),
        title: 'Funciones · Administración · Cine Emezeta',
      },
      {
        path: 'salas',
        loadComponent: () => import('./features/admin-salas/admin-salas').then((m) => m.AdminSalas),
        title: 'Salas · Administración · Cine Emezeta',
      },
    ],
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
