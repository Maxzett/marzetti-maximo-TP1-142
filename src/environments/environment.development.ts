// Configuración de desarrollo (ng serve). Reemplaza a environment.ts vía fileReplacements.
// Apunta al mismo proyecto de Supabase que producción: el TP usa un único proyecto.
// Ver environment.ts para el motivo de versionar estas claves.
export const environment = {
  production: false,
  supabaseUrl: 'https://axfgauvrculgviepwzmg.supabase.co',
  supabaseKey: 'sb_publishable_dWmzBbcTptFV8-aD5aEfrw_H76GjoP2',
};
