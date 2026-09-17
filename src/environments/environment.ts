// Configuración de producción (ng build).
// La URL y la clave pública de Supabase se versionan a propósito: son públicas por diseño
// y terminan igual dentro del bundle que descarga el navegador. Lo que protege los datos
// son las políticas RLS de la base (RNF-09).
// La secret key / service_role NUNCA va acá: saltea RLS y daría acceso total a la base.
export const environment = {
  production: true,
  supabaseUrl: 'https://axfgauvrculgviepwzmg.supabase.co',
  // Publishable key: la clave pública del proyecto, pensada para correr en el navegador
  supabaseKey: 'sb_publishable_dWmzBbcTptFV8-aD5aEfrw_H76GjoP2',
};
