import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Butaca, Sala } from '../../core/models/sala';
import { Salas } from '../../core/services/salas';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { MapaSala } from '../../shared/mapa-sala/mapa-sala';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { Spinner } from '../../shared/spinner/spinner';

/**
 * Salas y su mapa (RF-18). Todas comparten la misma distribución (RF-12), así que gestionar la
 * distribución no es editar butaca por butaca: se ve el mapa de cada sala, se da de alta una
 * nueva —la base le genera el mapa completo— y se renombra o se da de baja una existente.
 *
 * Que una sala con funciones por delante no pueda darse de baja lo decide la base, no esta
 * pantalla: se muestra el mensaje que devuelve.
 */
@Component({
  imports: [Boton, Campo, MapaSala, Mensaje, Spinner],
  selector: 'app-admin-salas',
  styleUrl: './admin-salas.css',
  templateUrl: './admin-salas.html',
})
export class AdminSalas {
  private readonly servicio = inject(Salas);

  protected readonly salas = signal<Sala[] | null>(null);
  protected readonly cargandoSalas = signal(true);
  protected readonly elegidaId = signal('');

  protected readonly butacas = signal<Butaca[] | null>(null);
  protected readonly cargandoMapa = signal(false);

  protected readonly elegida = computed(
    () => this.salas()?.find((sala) => sala.id === this.elegidaId()) ?? null,
  );

  // ── Alta ──
  protected readonly nombreNuevo = signal('');
  protected readonly creando = signal(false);
  protected readonly errorDeAlta = signal('');

  // ── Edición de la sala elegida ──
  protected readonly nombreEditado = signal('');
  protected readonly guardando = signal(false);
  protected readonly errorDeEdicion = signal('');
  protected readonly aviso = signal('');

  constructor() {
    void this.cargarSalas();

    // Al elegir otra sala se trae su mapa y se prepara el campo de nombre. untracked: cargar
    // lee y escribe muchas señales, y no tienen que volver a disparar el efecto.
    effect(() => {
      const id = this.elegidaId();
      untracked(() => {
        this.nombreEditado.set(this.elegida()?.nombre ?? '');
        this.errorDeEdicion.set('');
        void this.cargarMapa(id);
      });
    });
  }

  protected elegir(sala: Sala): void {
    this.aviso.set('');
    this.elegidaId.set(sala.id);
  }

  protected async crear(evento: Event): Promise<void> {
    evento.preventDefault();

    const nombre = this.nombreNuevo().trim();

    if (!nombre) {
      this.errorDeAlta.set('Escribí el nombre de la sala.');
      return;
    }

    this.creando.set(true);
    this.errorDeAlta.set('');
    this.aviso.set('');

    const error = await this.servicio.crear(nombre);
    this.creando.set(false);

    if (error) {
      this.errorDeAlta.set(error);
      return;
    }

    this.nombreNuevo.set('');
    await this.cargarSalas();

    // Se elige la recién creada para mostrar su mapa: es la prueba de que la base lo generó
    const nueva = this.salas()?.find((sala) => sala.nombre === nombre);
    if (nueva) {
      this.elegidaId.set(nueva.id);
    }

    this.aviso.set(`Creamos la sala ${nombre}, con su mapa completo.`);
  }

  protected async renombrar(evento: Event): Promise<void> {
    evento.preventDefault();

    const sala = this.elegida();
    const nombre = this.nombreEditado().trim();

    if (!sala) {
      return;
    }

    if (!nombre) {
      this.errorDeEdicion.set('Escribí el nombre de la sala.');
      return;
    }

    await this.actualizar(sala, nombre, sala.activa, `Guardamos el nuevo nombre: ${nombre}.`);
  }

  protected async alternarEstado(): Promise<void> {
    const sala = this.elegida();

    if (!sala) {
      return;
    }

    const activa = !sala.activa;
    await this.actualizar(
      sala,
      sala.nombre,
      activa,
      activa
        ? `La ${sala.nombre} volvió a recibir funciones.`
        : `Dimos de baja la ${sala.nombre}: deja de recibir funciones nuevas.`,
    );
  }

  private async actualizar(
    sala: Sala,
    nombre: string,
    activa: boolean,
    mensajeDeExito: string,
  ): Promise<void> {
    this.guardando.set(true);
    this.errorDeEdicion.set('');
    this.aviso.set('');

    const error = await this.servicio.actualizar(sala.id, nombre, activa);
    this.guardando.set(false);

    if (error) {
      // El motivo llega de la base: con funciones por delante, por ejemplo, no se puede dar de baja
      this.errorDeEdicion.set(error);
      return;
    }

    await this.cargarSalas();
    this.nombreEditado.set(nombre);
    this.aviso.set(mensajeDeExito);
  }

  private async cargarSalas(): Promise<void> {
    const salas = await this.servicio.cargarSalas();

    this.salas.set(salas);
    this.cargandoSalas.set(false);

    // Sin nada elegido (o si lo elegido ya no está) se arranca por la primera
    if (salas && salas.length > 0 && !salas.some((sala) => sala.id === this.elegidaId())) {
      this.elegidaId.set(salas[0].id);
    }
  }

  private async cargarMapa(salaId: string): Promise<void> {
    if (!salaId) {
      this.butacas.set(null);
      return;
    }

    this.cargandoMapa.set(true);
    this.butacas.set(null);

    const butacas = await this.servicio.cargarButacas(salaId);

    // Si mientras tanto se eligió otra sala, esta respuesta ya no es la que se quiere ver
    if (salaId !== this.elegidaId()) {
      return;
    }

    this.butacas.set(butacas);
    this.cargandoMapa.set(false);
  }
}
