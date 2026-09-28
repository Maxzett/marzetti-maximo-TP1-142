import { InjectionToken } from '@angular/core';

/**
 * Notificaciones del sistema para las alertas de estreno (RF-42), sin servidor de push.
 *
 * Cuando la app se abre y alguna película con alerta salió a la venta, se muestra una
 * notificación del sistema operativo además del aviso dentro de la app. Se muestra con el
 * service worker (`registration.showNotification`): así aparece aun con la pestaña en segundo
 * plano, y el clic lo resuelve ngsw-worker.js con `data.onActionClick`, que abre la ficha de la
 * película o enfoca la pestaña que ya estaba abierta.
 *
 * Límite asumido: sin push real, el aviso llega cuando la persona abre la app, no con la app
 * cerrada. Un push de verdad necesitaría claves VAPID y una Edge Function que lo mande.
 *
 * Queda aislado detrás de un token para reemplazarlo en los tests: jsdom no tiene Notification.
 */
export type PermisoDeNotificacion = 'concedido' | 'negado' | 'sin-preguntar' | 'no-soportado';

export interface Notificador {
  permiso(): PermisoDeNotificacion;
  /** Pide permiso. Tiene que llamarse desde un gesto del usuario: si no, el navegador lo ignora */
  pedirPermiso(): Promise<PermisoDeNotificacion>;
  /** Devuelve si se pudo mostrar. `url` es la ruta que se abre al tocarla */
  mostrar(titulo: string, cuerpo: string, url: string): Promise<boolean>;
}

export const NOTIFICADOR = new InjectionToken<Notificador>('NOTIFICADOR', {
  factory: () => notificadorDelNavegador,
});

function traducir(permiso: NotificationPermission): PermisoDeNotificacion {
  switch (permiso) {
    case 'granted':
      return 'concedido';
    case 'denied':
      return 'negado';
    default:
      return 'sin-preguntar';
  }
}

const soportado = () => typeof window !== 'undefined' && 'Notification' in window;

export const notificadorDelNavegador: Notificador = {
  permiso() {
    return soportado() ? traducir(Notification.permission) : 'no-soportado';
  },

  async pedirPermiso() {
    if (!soportado()) {
      return 'no-soportado';
    }

    return traducir(await Notification.requestPermission());
  },

  async mostrar(titulo, cuerpo, url) {
    if (!soportado() || Notification.permission !== 'granted') {
      return false;
    }

    try {
      // El service worker solo se registra en producción (app.config.ts). En desarrollo se usa
      // el constructor directo, que muestra lo mismo pero sin abrir la ficha al tocarla.
      const registro = await navigator.serviceWorker?.getRegistration();

      if (registro) {
        await registro.showNotification(titulo, {
          body: cuerpo,
          icon: 'icons/icon-192x192.png',
          // Una por película: si se vuelve a avisar, reemplaza a la anterior en vez de apilarse
          tag: url,
          data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url } } },
        });
      } else {
        new Notification(titulo, { body: cuerpo, tag: url });
      }

      return true;
    } catch {
      return false;
    }
  },
};
