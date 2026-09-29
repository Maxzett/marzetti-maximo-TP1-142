import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { estadoDeVenta } from '../../../core/catalogo/venta';
import { formatearDuracion } from '../../../core/formato/duracion';
import { formatearPrecio } from '../../../core/formato/precio';
import { DIAS_DE_LA_SEMANA, diaDeLaSemana } from '../../../core/funciones/programacion';
import { Pelicula } from '../../../core/models/pelicula';
import { SelloEdad } from '../../../shared/sello-edad/sello-edad';
import {
  desdeIso,
  formatearDiaYMes,
  hoyIso,
  nombreMes,
} from '../../../shared/selector-fecha/fechas';
import { BotonAlerta } from '../../proximamente/boton-alerta';

interface TacoDeFecha {
  dia: string;
  numero: string;
  mes: string;
  /** "jueves 15 de octubre": lo que lee el lector de pantalla en vez de las tres piezas */
  completa: string;
}

/**
 * La franja de Próximamente de la portada (RF-08): los estrenos más cercanos, cada uno con su
 * fecha en un taco de calendario, la sinopsis y el aviso de venta (RF-42). La sección completa,
 * con preventas y avisos cumplidos, sigue en /proximamente.
 *
 * Mismo criterio de enlace que las fichas: uno solo, en el título, estirado sobre la tarjeta.
 * El botón del aviso queda por encima (boton-alerta ya se pone z-index para eso).
 */
@Component({
  imports: [BotonAlerta, RouterLink, SelloEdad],
  selector: 'app-estrenos',
  styleUrl: './estrenos.css',
  templateUrl: './estrenos.html',
})
export class Estrenos {
  readonly peliculas = input.required<readonly Pelicula[]>();
  /** 'AAAA-MM-DD'. Es input para que un test o el catálogo vivo puedan fijar el día */
  readonly hoy = input(hoyIso());

  protected taco(pelicula: Pelicula): TacoDeFecha | null {
    const iso = pelicula.fecha_estreno ?? '';
    const fecha = desdeIso(iso);
    const dia = diaDeLaSemana(iso);

    if (!fecha || dia === null) {
      return null;
    }

    return {
      dia: DIAS_DE_LA_SEMANA[dia - 1].corto,
      numero: String(fecha.dia).padStart(2, '0'),
      mes: nombreMes(fecha.mes, 'short').replace('.', ''),
      completa: formatearDiaYMes(iso),
    };
  }

  protected datos(pelicula: Pelicula): string {
    return [
      ...pelicula.generos.map((genero) => genero.nombre),
      formatearDuracion(pelicula.duracion_minutos),
    ].join(' · ');
  }

  /** Null si todavía no se vende: en ese caso va el botón del aviso */
  protected venta(pelicula: Pelicula): string | null {
    const { aLaVenta, enPreventa } = estadoDeVenta(pelicula, this.hoy());

    if (!aLaVenta) {
      return null;
    }

    return enPreventa && pelicula.precio_preventa !== null
      ? `En preventa · ${formatearPrecio(pelicula.precio_preventa)}`
      : 'Entradas a la venta';
  }
}
