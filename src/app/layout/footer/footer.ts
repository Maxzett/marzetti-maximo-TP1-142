import { Component } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-footer',
  styleUrl: './footer.css',
  templateUrl: './footer.html',
})
export class Footer {
  // Se calcula una sola vez al crear el componente: alcanza para mostrar el año
  protected readonly anioActual = new Date().getFullYear();
}
