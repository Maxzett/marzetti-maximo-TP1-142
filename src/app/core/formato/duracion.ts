/**
 * "1 h 52 min", como se lee una duración en una cartelera. Una película de 90 minutos es
 * "1 h 30 min" y no "90 min": en horas se calcula a qué hora termina de un vistazo.
 */
export function formatearDuracion(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  if (horas === 0) {
    return `${resto} min`;
  }

  return resto === 0 ? `${horas} h` : `${horas} h ${String(resto).padStart(2, '0')} min`;
}
