import { RolUsuario } from './perfil';

/**
 * Lo que devuelven las funciones de reportes de la migración 0024 (RF-57 a RF-61). Son
 * agregados ya resueltos por la base: ni el panel lee `ordenes` directo ni aparece acá un
 * solo dato de perfiles_sensibles (RNF-11).
 */

/** Una fila del reporte de facturación (RF-57): un día, en la fecha del cine */
export interface DiaDeFacturacion {
  /** 'AAAA-MM-DD' */
  dia: string;
  /** Órdenes cobradas ese día, incluidas las que después se cancelaron */
  ordenes: number;
  /** Entradas de esas órdenes que siguen vigentes */
  entradas: number;
  /** Lo que entró por el medio de pago. Incluye las canceladas: no se devuelve dinero (RF-31) */
  cobrado: number;
  /** Lo cubierto con crédito, que ya se había cobrado en otra orden */
  credito: number;
  /** Lo cubierto con cupones */
  descuentos: number;
  /** De las órdenes cobradas ese día, cuántas se cancelaron después */
  canceladas: number;
}

export type Periodo = 'semana' | 'mes';

/** Una barra del gráfico de películas más vistas (RF-59) */
export interface PeliculaVista {
  pelicula_id: string;
  titulo: string;
  entradas: number;
}

/** Un renglón del ranking del candy (RF-60): las unidades cuentan también las de los combos */
export interface ProductoVendido {
  producto_id: string;
  nombre: string;
  unidades: number;
}

/** Una fila de log_actividad (RN-12, RF-61) */
export interface RegistroDeActividad {
  id: number;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: Record<string, unknown>;
  creado_at: string;
  /** Copias del momento: si la cuenta se borra, el registro de lo que hizo se queda */
  actor_email: string | null;
  actor_rol: RolUsuario | null;
  /** Nombre del actor, por el embed de PostgREST. Nulo si la cuenta ya no existe */
  actor: { nombre: string; apellido: string } | null;
}

export interface FiltroDeActividad {
  /** 'AAAA-MM-DD', en la fecha del cine. Vacío para no acotar */
  desde: string;
  hasta: string;
  /** Una acción exacta ('crear_funcion') o vacío para todas */
  accion: string;
}

export interface PaginaDeActividad {
  registros: RegistroDeActividad[];
  /** Total de filas que cumplen el filtro, para saber si hay página siguiente */
  total: number;
}
