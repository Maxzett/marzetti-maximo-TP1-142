/**
 * Modelos de cuenta y perfil (RF-38).
 *
 * Los campos van en snake_case porque son los nombres de las columnas de Postgres:
 * supabase-js devuelve la fila tal cual, y renombrarlas acá obligaría a mapear en
 * cada consulta a cambio de nada.
 */

export type RolUsuario = 'cliente' | 'empleado' | 'admin';

/** Los ocho valores del CHECK de perfiles_sensibles.tipo_sangre */
export const TIPOS_DE_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type TipoSangre = (typeof TIPOS_DE_SANGRE)[number];

/**
 * El pliego trae la lista truncada ("Marrones, verdes, azules, "). Se completa con
 * los colores de ojos que faltaban; en la base es un CHECK y no un enum justamente
 * para poder corregirla sin migrar datos.
 */
export const COLORES_DE_OJOS = [
  'marrones',
  'verdes',
  'azules',
  'grises',
  'negros',
  'miel',
] as const;
export type ColorOjos = (typeof COLORES_DE_OJOS)[number];

/** Fila de `perfiles`. La ve su titular; el admin ve además las de los demás. */
export interface Perfil {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  /** 'AAAA-MM-DD', el mismo formato que usa el selector de fecha */
  fecha_nacimiento: string;
  rol: RolUsuario;
  creado_at: string;
}

/**
 * Fila de `perfiles_sensibles`. Solo la lee su titular: ni el administrador ni los
 * empleados tienen política que se la dé (RF-38.1, RNF-11).
 */
export interface PerfilSensible {
  perfil_id: string;
  tipo_sangre: TipoSangre;
  color_ojos: ColorOjos;
  dias_vacaciones: number;
}

/** Los siete campos de RF-38 más la contraseña, tal como los pide el registro. */
export interface DatosRegistro {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  fechaNacimiento: string;
  tipoSangre: TipoSangre;
  colorOjos: ColorOjos;
  diasVacaciones: number;
}
