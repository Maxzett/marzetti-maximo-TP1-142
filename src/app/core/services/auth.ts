import { computed, inject, Service, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { DatosRegistro, Perfil, PerfilSensible } from '../models/perfil';
import { Supabase } from './supabase';

/**
 * Supabase devuelve sus errores en inglés y pensados para quien programa.
 * "Invalid login credentials" no es un mensaje para alguien que se equivocó de
 * contraseña, así que se traducen los que el usuario puede provocar.
 */
const MENSAJES: Record<string, string> = {
  'Invalid login credentials': 'El mail o la contraseña no coinciden.',
  'Email not confirmed': 'Todavía no confirmaste tu mail.',
  'User already registered': 'Ya existe una cuenta con ese mail.',
  'Password should be at least 6 characters': 'La contraseña necesita al menos 6 caracteres.',
  'Email rate limit exceeded': 'Probaste demasiadas veces seguidas. Esperá un minuto.',
};

function traducir(mensaje: string): string {
  return MENSAJES[mensaje] ?? 'No pudimos completar la operación. Probá de nuevo.';
}

/**
 * Estado de sesión de la aplicación.
 *
 * Es solo eso: estado para la interfaz. Quien decide qué datos se ven es la base,
 * con sus políticas RLS (RNF-09). Si este servicio mintiera y dijera que alguien es
 * administrador, la base seguiría devolviéndole lo mismo que a cualquier cliente.
 */
@Service()
export class Auth {
  private readonly supabase = inject(Supabase);

  private readonly sesionActual = signal<Session | null>(null);
  private readonly perfilActual = signal<Perfil | null>(null);

  readonly sesion = this.sesionActual.asReadonly();
  readonly perfil = this.perfilActual.asReadonly();

  readonly haySesion = computed(() => this.sesionActual() !== null);
  readonly rol = computed(() => this.perfilActual()?.rol ?? null);
  readonly esAdmin = computed(() => this.rol() === 'admin');
  readonly esPersonal = computed(() => this.rol() === 'empleado' || this.rol() === 'admin');

  constructor() {
    // Mantiene el estado al día ante cambios que no nacen acá: cerrar sesión en otra
    // pestaña, o el refresco automático del token.
    this.supabase.client.auth.onAuthStateChange((_evento, sesion) => {
      this.sesionActual.set(sesion);

      // Nada de await adentro del callback: supabase-js lo ejecuta tomando un lock
      // interno, y llamar a otra función del cliente desde ahí puede trabarlo.
      // queueMicrotask deja que el callback termine antes de ir a buscar el perfil.
      queueMicrotask(() => {
        if (sesion) {
          void this.cargarPerfil();
        } else {
          this.perfilActual.set(null);
        }
      });
    });
  }

  /**
   * Recupera la sesión guardada en el navegador. La llama provideAppInitializer,
   * antes del primer guard: getSession() lee de localStorage de forma asíncrona, y
   * sin esperarla un usuario con sesión abierta rebotaría a /ingresar al recargar.
   */
  async restaurar(): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    this.sesionActual.set(data.session);

    if (data.session) {
      await this.cargarPerfil();
    }
  }

  /** Devuelve null si salió bien, o el mensaje a mostrar si falló. */
  async registrar(datos: DatosRegistro): Promise<string | null> {
    const { error } = await this.supabase.client.auth.signUp({
      email: datos.email,
      password: datos.password,
      options: {
        // Estos siete campos llegan a la base como raw_user_meta_data y los reparte
        // el trigger alta_de_perfil (migración 0015) dentro de la misma transacción
        // que crea la cuenta. El rol no viaja acá a propósito: lo pone el default de
        // la tabla, para que nadie nazca administrador mandando un campo de más.
        data: {
          nombre: datos.nombre,
          apellido: datos.apellido,
          fecha_nacimiento: datos.fechaNacimiento,
          tipo_sangre: datos.tipoSangre,
          color_ojos: datos.colorOjos,
          dias_vacaciones: datos.diasVacaciones,
        },
      },
    });

    if (error) {
      return traducir(error.message);
    }

    await this.cargarPerfil();
    return null;
  }

  async ingresar(email: string, password: string): Promise<string | null> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });

    if (error) {
      return traducir(error.message);
    }

    await this.cargarPerfil();
    return null;
  }

  async salir(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this.sesionActual.set(null);
    this.perfilActual.set(null);
  }

  /**
   * Trae la fila propia de `perfiles`. No hace falta filtrar por id: la política
   * perfiles_select_propio ya devuelve solo la del que consulta. Se usa maybeSingle
   * porque una cuenta recién creada puede llegar acá antes de que el trigger termine.
   */
  async cargarPerfil(): Promise<void> {
    const { data } = await this.supabase.client
      .from('perfiles')
      .select('id, email, nombre, apellido, fecha_nacimiento, rol, creado_at')
      .eq('id', this.sesionActual()?.user.id ?? '')
      .maybeSingle<Perfil>();

    this.perfilActual.set(data ?? null);
  }

  /**
   * Los tres campos que solo ve su titular (RF-38.1). Se piden aparte y bajo pedido,
   * no junto con el perfil: son los datos que menos falta hacen y los que más cuesta
   * si se filtran. La pantalla de perfil es la única que los muestra.
   */
  async cargarDatosSensibles(): Promise<PerfilSensible | null> {
    const { data } = await this.supabase.client
      .from('perfiles_sensibles')
      .select('perfil_id, tipo_sangre, color_ojos, dias_vacaciones')
      .maybeSingle<PerfilSensible>();

    return data ?? null;
  }
}
