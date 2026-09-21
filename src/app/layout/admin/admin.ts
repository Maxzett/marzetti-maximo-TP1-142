import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Marco del panel de administración. Es solo eso: la navegación entre sus secciones y el
 * lugar donde se dibuja la sección elegida. Cada pantalla vive en su propia carpeta de
 * features/ y se carga aparte, así que quien no es administrador no descarga nada de esto.
 *
 * El acceso lo filtra el guard `rolRequerido('admin')` de la ruta, que es una ayuda de
 * interfaz (RNF-09): lo que impide de verdad tocar los datos son las funciones de la base,
 * que verifican el rol por su cuenta. La F9 le suma reportes y log a este mismo marco.
 */
@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-admin',
  styleUrl: './admin.css',
  templateUrl: './admin.html',
})
export class Admin {}
