import { Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { formatearPrecio, leerImporte } from '../../core/formato/precio';
import { CategoriaDeProducto } from '../../core/models/candy';
import {
  CandyGestionado,
  ComboGestionado,
  ItemDeComboGestionado,
  ProductoGestionado,
} from '../../core/models/gestion';
import { Gestion } from '../../core/services/gestion';
import { Boton } from '../../shared/boton/boton';
import { Campo } from '../../shared/campo/campo';
import { Cantidad } from '../../shared/cantidad/cantidad';
import { Dialogo } from '../../shared/dialogo/dialogo';
import { Mensaje } from '../../shared/mensaje/mensaje';
import { OpcionSeleccion, Seleccion } from '../../shared/seleccion/seleccion';
import { Spinner } from '../../shared/spinner/spinner';

/** Un renglón de producto en el editor de combos */
interface RenglonDeCombo {
  producto_id: string;
  cantidad: number;
}

/**
 * Candy bar desde el panel (RF-33, RF-36, RF-37, RF-56): categorías, productos con su precio y
 * combos con su contenido.
 *
 * Nada se borra: productos y combos se dan de baja y se pueden reactivar, porque las ventas de
 * ayer los referencian. Las reglas que protegen lo vendido las pone la base y esta pantalla
 * muestra su mensaje: no se da de baja un producto que un combo activo sigue entregando, y no
 * se cambia el contenido de un combo que ya se vendió (sí su precio, que cada orden congeló).
 */
@Component({
  imports: [Boton, Campo, Cantidad, Dialogo, Mensaje, Seleccion, Spinner],
  selector: 'app-admin-candy',
  styleUrls: ['../../layout/admin/pantalla-admin.css', './admin-candy.css'],
  templateUrl: './admin-candy.html',
})
export class AdminCandy {
  private readonly gestion = inject(Gestion);

  protected readonly precio = formatearPrecio;

  protected readonly cargando = signal(true);
  protected readonly candy = signal<CandyGestionado | null>(null);
  protected readonly aviso = signal('');

  protected readonly opcionesDeCategoria = computed<OpcionSeleccion[]>(() =>
    (this.candy()?.categorias ?? []).map((c) => ({ valor: c.id, texto: c.nombre })),
  );

  /** Para el combo solo se ofrecen productos activos: la base rechaza los dados de baja */
  protected readonly opcionesDeProducto = computed<OpcionSeleccion[]>(() =>
    (this.candy()?.productos ?? [])
      .filter((p) => p.activo)
      .map((p) => ({ valor: p.id, texto: p.nombre })),
  );

  private readonly nombresDeCategoria = computed(
    () => new Map((this.candy()?.categorias ?? []).map((c) => [c.id, c.nombre])),
  );

  private readonly nombresDeProducto = computed(
    () => new Map((this.candy()?.productos ?? []).map((p) => [p.id, p.nombre])),
  );

  // ── Categoría ──
  protected readonly categoriaAbierta = signal(false);
  protected readonly categoriaId = signal<string | null>(null);
  protected readonly catNombre = signal('');
  protected readonly catOrden = signal('0');

  // ── Producto ──
  protected readonly productoAbierto = signal(false);
  protected readonly productoId = signal<string | null>(null);
  protected readonly prodCategoria = signal('');
  protected readonly prodNombre = signal('');
  protected readonly prodDescripcion = signal('');
  protected readonly prodPrecio = signal('');
  protected readonly prodActivo = signal(true);

  // ── Combo ──
  protected readonly comboAbierto = signal(false);
  protected readonly comboId = signal<string | null>(null);
  protected readonly comboNombre = signal('');
  protected readonly comboDescripcion = signal('');
  protected readonly comboPrecio = signal('');
  protected readonly comboDestacado = signal(true);
  protected readonly comboActivo = signal(true);
  protected readonly comboEntradas = signal(0);
  protected readonly comboRenglones = signal<RenglonDeCombo[]>([]);

  // ── Estado compartido de los tres diálogos: solo uno está abierto a la vez ──
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  constructor() {
    void this.cargar();
  }

  protected nombreDeCategoria(id: string): string {
    return this.nombresDeCategoria().get(id) ?? '';
  }

  /** "1 entrada · 1 × Pochoclo mediano · 1 × Gaseosa 500 ml" */
  protected describirCombo(combo: ComboGestionado): string {
    return [...combo.combo_items]
      .sort((a, b) => Number(b.incluye_entrada) - Number(a.incluye_entrada))
      .map((item) =>
        item.incluye_entrada
          ? `${item.cantidad} ${item.cantidad === 1 ? 'entrada' : 'entradas'}`
          : `${item.cantidad} × ${this.nombresDeProducto().get(item.producto_id ?? '') ?? 'producto'}`,
      )
      .join(' · ');
  }

  // ── Categorías ──
  protected abrirCategoria(categoria: CategoriaDeProducto | null): void {
    this.categoriaId.set(categoria?.id ?? null);
    this.catNombre.set(categoria?.nombre ?? '');
    this.catOrden.set(String(categoria?.orden ?? (this.candy()?.categorias.length ?? 0) + 1));
    this.abrir(this.categoriaAbierta);
  }

  protected async guardarCategoria(): Promise<void> {
    const orden = Number(this.catOrden());

    if (!this.catNombre().trim()) {
      this.error.set('Escribí el nombre de la categoría.');
      return;
    }
    if (!Number.isInteger(orden) || orden < 0 || orden > 999) {
      this.error.set('El orden es un número entero de 0 a 999.');
      return;
    }

    await this.guardar(
      () =>
        this.gestion.guardarCategoria({ id: this.categoriaId(), nombre: this.catNombre(), orden }),
      this.categoriaAbierta,
      `Guardamos la categoría ${this.catNombre().trim()}.`,
    );
  }

  // ── Productos ──
  protected abrirProducto(producto: ProductoGestionado | null): void {
    this.productoId.set(producto?.id ?? null);
    this.prodCategoria.set(producto?.categoria_id ?? this.candy()?.categorias[0]?.id ?? '');
    this.prodNombre.set(producto?.nombre ?? '');
    this.prodDescripcion.set(producto?.descripcion ?? '');
    this.prodPrecio.set(producto ? String(producto.precio) : '');
    this.prodActivo.set(producto?.activo ?? true);
    this.abrir(this.productoAbierto);
  }

  protected async guardarProducto(): Promise<void> {
    const precio = leerImporte(this.prodPrecio());

    if (!this.prodNombre().trim()) {
      this.error.set('Escribí el nombre del producto.');
      return;
    }
    if (!this.prodCategoria()) {
      this.error.set('Elegí una categoría.');
      return;
    }
    if (precio === null) {
      this.error.set('El precio es un importe en pesos, cero o más.');
      return;
    }

    await this.guardar(
      () =>
        this.gestion.guardarProducto({
          id: this.productoId(),
          categoria_id: this.prodCategoria(),
          nombre: this.prodNombre(),
          descripcion: this.prodDescripcion(),
          precio,
          activo: this.prodActivo(),
        }),
      this.productoAbierto,
      `Guardamos ${this.prodNombre().trim()}.`,
    );
  }

  // ── Combos ──
  protected abrirCombo(combo: ComboGestionado | null): void {
    const items = combo?.combo_items ?? [];

    this.comboId.set(combo?.id ?? null);
    this.comboNombre.set(combo?.nombre ?? '');
    this.comboDescripcion.set(combo?.descripcion ?? '');
    this.comboPrecio.set(combo ? String(combo.precio) : '');
    this.comboDestacado.set(combo?.destacado ?? true);
    this.comboActivo.set(combo?.activo ?? true);
    this.comboEntradas.set(items.find((i) => i.incluye_entrada)?.cantidad ?? 0);
    this.comboRenglones.set(
      items
        .filter((i) => !i.incluye_entrada && i.producto_id)
        .map((i) => ({ producto_id: i.producto_id as string, cantidad: i.cantidad })),
    );
    this.abrir(this.comboAbierto);
  }

  protected agregarRenglon(): void {
    this.comboRenglones.update((renglones) => [...renglones, { producto_id: '', cantidad: 1 }]);
  }

  protected quitarRenglon(indice: number): void {
    this.comboRenglones.update((renglones) => renglones.filter((_, i) => i !== indice));
  }

  protected cambiarRenglon(indice: number, cambio: Partial<RenglonDeCombo>): void {
    this.comboRenglones.update((renglones) =>
      renglones.map((renglon, i) => (i === indice ? { ...renglon, ...cambio } : renglon)),
    );
  }

  protected async guardarCombo(): Promise<void> {
    const precio = leerImporte(this.comboPrecio());
    const renglones = this.comboRenglones();
    const productos = renglones.map((r) => r.producto_id);

    if (!this.comboNombre().trim()) {
      this.error.set('Escribí el nombre del combo.');
      return;
    }
    if (precio === null) {
      this.error.set('El precio es un importe en pesos, cero o más.');
      return;
    }
    if (productos.some((id) => !id)) {
      this.error.set('Elegí el producto de cada renglón, o quitá el renglón.');
      return;
    }
    if (new Set(productos).size !== productos.length) {
      this.error.set('Cada producto va una sola vez: sumá la cantidad en vez de repetirlo.');
      return;
    }
    if (this.comboEntradas() === 0 && renglones.length === 0) {
      this.error.set('El combo tiene que incluir algo.');
      return;
    }

    const items: ItemDeComboGestionado[] = [
      ...(this.comboEntradas() > 0
        ? [{ producto_id: null, incluye_entrada: true, cantidad: this.comboEntradas() }]
        : []),
      ...renglones.map((r) => ({ ...r, incluye_entrada: false })),
    ];

    await this.guardar(
      () =>
        this.gestion.guardarCombo({
          id: this.comboId(),
          nombre: this.comboNombre(),
          descripcion: this.comboDescripcion(),
          precio,
          destacado: this.comboDestacado(),
          activo: this.comboActivo(),
          combo_items: items,
        }),
      this.comboAbierto,
      `Guardamos el combo ${this.comboNombre().trim()}.`,
    );
  }

  protected casilla(evento: Event): boolean {
    return (evento.target as HTMLInputElement).checked;
  }

  private abrir(dialogo: WritableSignal<boolean>): void {
    this.error.set('');
    this.aviso.set('');
    dialogo.set(true);
  }

  /** Espera la escritura; si la base la rechaza, el motivo queda en el diálogo abierto */
  private async guardar(
    escribir: () => Promise<string | null>,
    dialogo: WritableSignal<boolean>,
    exito: string,
  ): Promise<void> {
    this.guardando.set(true);
    this.error.set('');

    const error = await escribir();
    this.guardando.set(false);

    if (error) {
      this.error.set(error);
      return;
    }

    dialogo.set(false);
    await this.cargar();
    this.aviso.set(exito);
  }

  private async cargar(): Promise<void> {
    this.candy.set(await this.gestion.cargarCandy());
    this.cargando.set(false);
  }
}
