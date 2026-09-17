import { Service } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Punto único de acceso a Supabase.
 *
 * @Service() (Angular 22) lo provee automáticamente: una sola instancia compartida
 * por toda la app, sin declararlo en ningún array de providers.
 */
@Service()
export class Supabase {
  // Un único cliente: supabase-js guarda la sesión del usuario y administra los canales
  // de realtime, y dos clientes separados competirían por esa misma sesión.
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey);

  /**
   * Comprueba que la app llega a Supabase y que la clave pública es aceptada.
   * Usa el endpoint de salud de Auth porque no depende de ninguna tabla (el esquema
   * se crea en la F3) y el gateway de Supabase rechaza una clave inválida con 401.
   */
  async verificarConexion(): Promise<boolean> {
    try {
      const respuesta = await fetch(`${environment.supabaseUrl}/auth/v1/health`, {
        headers: { apikey: environment.supabaseKey },
      });
      return respuesta.ok;
    } catch {
      // Error de red, DNS o CORS: para la interfaz es lo mismo, no hay conexión
      return false;
    }
  }
}
