import { RegistroDeActividad } from '../models/reportes';
import { ACCIONES_DEL_LOG, describirAccion, describirActor, nombreDeAccion } from './log';

const registro = (
  accion: string,
  detalle: Record<string, unknown> = {},
  cambios: Partial<RegistroDeActividad> = {},
): RegistroDeActividad => ({
  id: 1,
  accion,
  entidad: 'x',
  entidad_id: null,
  detalle,
  creado_at: '2026-09-27T21:00:00Z',
  actor_email: 'ana@cine.com',
  actor_rol: 'admin',
  actor: { nombre: 'Ana', apellido: 'González' },
  ...cambios,
});

/** Intl separa el $ del número con un espacio duro que varía según el motor: se normaliza */
const normal = (texto: string) => texto.replace(/\$\s*/g, '$ ');

describe('log de actividad', () => {
  it('el cambio de precio dice qué, de cuánto y a cuánto (RF-61)', () => {
    const texto = describirAccion(
      registro('modificar_precio_producto', {
        nombre: 'Pochoclo grande',
        antes: 6500,
        despues: 7000,
      }),
    );

    expect(normal(texto)).toBe('Cambió el precio de Pochoclo grande de $ 6.500 a $ 7.000.');
  });

  it('el alta de una función dice película, sala y horario del cine', () => {
    const texto = describirAccion(
      registro('crear_funcion', {
        pelicula: 'Dune',
        sala: 'Sala 1',
        inicio: '2026-09-28T21:00:00Z',
      }),
    );

    expect(texto).toBe('Programó una función de Dune en Sala 1 para lun 28/09 · 18:00.');
  });

  it('la validación dice la orden y la película', () => {
    expect(
      describirAccion(registro('validar_entrada', { codigo: 'ABC123', pelicula: 'Dune' })),
    ).toBe('Validó el ingreso de la orden ABC123 (Dune).');
  });

  it('el rechazo dice el tramo y el motivo', () => {
    expect(
      describirAccion(
        registro('validacion_rechazada', { codigo: 'ABC123', tramo: 'candy', motivo: 'ya_usado' }),
      ),
    ).toBe('Rechazó el candy de la orden ABC123: ya se había usado.');
  });

  it('una baja lógica se dice con palabras', () => {
    expect(
      describirAccion(
        registro('modificar_combo', {
          nombre: 'Combo Candy',
          antes: { activo: true },
          despues: { activo: false },
        }),
      ),
    ).toBe('Modificó el combo Combo Candy (baja).');
  });

  it('el recargo VIP es un precio; el tope de butacas, una cantidad', () => {
    expect(
      normal(
        describirAccion(
          registro('modificar_configuracion', { clave: 'recargo_vip', antes: 2000, despues: 2500 }),
        ),
      ),
    ).toBe('Cambió el recargo VIP de $ 2.000 a $ 2.500.');
    expect(
      describirAccion(
        registro('modificar_configuracion', {
          clave: 'max_butacas_por_orden',
          antes: 8,
          despues: 6,
        }),
      ),
    ).toBe('Cambió el tope de butacas por compra de 8 a 6.');
  });

  it('un detalle incompleto no rompe la frase', () => {
    expect(describirAccion(registro('modificar_precio_funcion', {}))).toBe(
      'Cambió el precio de la función.',
    );
    expect(describirAccion(registro('cancelar_orden', {}))).toBe('Canceló una compra.');
  });

  it('una acción desconocida se muestra con su nombre, no se esconde', () => {
    expect(describirAccion(registro('accion_nueva'))).toBe('accion_nueva');
    expect(nombreDeAccion('accion_nueva')).toBe('accion_nueva');
  });

  it('todas las acciones del filtro tienen frase propia', () => {
    for (const { accion } of ACCIONES_DEL_LOG) {
      const frase = describirAccion(registro(accion));
      expect(frase).not.toBe(accion);
      // Un dato que falta no deja un hueco en la frase
      expect(frase).not.toMatch(/ \.$|  /);
    }
  });

  describe('describirActor', () => {
    it('nombre e inicial del apellido', () => {
      expect(describirActor(registro('x'))).toBe('Ana G.');
    });

    it('si la cuenta ya no existe, el mail que quedó copiado', () => {
      expect(describirActor(registro('x', {}, { actor: null }))).toBe('ana@cine.com');
    });

    it('sin actor ni mail es una operación del sistema (el seed, el editor SQL)', () => {
      expect(describirActor(registro('x', {}, { actor: null, actor_email: null }))).toBe('Sistema');
    });
  });
});
