import { Routes } from '@angular/router';
import { rolRequerido, sesionIniciada, soloInvitados } from './core/guards/sesion';
import { Home } from './features/home/home';
import { NotFound } from './features/not-found/not-found';

export const routes: Routes = [
  { path: '', component: Home, title: 'Cine Emezeta' },

  // El buscador vive en la portada desde la revisión R1. /peliculas queda como redirección para
  // los enlaces viejos: Angular conserva ?q y ?genero al redirigir, así un filtro compartido
  // sigue funcionando.
  { path: 'peliculas', pathMatch: 'full', redirectTo: '' },

  // La ficha se carga aparte de la portada, con el mismo criterio que las pantallas de cuenta.
  // Es pública: la compra anónima (RF-26) también la recorre. El id llega al componente como
  // input() por withComponentInputBinding.
  {
    path: 'peliculas/:id',
    loadComponent: () =>
      import('./features/pelicula-detalle/pelicula-detalle').then((m) => m.PeliculaDetalle),
    title: 'Película · Cine Emezeta',
  },

  // Próximamente (RF-08) es pública como el catálogo; el aviso de venta (RF-42) pide sesión
  // recién al tocarlo.
  {
    path: 'proximamente',
    loadComponent: () => import('./features/proximamente/proximamente').then((m) => m.Proximamente),
    title: 'Próximamente · Cine Emezeta',
  },

  // Compra (RF-24 a RF-29). Sin guard: se puede comprar sin cuenta (RF-26), y la seguridad de
  // cada paso la ponen las funciones de la base, no el router. El id llega como input().
  {
    path: 'comprar/:funcionId',
    loadComponent: () => import('./features/compra/compra').then((m) => m.Compra),
    title: 'Comprar entradas · Cine Emezeta',
  },

  // Candy sin entrada (RF-34.1). Sin guard, igual que la compra de entradas (RF-26): el ticket
  // se ve después en /entrada/:codigo, con el mismo QR.
  {
    path: 'candy',
    loadComponent: () => import('./features/candy-bar/candy-bar').then((m) => m.CandyBar),
    title: 'Candy bar · Cine Emezeta',
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
  {
    path: 'mis-peliculas',
    canActivate: [sesionIniciada],
    loadComponent: () =>
      import('./features/mis-peliculas/mis-peliculas').then((m) => m.MisPeliculas),
    title: 'Mis películas · Cine Emezeta',
  },

  // Panel de administración. El guard es una ayuda de interfaz (RNF-09): lo que protege los
  // datos son las funciones de la base, que verifican el rol por su cuenta. Todo va en chunks
  // aparte: un cliente que compra no descarga una línea del panel.
  {
    path: 'admin',
    canActivate: [rolRequerido('admin')],
    loadComponent: () => import('./layout/admin/admin').then((m) => m.Admin),
    children: [
      // Los reportes son lo primero que se mira al entrar: cómo viene la venta (RF-57)
      { path: '', pathMatch: 'full', redirectTo: 'reportes' },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/admin-reportes/admin-reportes').then((m) => m.AdminReportes),
        title: 'Reportes · Administración · Cine Emezeta',
      },
      {
        path: 'peliculas',
        loadComponent: () =>
          import('./features/admin-peliculas/admin-peliculas').then((m) => m.AdminPeliculas),
        title: 'Películas · Administración · Cine Emezeta',
      },
      // Alta (`nueva`) y edición (`:id`) en una sola ruta: al guardar un alta la URL pasa a la del
      // id y Angular reutiliza el componente, con el aviso y el paso siguiente en pantalla.
      {
        path: 'peliculas/:id',
        loadComponent: () =>
          import('./features/admin-pelicula/admin-pelicula').then((m) => m.AdminPelicula),
        title: 'Película · Administración · Cine Emezeta',
      },
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
      {
        path: 'candy',
        loadComponent: () => import('./features/admin-candy/admin-candy').then((m) => m.AdminCandy),
        title: 'Candy · Administración · Cine Emezeta',
      },
      {
        path: 'promociones',
        loadComponent: () =>
          import('./features/admin-promociones/admin-promociones').then((m) => m.AdminPromociones),
        title: 'Promociones · Administración · Cine Emezeta',
      },
      {
        path: 'actividad',
        loadComponent: () =>
          import('./features/admin-actividad/admin-actividad').then((m) => m.AdminActividad),
        title: 'Actividad · Administración · Cine Emezeta',
      },
    ],
  },

  // Panel del empleado (RF-51 a RF-55). El admin también entra: es_personal() lo admite en la
  // base, y el guard dice lo mismo para no mostrarle una pantalla que después funciona. El
  // lector de QR de respaldo (jsQR) se importa desde adentro, en otro chunk.
  {
    path: 'empleado',
    canActivate: [rolRequerido('empleado', 'admin')],
    loadComponent: () => import('./features/empleado/empleado').then((m) => m.Empleado),
    title: 'Validar entradas · Cine Emezeta',
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
