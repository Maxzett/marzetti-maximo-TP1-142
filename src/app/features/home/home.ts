import { Component, inject, signal } from '@angular/core';
import { Supabase } from '../../core/services/supabase';

// Estados posibles de la verificación de conexión con Supabase
type EstadoConexion = 'verificando' | 'conectado' | 'sin-conexion';

@Component({
  imports: [],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {
  private readonly supabase = inject(Supabase);

  protected readonly estadoConexion = signal<EstadoConexion>('verificando');

  constructor() {
    // Home provisoria de la F1: la cartelera y el top 3 llegan en la F4.
    // Mientras tanto, el indicador deja a la vista que el deploy llega a Supabase.
    this.supabase
      .verificarConexion()
      .then((ok) => this.estadoConexion.set(ok ? 'conectado' : 'sin-conexion'));
  }
}
