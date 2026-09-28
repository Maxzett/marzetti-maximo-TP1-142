import { notificadorDelNavegador } from './notificacion';

describe('notificadorDelNavegador', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sin la API de notificaciones no pide permiso ni muestra nada', async () => {
    vi.stubGlobal('Notification', undefined);
    delete (window as { Notification?: unknown }).Notification;

    expect(notificadorDelNavegador.permiso()).toBe('no-soportado');
    expect(await notificadorDelNavegador.pedirPermiso()).toBe('no-soportado');
    expect(await notificadorDelNavegador.mostrar('t', 'c', '/')).toBe(false);
  });

  it('traduce el permiso del navegador', async () => {
    const falsa = Object.assign(vi.fn(), {
      permission: 'granted',
      requestPermission: vi.fn(async () => 'denied'),
    });
    vi.stubGlobal('Notification', falsa);

    expect(notificadorDelNavegador.permiso()).toBe('concedido');
    expect(await notificadorDelNavegador.pedirPermiso()).toBe('negado');
  });

  it('sin service worker (desarrollo) la muestra con el constructor', async () => {
    const falsa = Object.assign(vi.fn(), { permission: 'granted' });
    vi.stubGlobal('Notification', falsa);

    expect(await notificadorDelNavegador.mostrar('Título', 'Cuerpo', '/peliculas/1')).toBe(true);
    expect(falsa).toHaveBeenCalledWith('Título', { body: 'Cuerpo', tag: '/peliculas/1' });
  });

  it('con service worker la muestra por el registro, con la ruta para el clic', async () => {
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted' }));
    const showNotification = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => ({ showNotification }) },
    });

    expect(await notificadorDelNavegador.mostrar('Título', 'Cuerpo', '/peliculas/1')).toBe(true);
    expect(showNotification).toHaveBeenCalledWith(
      'Título',
      expect.objectContaining({
        data: {
          onActionClick: {
            default: { operation: 'navigateLastFocusedOrOpen', url: '/peliculas/1' },
          },
        },
      }),
    );

    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });
});
