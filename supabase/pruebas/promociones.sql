-- Pruebas del candy, los cupones, los puntos, el crédito y la cancelación
-- (RF-30 a RF-37, RF-39, RF-40, RF-43 a RF-48, RN-06 a RN-09, D-06)
--
-- ══ LEER ANTES DE CORRER ═══════════════════════════════════════════════════
--
-- 1. El editor SQL de Supabase corre como `postgres`, que NO está sujeto a RLS.
--    Cada bloque suplanta el rol con set local role y el usuario con request.jwt.claims.
-- 2. Correr DE A UN BLOQUE. Los marcados ERROR esperan una excepción.
-- 3. Todo termina en ROLLBACK: no deja rastro.
-- 4. Hace falta haber corrido 0022 y los seeds 001, 003, 004 y 005.
--
-- Reemplazar en cada bloque estos valores por los reales:
--   FUNCION_ID  una función futura, a más de 2 horas de ahora
--   CLIENTE_ID  el id (perfiles.id) de una cuenta cliente que NO tenga compras pagadas
--   OTRO_ID     el id de otra cuenta cliente
-- (select f.id, p.titulo, f.inicio from funciones f join peliculas p on p.id = f.pelicula_id
--    where f.inicio > now() + interval '1 day' limit 20;)
-- (select id, email, rol from perfiles;)
--
-- La misma batería se corrió, más completa (91 comprobaciones: precio con combos y canje,
-- cupón por edad en el borde, crédito después del cupón, total cero, reversión de puntos
-- al cancelar), contra Postgres en WASM. No cubre concurrencia real: la serialización se
-- apoya en el FOR UPDATE de la orden y del perfil, que se razona, no se midió.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · La API no lee cupones, órdenes ni el libro mayor sin cuenta ───
-- Espera: cada select falla con ERROR 42501 permission denied

begin;
  set local role anon;
  select * from public.cupones;
rollback;

begin;
  set local role anon;
  select * from public.puntos_movimientos;
rollback;


-- ── BLOQUE 2 · El catálogo del candy es público ─────────────────────────────
-- Espera: 10+ productos, 3+ combos con sus ítems, 3+ recompensas

begin;
  set local role anon;
  select count(*) from public.productos;
  select c.nombre, count(ci.id) as items
    from public.combos c left join public.combo_items ci on ci.combo_id = c.id group by c.nombre;
  select nombre, costo_puntos from public.recompensas;
rollback;


-- ── BLOQUE 3 · Combo con entrada + producto, sin cuenta ─────────────────────
-- Espera: subtotal = 1 base + candy; la entrada del combo deja $0 de base y el desglose
-- lista 1 entrada, 1 producto y 1 combo. Total = subtotal (no hay cuenta, 0 puntos).

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.crear_orden('FUNCION_ID', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com', null);
  select public.configurar_orden(
    (select (public.crear_orden('FUNCION_ID', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com', null) ->> 'orden_id')::uuid),
    'sesion-aaaaaaaaaaaaaaaa',
    jsonb_build_array(jsonb_build_object('id', (select id from public.productos where nombre = 'Pochoclo grande'), 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('id', (select id from public.combos where nombre = 'Combo Entrada + Pochoclo + Gaseosa'), 'cantidad', 1)),
    null, false, null);
rollback;


-- ── BLOQUE 4 · Más combos con entrada que butacas ───────────────────────────
-- Espera: ERROR 22023 "Tenés más combos con entrada o canjes de entrada que butacas..."

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.configurar_orden(
    (select (public.crear_orden('FUNCION_ID', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com', null) ->> 'orden_id')::uuid),
    'sesion-aaaaaaaaaaaaaaaa', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('id', (select id from public.combos where nombre = 'Combo Pareja'), 'cantidad', 1)),
    null, false, null);
rollback;


-- ── BLOQUE 5 · Cupón de bienvenida sin cuenta ───────────────────────────────
-- Espera: ERROR 22023 "El cupón de bienvenida es solo para cuentas registradas."

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.configurar_orden(
    (select (public.crear_orden('FUNCION_ID', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com', null) ->> 'orden_id')::uuid),
    'sesion-aaaaaaaaaaaaaaaa', '[]'::jsonb, '[]'::jsonb, 'BIENVENIDA', false, null);
rollback;


-- ── BLOQUE 6 · Con cuenta: bienvenida, pago, puntos y segunda compra ────────
-- Espera: descuento_cupon = 20 % del subtotal; mis_saldos() después del pago muestra
-- puntos = pesos pagados y bienvenida = null; el último configurar_orden (segunda compra
-- con el mismo cupón) falla con ERROR 55000 "El cupón de bienvenida es para tu primera compra."

begin;
  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  set local role authenticated;
  select public.mis_saldos();
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-cccccccccccccccc');
  select public.configurar_orden(
    (select (public.crear_orden('FUNCION_ID', 'sesion-cccccccccccccccc', null, null) ->> 'orden_id')::uuid),
    'sesion-cccccccccccccccc', '[]'::jsonb, '[]'::jsonb, 'BIENVENIDA', false, null);
  -- El id de la orden se toma de nuevo: crear_orden reemplaza la pendiente de la sesión.
  select public.confirmar_pago(
    (select (public.crear_orden('FUNCION_ID', 'sesion-cccccccccccccccc', null, null) ->> 'orden_id')::uuid),
    'sesion-cccccccccccccccc', 'tarjeta_debito');
rollback;


-- ── BLOQUE 7 · El libro mayor es privado ────────────────────────────────────
-- Espera: cada cuenta ve solo sus filas. Con OTRO_ID el conteo de filas de CLIENTE_ID es 0.

begin;
  select set_config('request.jwt.claims', '{"sub":"OTRO_ID"}', true);
  set local role authenticated;
  select count(*) from public.puntos_movimientos where perfil_id = 'CLIENTE_ID';
  select count(*) from public.creditos_movimientos where perfil_id = 'CLIENTE_ID';
  select count(*) from public.canjes where perfil_id = 'CLIENTE_ID';
rollback;


-- ── BLOQUE 8 · Canje sin puntos ─────────────────────────────────────────────
-- Espera: ERROR 55000 "No te alcanzan los puntos para ese canje." (cuenta sin puntos)

begin;
  select set_config('request.jwt.claims', '{"sub":"OTRO_ID"}', true);
  set local role authenticated;
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-dddddddddddddddd');
  select public.configurar_orden(
    (select (public.crear_orden('FUNCION_ID', 'sesion-dddddddddddddddd', null, null) ->> 'orden_id')::uuid),
    'sesion-dddddddddddddddd', '[]'::jsonb, '[]'::jsonb, null, false,
    (select id from public.recompensas where nombre = 'Entrada gratis'));
rollback;


-- ── BLOQUE 9 · Cancelar: anónimo, ajeno, y el caso feliz ────────────────────
-- Espera, en orden: (a) ERROR 42501 (anon no puede ejecutar cancelar_orden);
-- (b) con OTRO_ID sobre la compra de CLIENTE_ID, ERROR P0002 "La orden no existe.";
-- (c) con CLIENTE_ID devuelve ok y el crédito = lo pagado; mis_saldos() lo muestra, las
-- butacas quedan libres (estado_butacas ya no las lista) y una segunda cancelación falla
-- con ERROR 55000 "La compra ya fue cancelada."
-- Se corre cada parte por separado: (b) y (c) necesitan una compra pagada de CLIENTE_ID,
-- que este bloque crea dentro de la misma transacción.

begin;
  set local role anon;
  select public.cancelar_orden(gen_random_uuid());
rollback;

begin;
  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  set local role authenticated;
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-cccccccccccccccc');
  select public.confirmar_pago(
    (select (public.crear_orden('FUNCION_ID', 'sesion-cccccccccccccccc', null, null) ->> 'orden_id')::uuid),
    'sesion-cccccccccccccccc', 'tarjeta_debito');
  select public.mis_ordenes();
  -- Con el id que devolvió mis_ordenes():
  -- select public.cancelar_orden('ORDEN_ID');
  -- select public.mis_saldos();
rollback;
