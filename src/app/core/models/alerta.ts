import { Pelicula } from './pelicula';

/**
 * Una alerta de estreno (RF-42) con los datos de la película que hacen falta para decidir si ya
 * salió a la venta y para mostrarla. Campos en snake_case: son las columnas de la base.
 */
export interface AlertaDeEstreno {
  pelicula_id: string;
  /** Cuándo se le avisó. Null mientras la venta no abrió o todavía no se enteró */
  notificada_at: string | null;
  creado_at: string;
  pelicula: Pick<Pelicula, 'id' | 'titulo' | 'fecha_estreno' | 'precio_preventa' | 'poster_url'>;
}
