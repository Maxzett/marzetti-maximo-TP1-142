/**
 * Teclado de un radiogroup en una sola fila (WAI-ARIA): dado el valor elegido y la lista
 * completa, devuelve a qué opción mueve una tecla de flecha/Home/End, dando la vuelta en
 * los bordes como un grupo de radios nativo. Es el mismo algoritmo que ya usaba
 * `selector-hora` para su modo de lista de horarios, ahora compartido con `app-chips-opcion`.
 */
export function destinoEnRadiogroup(
  evento: KeyboardEvent,
  lista: readonly string[],
  elegida: string,
  columnas: number,
): string | null {
  if (lista.length === 0) {
    return null;
  }

  // Sin nada elegido todavía, el recorrido arranca en la primera opción
  const actual = Math.max(0, lista.indexOf(elegida));
  // Con menos opciones que columnas entran todas en una fila y no hay nada arriba ni abajo
  const fila = Math.min(columnas, lista.length);
  const total = lista.length;

  switch (evento.key) {
    case 'ArrowLeft':
      return lista[(actual - 1 + total) % total];
    case 'ArrowRight':
      return lista[(actual + 1) % total];
    case 'ArrowUp':
      return lista[(actual - fila + total) % total];
    case 'ArrowDown':
      return lista[(actual + fila) % total];
    case 'Home':
      return lista[0];
    case 'End':
      return lista[total - 1];
    default:
      return null;
  }
}
