import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { COLORES_DE_OJOS, ColorOjos, TIPOS_DE_SANGRE, TipoSangre } from '../../core/models/perfil';
import { Auth } from '../../core/services/auth';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { hoyIso } from '../../shared/selector-fecha/fechas';
import { SelectorFecha } from '../../shared/selector-fecha/selector-fecha';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';

/** Pone en mayúscula la primera letra para mostrar 'marrones' como 'Marrones' */
function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

@Component({
  imports: [Boton, Campo, Mensaje, RouterLink, SelectorFecha, Seleccion],
  selector: 'app-registrarme',
  styleUrl: './registrarme.css',
  templateUrl: './registrarme.html',
})
export class Registrarme {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  /** afterNextRender se llama desde un manejador de eventos, fuera del contexto de inyección */
  private readonly inyector = inject(Injector);

  private readonly resumen = viewChild<ElementRef<HTMLElement>>('resumen');

  /** Las listas salen de los modelos, que son los mismos valores del CHECK de la base */
  protected readonly opcionesSangre: readonly OpcionSeleccion[] = TIPOS_DE_SANGRE.map((valor) => ({
    valor,
    texto: valor,
  }));

  protected readonly opcionesOjos: readonly OpcionSeleccion[] = COLORES_DE_OJOS.map((valor) => ({
    valor,
    texto: capitalizar(valor),
  }));

  /** Nadie nació mañana: el selector no deja elegir una fecha futura (RF-38) */
  protected readonly hoy = hoyIso();

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly nombre = signal('');
  protected readonly apellido = signal('');
  protected readonly fechaNacimiento = signal('');
  protected readonly tipoSangre = signal('');
  protected readonly colorOjos = signal('');
  protected readonly diasVacaciones = signal('');

  protected readonly enviando = signal(false);
  protected readonly errorGeneral = signal('');
  protected readonly intentoHecho = signal(false);

  protected readonly errorEmail = computed(() => {
    if (!this.intentoHecho()) return '';
    const valor = this.email().trim();
    if (!valor) return 'Escribí tu mail.';
    // Validación deliberadamente laxa: la única comprobación seria de un mail es
    // mandarle uno. Acá solo se atajan los errores de tipeo evidentes.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) return 'Ese mail no parece válido.';
    return '';
  });

  protected readonly errorPassword = computed(() => {
    if (!this.intentoHecho()) return '';
    if (this.password().length < 6) return 'La contraseña necesita al menos 6 caracteres.';
    return '';
  });

  protected readonly errorNombre = computed(() =>
    this.intentoHecho() && !this.nombre().trim() ? 'Escribí tu nombre.' : '',
  );

  protected readonly errorApellido = computed(() =>
    this.intentoHecho() && !this.apellido().trim() ? 'Escribí tu apellido.' : '',
  );

  protected readonly errorFecha = computed(() => {
    if (!this.intentoHecho()) return '';
    if (!this.fechaNacimiento()) return 'Elegí tu fecha de nacimiento.';
    return '';
  });

  protected readonly errorSangre = computed(() =>
    this.intentoHecho() && !this.tipoSangre() ? 'Elegí tu tipo de sangre.' : '',
  );

  protected readonly errorOjos = computed(() =>
    this.intentoHecho() && !this.colorOjos() ? 'Elegí tu color de ojos.' : '',
  );

  protected readonly errorVacaciones = computed(() => {
    if (!this.intentoHecho()) return '';
    const texto = this.diasVacaciones().trim();
    if (!texto) return 'Escribí cuántos días de vacaciones tenés por año.';
    const dias = Number(texto);
    if (!Number.isInteger(dias) || dias < 0 || dias > 365)
      return 'Tiene que ser un número entre 0 y 365.';
    return '';
  });

  protected readonly hayErrores = computed(
    () =>
      !!(
        this.errorEmail() ||
        this.errorPassword() ||
        this.errorNombre() ||
        this.errorApellido() ||
        this.errorFecha() ||
        this.errorSangre() ||
        this.errorOjos() ||
        this.errorVacaciones()
      ),
  );

  protected async alEnviar(evento: Event): Promise<void> {
    evento.preventDefault();
    this.intentoHecho.set(true);
    this.errorGeneral.set('');

    if (this.hayErrores()) {
      // El formulario es largo: el primer error puede quedar fuera de la pantalla y
      // quien envía no se entera de por qué no pasó nada. El foco va al resumen, que
      // recién se dibuja en este ciclo — de ahí el afterNextRender (WCAG 3.3.1).
      afterNextRender(() => this.resumen()?.nativeElement.focus(), { injector: this.inyector });
      return;
    }

    this.enviando.set(true);
    const error = await this.auth.registrar({
      email: this.email().trim(),
      password: this.password(),
      nombre: this.nombre().trim(),
      apellido: this.apellido().trim(),
      fechaNacimiento: this.fechaNacimiento(),
      tipoSangre: this.tipoSangre() as TipoSangre,
      colorOjos: this.colorOjos() as ColorOjos,
      diasVacaciones: Number(this.diasVacaciones()),
    });
    this.enviando.set(false);

    if (error) {
      this.errorGeneral.set(error);
      afterNextRender(() => this.resumen()?.nativeElement.focus(), { injector: this.inyector });
      return;
    }

    await this.router.navigateByUrl('/perfil');
  }
}
