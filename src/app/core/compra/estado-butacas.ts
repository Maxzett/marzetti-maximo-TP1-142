import { EstadoDeButaca, EventoDeButaca } from '../models/orden';

/**
 * Aplica un evento de tiempo real al estado del mapa, sin mutar el anterior (un signal solo
 * avisa si cambia la referencia).
 *
 * Una butaca que esta sesión reservó llega de vuelta como `retenida` por el propio Broadcast:
 * se conserva como `propia`, o el comprador vería bloqueada su propia elección. Una `ocupada`
 * sí pisa a la propia: significa que la venta se cerró.
 */
export function aplicarEvento(
  estados: ReadonlyMap<string, EstadoDeButaca>,
  evento: EventoDeButaca,
): Map<string, EstadoDeButaca> {
  const siguiente = new Map(estados);

  if (evento.estado === 'libre') {
    siguiente.delete(evento.butaca_id);
  } else if (evento.estado === 'retenida') {
    if (siguiente.get(evento.butaca_id) !== 'propia') {
      siguiente.set(evento.butaca_id, 'retenida');
    }
  } else {
    siguiente.set(evento.butaca_id, 'ocupada');
  }

  return siguiente;
}

/**
 * Arma el mapa a partir de la lista de butacas no libres que devuelve estado_butacas(). Además
 * del estado de cada una, junta cuándo vence cada reserva PROPIA: la base solo lo dice de las
 * de esta sesión, y con eso el temporizador sobrevive a recargar la página.
 */
export function estadosDesdeFilas(
  filas: readonly { butaca_id: string; estado: string; expira_at?: string | null }[],
): MapaDeEstados {
  const estados = new Map<string, EstadoDeButaca>();
  const vencimientos = new Map<string, string>();

  for (const fila of filas) {
    if (fila.estado === 'ocupada' || fila.estado === 'retenida' || fila.estado === 'propia') {
      estados.set(fila.butaca_id, fila.estado);

      if (fila.estado === 'propia' && fila.expira_at) {
        vencimientos.set(fila.butaca_id, fila.expira_at);
      }
    }
  }

  return { estados, vencimientos };
}

/** El estado de las butacas no libres y el vencimiento de las reservas propias */
export interface MapaDeEstados {
  estados: Map<string, EstadoDeButaca>;
  vencimientos: Map<string, string>;
}

/** El primer vencimiento de una lista: es el que manda, porque en cuanto vence una la orden se cae */
export function primerVencimiento(vencimientos: Iterable<string>): string | null {
  let primero: string | null = null;

  for (const iso of vencimientos) {
    if (primero === null || Date.parse(iso) < Date.parse(primero)) {
      primero = iso;
    }
  }

  return primero;
}
