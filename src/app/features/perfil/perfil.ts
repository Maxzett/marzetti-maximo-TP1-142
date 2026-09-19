import { Component, computed, inject, signal } from '@angular/core';
import { PerfilSensible } from '../../core/models/perfil';
import { Auth } from '../../core/services/auth';
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
  imports: [Mensaje, Spinner, Tarjeta],
  selector: 'app-perfil',
  styleUrl: './perfil.css',
  templateUrl: './perfil.html',
})
export class Perfil {
  private readonly auth = inject(Auth);

  protected readonly perfil = this.auth.perfil;

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

  constructor() {
    // Los tres campos protegidos se piden aparte. Si la política de RLS no fuera la
    // que es, esta consulta volvería vacía: la pantalla no asume que van a venir.
    this.auth.cargarDatosSensibles().then((datos) => {
      this.sensibles.set(datos);
      this.cargandoSensibles.set(false);
    });
  }
}
