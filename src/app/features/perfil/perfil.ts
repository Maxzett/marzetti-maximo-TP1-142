import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { describirCupon } from '../../core/compra/candy';
import { formatearPrecio, formatearPuntos } from '../../core/formato/precio';
import { describirInicio } from '../../core/funciones/programacion';
import { Canje, OrdenPropia, Saldos } from '../../core/models/orden';
import { PerfilSensible } from '../../core/models/perfil';
import { Auth } from '../../core/services/auth';
import { Cuenta } from '../../core/services/cuenta';
import { Boton } from '../../shared/boton/boton';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { formatearLargo } from '../../shared/selector-fecha/fechas';
import { Spinner } from '../../shared/spinner/spinner';
import { Tarjeta } from '../../shared/tarjeta/tarjeta';

/** Nombres para mostrar de cada rol: la base guarda el valor técnico */
const NOMBRE_DEL_ROL = {
  cliente: 'Cliente',
  empleado: 'Empleado',
  admin: 'Administración',
} as const;

@Component({
  imports: [Boton, Dialogo, Mensaje, RouterLink, Spinner, Tarjeta],
  selector: 'app-perfil',
  styleUrl: './perfil.css',
  templateUrl: './perfil.html',
})
export class Perfil {
  private readonly auth = inject(Auth);
  private readonly cuenta = inject(Cuenta);

  protected readonly perfil = this.auth.perfil;
  protected readonly formatearPrecio = formatearPrecio;
  protected readonly formatearPuntos = formatearPuntos;
  protected readonly describirCupon = describirCupon;
  protected readonly describirInicio = describirInicio;

  protected readonly nombreDelRol = computed(() => {
    const rol = this.auth.rol();
    return rol ? NOMBRE_DEL_ROL[rol] : '';
  });

  protected readonly cumpleanios = computed(() => {
    const fecha = this.perfil()?.fecha_nacimiento;
    return fecha ? formatearLargo(fecha) : '';
  });

  protected readonly sensibles = signal<PerfilSensible | null>(null);
  protected readonly cargandoSensibles = signal(true);

  // Puntos, crédito y compras (RF-40, RF-30, RF-31). Null significa que la lectura falló:
  // la pantalla lo dice en vez de mostrar un "0 puntos" que no sabe si es verdad.
  protected readonly saldos = signal<Saldos | null>(null);
  protected readonly canjes = signal<Canje[] | null>(null);
  protected readonly ordenes = signal<OrdenPropia[] | null>(null);
  protected readonly cargandoCuenta = signal(true);

  /** La compra que se está por cancelar: mientras haya una, el diálogo de confirmación está abierto */
  protected readonly aCancelar = signal<OrdenPropia | null>(null);
  protected readonly confirmando = computed(() => this.aCancelar() !== null);
  protected readonly cancelando = signal(false);
  protected readonly errorDeCancelacion = signal('');
  protected readonly avisoDeCancelacion = signal('');

  constructor() {
    // Los tres campos protegidos se piden aparte. Si la política de RLS no fuera la
    // que es, esta consulta volvería vacía: la pantalla no asume que van a venir.
    this.auth.cargarDatosSensibles().then((datos) => {
      this.sensibles.set(datos);
      this.cargandoSensibles.set(false);
    });

    void this.cargarCuenta();
  }

  private async cargarCuenta(): Promise<void> {
    const [saldos, canjes, ordenes] = await Promise.all([
      this.cuenta.saldos(),
      this.cuenta.canjes(),
      this.cuenta.ordenes(),
    ]);

    this.saldos.set(saldos);
    this.canjes.set(canjes);
    this.ordenes.set(ordenes);
    this.cargandoCuenta.set(false);
  }

  protected pedirCancelacion(orden: OrdenPropia): void {
    this.errorDeCancelacion.set('');
    this.avisoDeCancelacion.set('');
    this.aCancelar.set(orden);
  }

  /** El diálogo se cierra solo (Escape, fondo, cruz): se descarta la compra que se iba a cancelar */
  protected alCerrarDialogo(): void {
    if (!this.cancelando()) {
      this.aCancelar.set(null);
    }
  }

  protected async confirmarCancelacion(): Promise<void> {
    const orden = this.aCancelar();

    if (!orden || this.cancelando()) {
      return;
    }

    this.cancelando.set(true);
    this.errorDeCancelacion.set('');

    const resultado = await this.cuenta.cancelar(orden.orden_id);

    if (resultado.estado === 'cancelada') {
      this.avisoDeCancelacion.set(
        `Cancelamos tu compra de ${orden.pelicula}. ${formatearPrecio(resultado.credito)} quedaron como crédito en tu cuenta.`,
      );
      this.aCancelar.set(null);
      // La cancelación cambia el crédito, los puntos, el cupón de bienvenida y el estado de la compra
      await this.cargarCuenta();
    } else {
      this.errorDeCancelacion.set(resultado.mensaje);
    }

    this.cancelando.set(false);
  }

  /** Lo que se acredita al cancelar: lo pagado con el medio de pago más el crédito que se había usado */
  protected creditoDeLaCancelacion(orden: OrdenPropia): number {
    return orden.total + orden.credito_aplicado;
  }
}
