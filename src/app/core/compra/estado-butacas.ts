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

/** Arma el mapa a partir de la lista de butacas no libres que devuelve estado_butacas() */
export function estadosDesdeFilas(
  filas: readonly { butaca_id: string; estado: string }[],
): Map<string, EstadoDeButaca> {
  const estados = new Map<string, EstadoDeButaca>();

  for (const fila of filas) {
    if (fila.estado === 'ocupada' || fila.estado === 'retenida' || fila.estado === 'propia') {
      estados.set(fila.butaca_id, fila.estado);
    }
  }

  return estados;
}
