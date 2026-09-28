import { Component, computed, input } from '@angular/core';

export interface DatoDeBarra {
  etiqueta: string;
  valor: number;
}

/**
 * Gráfico de barras horizontales, dibujado con CSS (RF-59, RF-60).
 *
 * Sin librería: son un puñado de barras con un ancho proporcional, y una librería de gráficos
 * traería su propia estética —justo lo contrario del estilo propio que pide la cátedra— y un
 * `<canvas>` que el lector de pantalla no puede leer.
 *
 * Es una lista ordenada y no un dibujo: cada renglón dice su etiqueta y su valor con la unidad
 * escrita ("12 entradas"), así el lector de pantalla lee el ranking entero y nadie depende del
 * largo de la barra ni de su color para saber cuánto vale (RNF-10). La barra es decorativa.
 */
@Component({
  imports: [],
  selector: 'app-grafico-barras',
  styleUrl: './grafico-barras.css',
  templateUrl: './grafico-barras.html',
})
export class GraficoBarras {
  /** Qué muestra el gráfico: va en el figcaption y le da nombre a la figura */
  readonly titulo = input.required<string>();
  readonly datos = input.required<readonly DatoDeBarra[]>();
  /** Unidad en singular y plural: "entrada" / "entradas" */
  readonly unidad = input<readonly [string, string]>(['unidad', 'unidades']);
  readonly vacio = input('No hay datos para mostrar.');

  protected readonly barras = computed(() => {
    const datos = this.datos();
    const maximo = Math.max(0, ...datos.map((dato) => dato.valor));

    return datos.map((dato) => ({
      ...dato,
      // Una barra de un valor positivo nunca queda invisible, por chico que sea contra el máximo
      porcentaje: maximo > 0 && dato.valor > 0 ? Math.max(2, (dato.valor / maximo) * 100) : 0,
      texto: `${dato.valor} ${dato.valor === 1 ? this.unidad()[0] : this.unidad()[1]}`,
    }));
  });
}
