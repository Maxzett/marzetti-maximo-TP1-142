const CLAVE = 'cine.sesion-de-compra';

/**
 * Identifica al comprador sin exigirle cuenta (RF-26). La base retiene las butacas a nombre de
 * este valor y solo quien lo conoce puede pagar esa orden. Vive en sessionStorage: sobrevive a
 * recargar la pestaña, pero dos pestañas distintas son dos compradores distintos, que es lo que
 * hace falta para que una no pise las reservas de la otra.
 *
 * Si el navegador no deja usar el almacenamiento (ventana privada, datos bloqueados) se genera
 * uno para esta carga: la compra funciona, solo que recargar pierde las reservas.
 */
let enMemoria: string | null = null;

export function sesionDeCompra(): string {
  try {
    const guardada = sessionStorage.getItem(CLAVE);

    if (guardada) {
      return guardada;
    }

    const nueva = crypto.randomUUID();
    sessionStorage.setItem(CLAVE, nueva);
    return nueva;
  } catch {
    enMemoria ??= crypto.randomUUID();
    return enMemoria;
  }
}
