import { RestriccionEdad } from '../models/pelicula';

export interface EtiquetaEdad {
  /** Lo que se dibuja: entra en un chip */
  corto: string;
  /** Lo que lee un lector de pantalla, y lo que se escribe cuando hay lugar */
  largo: string;
}

/**
 * Cómo se nombra cada restricción de edad (RF-03). ATP es la calificación argentina de
 * "apta para todo público". El texto siempre acompaña al color del chip: la restricción
 * nunca se comunica solo con el rojo del +18 (RNF-10).
 */
export function describirEdad(edad: RestriccionEdad): EtiquetaEdad {
  switch (edad) {
    case 13:
      return { corto: '+13', largo: 'Mayores de 13 años' };
    case 18:
      return { corto: '+18', largo: 'Mayores de 18 años' };
    default:
      return { corto: 'ATP', largo: 'Apta para todo público' };
  }
}
