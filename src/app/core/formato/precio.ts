/**
 * Precio en pesos argentinos: "$ 6.500". Sin decimales cuando el importe es entero y con dos
 * cuando no, porque los precios de la base son numeric(10, 2) y un centavo no se puede perder
 * al mostrarlo. Lo usan las listas de la administración y, más adelante, la compra.
 *
 * Son dos formatos y no uno con mínimo 0 y máximo 2 decimales: ese muestra 6500,5 para
 * 6500.50, y un precio con un solo decimal se lee como un error.
 */
const configuracion = { style: 'currency', currency: 'ARS' } as const;
const ENTERO = new Intl.NumberFormat('es-AR', { ...configuracion, maximumFractionDigits: 0 });
const CON_CENTAVOS = new Intl.NumberFormat('es-AR', {
  ...configuracion,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatearPrecio(importe: number): string {
  return (Number.isInteger(importe) ? ENTERO : CON_CENTAVOS).format(importe);
}
