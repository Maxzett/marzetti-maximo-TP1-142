import { describirInicio } from '../funciones/programacion';
import { formatearPrecio, formatearPuntos } from '../formato/precio';
import { RegistroDeActividad } from '../models/reportes';
import { MotivoDeRechazo } from '../models/validacion';

/**
 * El log de actividad (RF-61) en palabras. La base guarda la acción y un `detalle` en JSON con
 * los datos del momento (0019, 0022, 0023, 0024); acá se convierte en la frase que lee el
 * administrador: "Cambió el precio de Pochoclo grande de $ 6.500 a $ 7.000".
 *
 * Se lee lo que el detalle trae y nada más: si un dato falta (un registro viejo, una acción que
 * todavía no tiene frase), se muestra lo que haya en vez de fallar. El log no se reescribe, así
 * que esta traducción tiene que tolerar cualquier registro que exista.
 */

/** Las acciones que se registran, con su nombre corto para el filtro de la pantalla */
export const ACCIONES_DEL_LOG: readonly { accion: string; nombre: string }[] = [
  { accion: 'crear_funcion', nombre: 'Alta de función' },
  { accion: 'modificar_funcion', nombre: 'Cambio de función' },
  { accion: 'modificar_precio_funcion', nombre: 'Precio de función' },
  { accion: 'baja_funcion', nombre: 'Baja de función' },
  { accion: 'crear_sala', nombre: 'Alta de sala' },
  { accion: 'modificar_sala', nombre: 'Cambio de sala' },
  { accion: 'validar_entrada', nombre: 'Ingreso validado' },
  { accion: 'entregar_candy', nombre: 'Candy entregado' },
  { accion: 'validacion_rechazada', nombre: 'Validación rechazada' },
  { accion: 'cancelar_orden', nombre: 'Compra cancelada' },
  { accion: 'crear_categoria', nombre: 'Alta de categoría' },
  { accion: 'modificar_categoria', nombre: 'Cambio de categoría' },
  { accion: 'crear_producto', nombre: 'Alta de producto' },
  { accion: 'modificar_producto', nombre: 'Cambio de producto' },
  { accion: 'modificar_precio_producto', nombre: 'Precio de producto' },
  { accion: 'crear_combo', nombre: 'Alta de combo' },
  { accion: 'modificar_combo', nombre: 'Cambio de combo' },
  { accion: 'modificar_precio_combo', nombre: 'Precio de combo' },
  { accion: 'crear_cupon', nombre: 'Alta de cupón' },
  { accion: 'modificar_cupon', nombre: 'Cambio de cupón' },
  { accion: 'crear_recompensa', nombre: 'Alta de recompensa' },
  { accion: 'modificar_recompensa', nombre: 'Cambio de recompensa' },
  { accion: 'modificar_configuracion', nombre: 'Configuración' },
];

const MOTIVOS: Record<Exclude<MotivoDeRechazo, 'no_existe'>, string> = {
  estado: 'la compra no está pagada',
  sin_candy: 'la compra no incluye candy',
  fuera_de_ventana: 'fuera del horario de la función',
  ya_usado: 'ya se había usado',
};

const OPCIONES: Record<string, string> = {
  recargo_vip: 'el recargo VIP',
  max_butacas_por_orden: 'el tope de butacas por compra',
  max_unidades_por_producto: 'el tope de unidades por producto',
};

export function nombreDeAccion(accion: string): string {
  return ACCIONES_DEL_LOG.find((a) => a.accion === accion)?.nombre ?? accion;
}

/** "Ana G." como en el panel del empleado; si la cuenta ya no existe, el mail que quedó copiado */
export function describirActor(registro: RegistroDeActividad): string {
  if (registro.actor) {
    const inicial = registro.actor.apellido.trim().charAt(0);
    return inicial ? `${registro.actor.nombre} ${inicial}.` : registro.actor.nombre;
  }

  return registro.actor_email ?? 'Sistema';
}

export function describirAccion(registro: RegistroDeActividad): string {
  const d = registro.detalle ?? {};
  const texto = (clave: string) => (typeof d[clave] === 'string' ? (d[clave] as string) : '');
  const antes = objeto(d['antes']);
  const despues = objeto(d['despues']);
  const pelicula = texto('pelicula');
  const nombre = texto('nombre');
  const de = (quien: string) => (quien ? ` de ${quien}` : '');
  const sujeto = (quien: string) => (quien ? ` ${quien}` : '');

  switch (registro.accion) {
    case 'crear_funcion':
      return `Programó una función${de(pelicula)}${texto('sala') ? ` en ${texto('sala')}` : ''}${cuando(d['inicio'])}.`;
    case 'modificar_funcion':
      return `Movió la función${de(pelicula)}${cuando(antes['inicio'], 'del')}${cuando(despues['inicio'], 'al')}.`;
    case 'modificar_precio_funcion':
      return `Cambió el precio de la función${de(pelicula)}${deA(d['antes'], d['despues'], formatearPrecio)}.`;
    case 'baja_funcion':
      return `Dio de baja la función${de(pelicula)}${cuando(d['inicio'], 'del')}.`;
    case 'crear_sala':
      return `Dio de alta la sala${nombre ? ` ${nombre}` : ''}.`;
    case 'modificar_sala':
      return describirCambioDeSala(antes, despues);
    case 'validar_entrada':
      return `Validó el ingreso${deOrden(texto('codigo'), pelicula)}.`;
    case 'entregar_candy':
      return `Entregó el candy${deOrden(texto('codigo'), pelicula)}.`;
    case 'validacion_rechazada': {
      const tramo = texto('tramo') === 'candy' ? 'el candy' : 'el ingreso';
      const motivo = MOTIVOS[texto('motivo') as keyof typeof MOTIVOS];
      return `Rechazó ${tramo}${deOrden(texto('codigo'), pelicula)}${motivo ? `: ${motivo}` : ''}.`;
    }
    case 'cancelar_orden': {
      const credito = aNumero(d['credito']) ?? 0;
      return credito > 0
        ? `Canceló una compra y recibió ${formatearPrecio(credito)} de crédito.`
        : 'Canceló una compra.';
    }
    case 'crear_categoria':
      return `Creó la categoría${sujeto(nombre)}.`;
    case 'modificar_categoria':
      return `Modificó la categoría${sujeto(texto2(antes['nombre']))}${antes['nombre'] !== despues['nombre'] ? ` (ahora ${texto2(despues['nombre'])})` : ''}.`;
    case 'crear_producto':
      return `Creó el producto${sujeto(nombre)}${precioInicial(d['precio'])}.`;
    case 'modificar_producto':
      return `Modificó el producto${sujeto(nombre)}${estado(antes['activo'], despues['activo'])}.`;
    case 'modificar_precio_producto':
      return `Cambió el precio${de(nombre)}${deA(d['antes'], d['despues'], formatearPrecio)}.`;
    case 'crear_combo':
      return `Creó el combo${sujeto(nombre)}${precioInicial(d['precio'])}.`;
    case 'modificar_combo':
      return `Modificó el combo${sujeto(nombre)}${estado(antes['activo'], despues['activo'])}.`;
    case 'modificar_precio_combo':
      return `Cambió el precio del combo${sujeto(nombre)}${deA(d['antes'], d['despues'], formatearPrecio)}.`;
    case 'crear_cupon':
      return `Creó el cupón${sujeto(texto('codigo'))}.`;
    case 'modificar_cupon':
      return `Modificó el cupón${sujeto(texto('codigo'))}${estado(antes['activo'], despues['activo'])}.`;
    case 'crear_recompensa': {
      const costo = aNumero(d['costo_puntos']);
      return `Creó la recompensa${sujeto(nombre)}${costo === null ? '' : ` (${formatearPuntos(costo)} puntos)`}.`;
    }
    case 'modificar_recompensa':
      return `Modificó la recompensa${sujeto(nombre)}${deA(antes['costo_puntos'], despues['costo_puntos'], (p) => `${formatearPuntos(p)} puntos`)}${estado(antes['activa'], despues['activa'])}.`;
    case 'modificar_configuracion': {
      const clave = texto('clave');
      const formato = clave === 'recargo_vip' ? formatearPrecio : String;
      return `Cambió ${OPCIONES[clave] ?? (clave || 'la configuración')}${deA(d['antes'], d['despues'], formato)}.`;
    }
    default:
      return nombreDeAccion(registro.accion);
  }
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
}

function texto2(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

/** " para vie 25/09 · 18:00" si el detalle trae el instante */
function cuando(instante: unknown, preposicion = 'para'): string {
  const descripcion = typeof instante === 'string' ? describirInicio(instante) : '';
  return descripcion ? ` ${preposicion} ${descripcion}` : '';
}

/** " de $ 6.500 a $ 7.000": solo si los dos valores son números y distintos */
function deA(antes: unknown, despues: unknown, formato: (valor: number) => string): string {
  const a = aNumero(antes);
  const b = aNumero(despues);
  return a !== null && b !== null && a !== b ? ` de ${formato(a)} a ${formato(b)}` : '';
}

function precioInicial(precio: unknown): string {
  const valor = aNumero(precio);
  return valor === null ? '' : ` a ${formatearPrecio(valor)}`;
}

/** " (baja)" o " (reactivación)" si el cambio fue de estado */
function estado(antes: unknown, despues: unknown): string {
  if (antes === true && despues === false) {
    return ' (baja)';
  }
  if (antes === false && despues === true) {
    return ' (reactivación)';
  }
  return '';
}

function describirCambioDeSala(antes: Record<string, unknown>, despues: Record<string, unknown>) {
  const nombreAntes = texto2(antes['nombre']);
  const nombreDespues = texto2(despues['nombre']);
  const renombre =
    nombreAntes && nombreDespues && nombreAntes !== nombreDespues
      ? `Renombró la ${nombreAntes} como ${nombreDespues}`
      : `Modificó la ${nombreDespues || nombreAntes || 'sala'}`;
  return `${renombre}${estado(antes['activa'], despues['activa'])}.`;
}

function deOrden(codigo: string, pelicula: string): string {
  return `${codigo ? ` de la orden ${codigo}` : ''}${pelicula ? ` (${pelicula})` : ''}`;
}

/** PostgREST devuelve numeric dentro de un jsonb como número, pero un registro viejo podría traer texto */
function aNumero(valor: unknown): number | null {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  return typeof numero === 'number' && Number.isFinite(numero) ? numero : null;
}
