import { Component, computed, input } from '@angular/core';
import { describirEdad } from '../../core/catalogo/edad';
import { RestriccionEdad } from '../../core/models/pelicula';

/**
 * La restricción de edad de una película (RF-03) como un sello. Cada calificación tiene su propia
 * forma y no solo su color (RNF-10): ATP es una píldora, +13 un rótulo con la esquina cortada y
 * +18 un recuadro de borde doble. Con el alto contraste de Windows, que reemplaza todos los
 * colores, las tres se siguen distinguiendo.
 *
 * Lo que se ve es la sigla; lo que lee un lector de pantalla, la frase completa.
 */
@Component({
  selector: 'app-sello-edad',
  styleUrl: './sello-edad.css',
  templateUrl: './sello-edad.html',
})
export class SelloEdad {
  readonly edad = input.required<RestriccionEdad>();

  protected readonly etiqueta = computed(() => describirEdad(this.edad()));
}
