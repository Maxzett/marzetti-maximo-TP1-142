-- Pruebas del panel de administración: reportes, log y gestión del candy y las promociones
-- (RF-56 a RF-61, RN-12, RNF-11)
--
-- ══ LEER ANTES DE CORRER ═══════════════════════════════════════════════════
--
-- 1. El editor SQL de Supabase corre como `postgres`, que NO está sujeto a RLS.
--    Cada bloque suplanta el rol con set local role y el usuario con request.jwt.claims.
-- 2. Correr DE A UN BLOQUE. Los marcados ERROR esperan una excepción.
-- 3. Todo termina en ROLLBACK: no deja rastro, ni en las tablas ni en el log.
-- 4. Hace falta haber corrido 0024.
--
-- Reemplazar en cada bloque estos valores por los reales:
--   ADMIN_ID     el id de una cuenta admin
--   CLIENTE_ID   el id de una cuenta cliente
--   EMPLEADO_ID  el id de una cuenta empleado
-- (select id, email, rol from perfiles;)
--
-- La misma batería se corrió, más completa (97 comprobaciones: anon, cliente y empleado
-- contra cada una de las nueve funciones, órdenes pagada/pendiente/cancelada en el reporte,
-- combos, cupones, recompensas y configuración), contra Postgres en WASM.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · Un cliente no ve reportes ────────────────────────────────────
-- Espera: ERROR 42501 "Solo la administración puede ver los reportes"

begin;
  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  set local role authenticated;
  select * from public.reporte_facturacion(current_date - 7, current_date);
rollback;


-- ── BLOQUE 2 · El empleado tampoco: validar entradas no es administrar ──────
-- Espera: ERROR 42501

begin;
  select set_config('request.jwt.claims', '{"sub":"EMPLEADO_ID"}', true);
  set local role authenticated;
  select public.guardar_configuracion('recargo_vip', 0);
rollback;


-- ── BLOQUE 3 · El log: el admin lo lee, nadie más ───────────────────────────
-- Espera: cliente 0, empleado 0 (la política no los deja ver ni una fila, aunque las
-- validaciones del empleado estén ahí) y admin > 0.

begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  select 'cliente' as quien, count(*) from public.log_actividad;
  select set_config('request.jwt.claims', '{"sub":"EMPLEADO_ID"}', true);
  select 'empleado' as quien, count(*) from public.log_actividad;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  select 'admin' as quien, count(*) from public.log_actividad;
rollback;


-- ── BLOQUE 4 · El log no se edita, ni siquiera el admin (RN-12) ─────────────
-- Espera: ERROR 42501 permission denied for table log_actividad

begin;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  set local role authenticated;
  delete from public.log_actividad;
rollback;


-- ── BLOQUE 5 · Facturación por día ──────────────────────────────────────────
-- Espera: una fila por día de los últimos 7, los días sin ventas en cero. Comparar `cobrado`
-- con la consulta de control de abajo (que corre como postgres, sin RLS): tienen que dar lo
-- mismo. Las canceladas suman a `cobrado` (la cancelación no devuelve dinero) pero no a
-- `entradas` (la butaca se liberó).

begin;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  set local role authenticated;
  select * from public.reporte_facturacion(current_date - 6, current_date);
rollback;

-- Control:
-- select (pagada_at at time zone 'America/Argentina/Buenos_Aires')::date as dia, estado,
--        count(*), sum(total)
--   from public.ordenes where estado in ('pagada', 'cancelada') group by 1, 2 order by 1;


-- ── BLOQUE 6 · Más vistas y candy más vendido ───────────────────────────────
-- Espera: las películas con entradas vendidas en funciones de esta semana y de este mes, y el
-- top 5 de productos del último mes (los de combos suman su contenido). El top 3 de la
-- portada (pendiente desde la F4) ordena por la misma cuenta.

begin;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  set local role authenticated;
  select * from public.peliculas_mas_vistas('semana', current_date);
  select * from public.peliculas_mas_vistas('mes', current_date);
  select * from public.productos_mas_vendidos(current_date - 30, current_date);
  select * from public.peliculas_mas_vendidas(3);
rollback;


-- ── BLOQUE 7 · Un cambio de precio queda en el log con antes y después ──────
-- Espera: una fila modificar_precio_producto con "antes" y "despues", actor = el admin.

begin;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  set local role authenticated;
  select public.guardar_producto(p.id, p.categoria_id, p.nombre, p.descripcion, p.precio + 100, p.activo)
    from public.productos p where p.nombre = 'Pochoclo chico';
  select accion, actor_email, detalle from public.log_actividad
   where accion = 'modificar_precio_producto' order by creado_at desc limit 1;
rollback;


-- ── BLOQUE 8 · El contenido de un combo vendido no se cambia ────────────────
-- Requiere que alguien haya comprado el "Combo Candy". Si nadie lo compró, el cambio pasa
-- (es lo correcto: sin ventas se puede editar).
-- Espera: ERROR 55000 "El combo ya se vendió y su contenido no se puede cambiar..."

begin;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  set local role authenticated;
  select public.guardar_combo(c.id, c.nombre, c.descripcion, c.precio, c.destacado, c.activo,
           jsonb_build_array(jsonb_build_object(
             'producto_id', (select id from public.productos where nombre = 'Pochoclo grande'),
             'cantidad', 1)))
    from public.combos c where c.nombre = 'Combo Candy';
rollback;


-- ── BLOQUE 9 · Un solo cupón de bienvenida activo ───────────────────────────
-- Espera: ERROR 55000 "Ya hay un cupón de bienvenida activo..."

begin;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  set local role authenticated;
  select public.guardar_cupon(null, 'OTRABIENVENIDA', 'bienvenida', 'porcentaje', 10,
                              null, null, null, true);
rollback;


-- ── BLOQUE 10 · Los cupones siguen sin lista pública ────────────────────────
-- Espera: cliente 0, admin >= 2.

begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  select 'cliente' as quien, count(*) from public.cupones;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  select 'admin' as quien, count(*) from public.cupones;
rollback;
