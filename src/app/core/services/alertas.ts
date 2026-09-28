import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { NOTIFICADOR } from '../alertas/notificacion';
import { estadoDeVenta } from '../catalogo/venta';
import { AlertaDeEstreno } from '../models/alerta';
import { Pelicula } from '../models/pelicula';
import { hoyIso } from '../../shared/selector-fecha/fechas';
import { Auth } from './auth';
import { Supabase } from './supabase';

/** Código de Postgres para una fila que no pasa el WITH CHECK de una política */
const POLITICA_VIOLADA = '42501';
/** Clave primaria repetida: la alerta ya existía, que para quien la pide es lo mismo que crearla */
const UNIQUE_VIOLADO = '23505';

/**
 * Alertas de estreno (RF-42): avisar cuando salgan a la venta las entradas de una película de
 * Próximamente.
 *
 * La tabla se lee y se escribe directo, con las políticas de la migración 0025: cada cuenta ve,
 * crea y borra solo las suyas, y la política de alta rechaza una película que ya está a la venta.
 * No hace falta una función de la base porque no hay nada que calcular: es la lista de avisos de
 * cada persona.
 *
 * El aviso ocurre al abrir la app: al haber sesión se cargan las alertas, y las que salieron a la
 * venta y todavía no se avisaron (`notificada_at` nula) se muestran como notificación del sistema
 * si hay permiso, o quedan marcadas en el header hasta que se miran en Próximamente.
 */
@Service()
export class Alertas {
  private readonly supabase = inject(Supabase);
  private readonly auth = inject(Auth);
  private readonly notificador = inject(NOTIFICADOR);

  private readonly lista = signal<AlertaDeEstreno[]>([]);

  readonly alertas = this.lista.asReadonly();

  /** Ids de las películas con alerta, para que cada botón sepa si está activado */
  readonly peliculasConAlerta = computed(() => new Set(this.lista().map((a) => a.pelicula_id)));

  /** Las que ya se pueden comprar */
  readonly aLaVenta = computed(() =>
    this.lista().filter((a) => estadoDeVenta(a.pelicula, hoyIso()).aLaVenta),
  );

  /** Las que salieron a la venta y todavía no se le avisaron: es el número del header */
  readonly nuevas = computed(() => this.aLaVenta().filter((a) => a.notificada_at === null));

  constructor() {
    // Con cada cambio de cuenta se recargan; al salir se vacían, así la próxima persona que use
    // el mismo navegador no ve avisos ajenos ni siquiera por un instante.
    effect(() => {
      const perfilId = this.auth.perfil()?.id;
      untracked(() => (perfilId ? void this.cargar() : this.lista.set([])));
    });
  }

  async cargar(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('alertas_estreno')
      .select(
        'pelicula_id, notificada_at, creado_at, pelicula:peliculas(id, titulo, fecha_estreno, precio_preventa, poster_url)',
      )
      .order('creado_at')
      .overrideTypes<AlertaDeEstreno[], { merge: false }>();

    // Si la lectura falla no se inventa una lista vacía encima de la que había
    if (error) {
      return;
    }

    this.lista.set(data);
    await this.avisarPorElSistema();
  }

  /** Devuelve null si salió bien o el mensaje a mostrar, como el resto de los servicios */
  async activar(pelicula: Pick<Pelicula, 'id'>): Promise<string | null> {
    const perfilId = this.auth.perfil()?.id;
    if (!perfilId) {
      return 'Iniciá sesión para activar el aviso.';
    }

    const { error } = await this.supabase.client
      .from('alertas_estreno')
      .insert({ perfil_id: perfilId, pelicula_id: pelicula.id });

    if (error && error.code !== UNIQUE_VIOLADO) {
      return error.code === POLITICA_VIOLADA
        ? 'Las entradas de esta película ya están a la venta.'
        : 'No pudimos activar el aviso. Probá de nuevo.';
    }

    await this.cargar();
    return null;
  }

  async desactivar(peliculaId: string): Promise<string | null> {
    const { error } = await this.supabase.client
      .from('alertas_estreno')
      .delete()
      .eq('pelicula_id', peliculaId);

    if (error) {
      return 'No pudimos quitar el aviso. Probá de nuevo.';
    }

    this.lista.update((lista) => lista.filter((a) => a.pelicula_id !== peliculaId));
    return null;
  }

  /** Las que ya vio en pantalla dejan de contar como nuevas */
  async marcarAvisadas(peliculaIds: readonly string[] = this.nuevas().map((a) => a.pelicula_id)) {
    if (peliculaIds.length === 0) {
      return;
    }

    const ahora = new Date().toISOString();
    const { error } = await this.supabase.client
      .from('alertas_estreno')
      .update({ notificada_at: ahora })
      .in('pelicula_id', [...peliculaIds]);

    if (!error) {
      this.lista.update((lista) =>
        lista.map((a) =>
          peliculaIds.includes(a.pelicula_id) ? { ...a, notificada_at: ahora } : a,
        ),
      );
    }
  }

  /**
   * Una notificación del sistema por cada película nueva, si la persona dio permiso. La que se
   * mostró cuenta como avisada; sin permiso, el aviso queda en el header.
   */
  private async avisarPorElSistema(): Promise<void> {
    if (this.notificador.permiso() !== 'concedido') {
      return;
    }

    const avisadas: string[] = [];

    for (const alerta of this.nuevas()) {
      const { enPreventa } = estadoDeVenta(alerta.pelicula, hoyIso());
      const mostrada = await this.notificador.mostrar(
        `${alerta.pelicula.titulo}: ya hay entradas`,
        enPreventa
          ? 'Arrancó la preventa en Cine Emezeta, con precio especial hasta el estreno.'
          : 'Ya podés comprar tus entradas en Cine Emezeta.',
        `/peliculas/${alerta.pelicula_id}`,
      );

      if (mostrada) {
        avisadas.push(alerta.pelicula_id);
      }
    }

    await this.marcarAvisadas(avisadas);
  }
}
