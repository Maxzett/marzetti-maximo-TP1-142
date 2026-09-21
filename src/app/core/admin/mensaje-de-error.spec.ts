import { mensajeDeError } from './mensaje-de-error';

describe('mensajeDeError', () => {
  it('muestra tal cual el mensaje de los errores que la base lanza a propósito', () => {
    const mensaje = 'La función tiene entradas vendidas y no se puede dar de baja';

    expect(mensajeDeError({ code: '55000', message: mensaje })).toBe(mensaje);
    expect(mensajeDeError({ code: '22023', message: 'El precio base no puede ser negativo' })).toBe(
      'El precio base no puede ser negativo',
    );
    expect(mensajeDeError({ code: 'P0002', message: 'La función no existe' })).toBe(
      'La función no existe',
    );
  });

  it('traduce la falta de permiso sin exponer el texto de Postgres', () => {
    const mensaje = mensajeDeError({
      code: '42501',
      message: 'permission denied for table funciones',
    });

    expect(mensaje).toContain('administración');
    expect(mensaje).not.toContain('permission denied');
  });

  it('avisa que la sala se ocupó cuando gana otra alta la carrera', () => {
    const mensaje = mensajeDeError({
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint "funciones_sin_solapamiento"',
    });

    expect(mensaje).toContain('Probá de nuevo');
    expect(mensaje).not.toContain('constraint');
  });

  it('traduce el nombre de sala repetido', () => {
    expect(mensajeDeError({ code: '23505', message: 'duplicate key' })).toBe(
      'Ya existe una sala con ese nombre.',
    );
  });

  it('un error imprevisto no se muestra crudo', () => {
    const mensaje = mensajeDeError({ code: 'XX000', message: 'internal error at line 42' });

    expect(mensaje).not.toContain('line 42');
    expect(mensaje).toContain('Probá de nuevo');
  });

  it('un error sin código tampoco se muestra crudo', () => {
    expect(mensajeDeError({ message: 'Failed to fetch' })).not.toContain('fetch');
  });
});
