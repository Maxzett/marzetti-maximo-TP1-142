-- Pruebas de la compra de candy sin entrada (RF-34.1, RF-35 · migración 0027)
--
-- ══ LEER ANTES DE CORRER ═══════════════════════════════════════════════════
--
-- 1. El editor SQL de Supabase corre como `postgres`, que NO está sujeto a RLS.
--    Cada bloque suplanta el rol con set local role (y la cuenta con request.jwt.claims).
-- 2. Correr DE A UN BLOQUE. Los marcados ERROR esperan una excepción.
-- 3. Todo termina en ROLLBACK: no deja rastro.
-- 4. Hace falta haber corrido 0027 y el seed 005 (candy).
--
-- Reemplazar en cada bloque los valores de abajo con los reales:
--   CUENTA_CLIENTE   el id de una cuenta cliente
--   CUENTA_EMPLEADO  el id de una cuenta empleado
-- (select id, email, rol from perfiles;)
--
-- La misma batería se corrió, más completa (27 comprobaciones: vencimiento a los 7 días,
-- canje de entrada rechazado, facturación y candy más vendido), contra Postgres en WASM.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · Compra anónima de candy, de punta a punta ────────────────────
-- Espera: el último select devuelve tipo = candy, pelicula = null, butacas = [] y un
-- valido_hasta 7 días después de pagada_at
-- (la tabla temporal guarda el id de la orden: anon no puede leer ordenes, y está bien)

begin;
  create temp table prueba (orden jsonb) on commit drop;
  grant all on prueba to anon;
  set local role anon;
  insert into prueba select public.crear_orden_candy('sesion-candy-aaaaaaaaaa', 'prueba@ejemplo.com');
  select public.configurar_orden((select (orden ->> 'orden_id')::uuid from prueba),
    'sesion-candy-aaaaaaaaaa',
    jsonb_build_array(jsonb_build_object(
      'id', (select id from public.productos where activo order by nombre limit 1), 'cantidad', 2)),
    '[]'::jsonb, null, false, null);
  select public.confirmar_pago((select (orden ->> 'orden_id')::uuid from prueba),
    'sesion-candy-aaaaaaaaaa', 'tarjeta_debito');
  select o ->> 'tipo' as tipo, o ->> 'pelicula' as pelicula, o -> 'butacas' as butacas,
         o ->> 'pagada_at' as pagada_at, o ->> 'valido_hasta' as valido_hasta
    from (select public.obtener_orden((select orden ->> 'codigo' from prueba)) as o) t;
rollback;

-- ── BLOQUE 2 · Una orden de candy vacía no se paga ──────────────────────────
-- Espera: ERROR 55000 "Elegí al menos un producto."

begin;
  set local role anon;
  select public.confirmar_pago(
    (select (public.crear_orden_candy('sesion-candy-aaaaaaaaaa', 'prueba@ejemplo.com') ->> 'orden_id')::uuid),
    'sesion-candy-aaaaaaaaaa', 'tarjeta_debito');
rollback;


-- ── BLOQUE 3 · Un combo con entrada no entra en una compra de candy ─────────
-- Espera: ERROR 22023 "Tenés más combos con entrada o canjes de entrada que butacas..."

begin;
  set local role anon;
  select public.configurar_orden(
    (select (public.crear_orden_candy('sesion-candy-aaaaaaaaaa', 'prueba@ejemplo.com') ->> 'orden_id')::uuid),
    'sesion-candy-aaaaaaaaaa', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'id', (select c.id from public.combos c join public.combo_items ci on ci.combo_id = c.id
              where ci.incluye_entrada and c.activo limit 1), 'cantidad', 1)),
    null, false, null);
rollback;


-- ── BLOQUE 4 · Ni desde SQL entra una butaca en una orden de candy ──────────
-- Espera: ERROR 22023 "Una compra del candy bar no lleva entradas."
-- (corre como postgres a propósito: el trigger vale aunque se saltee la API)

begin;
  insert into public.ordenes (email_contacto, estado, codigo, sesion_id)
  values ('prueba@ejemplo.com', 'pendiente', 'PRUEBACANDY000000000', 'sesion-candy-aaaaaaaaaa');
  insert into public.orden_items (orden_id, tipo, butaca_id, cantidad, precio_unitario)
  values ((select id from public.ordenes where codigo = 'PRUEBACANDY000000000'), 'entrada',
          (select id from public.butacas limit 1), 1, 0);
rollback;


-- ── BLOQUE 5 · La compra de candy no se cancela ─────────────────────────────
-- Espera: ERROR 55000 "Las compras del candy bar no se cancelan."

begin;
  create temp table prueba (orden jsonb) on commit drop;
  grant all on prueba to authenticated;
  select set_config('request.jwt.claims', '{"sub":"CUENTA_CLIENTE"}', true);
  set local role authenticated;
  insert into prueba select public.crear_orden_candy('sesion-candy-bbbbbbbbbb', '');
  select public.configurar_orden((select (orden ->> 'orden_id')::uuid from prueba),
    'sesion-candy-bbbbbbbbbb',
    jsonb_build_array(jsonb_build_object(
      'id', (select id from public.productos where activo order by nombre limit 1), 'cantidad', 1)),
    '[]'::jsonb, null, false, null);
  select public.confirmar_pago((select (orden ->> 'orden_id')::uuid from prueba),
    'sesion-candy-bbbbbbbbbb', 'transferencia');
  select public.cancelar_orden((select (orden ->> 'orden_id')::uuid from prueba));
rollback;

-- ── BLOQUE 6 · El empleado entrega el candy una vez y no valida un ingreso ───
-- Espera, en orden: sin_entrada · ok = true · ya_usado

begin;
  insert into public.ordenes (email_contacto, estado, codigo, sesion_id, pagada_at)
  values ('prueba@ejemplo.com', 'pendiente', 'PRUEBACANDY000000001', 'sesion-candy-cccccccccc', now());
  insert into public.orden_items (orden_id, tipo, producto_id, cantidad, precio_unitario)
  values ((select id from public.ordenes where codigo = 'PRUEBACANDY000000001'), 'producto',
          (select id from public.productos where activo limit 1), 1, 1000);
  update public.ordenes set estado = 'pagada' where codigo = 'PRUEBACANDY000000001';

  select set_config('request.jwt.claims', '{"sub":"CUENTA_EMPLEADO"}', true);
  set local role authenticated;
  select public.validar_tramo('PRUEBACANDY000000001', 'entrada') ->> 'motivo' as ingreso;
  select public.validar_tramo('PRUEBACANDY000000001', 'candy') ->> 'ok' as primer_retiro;
  select public.validar_tramo('PRUEBACANDY000000001', 'candy') ->> 'motivo' as segundo_retiro;
rollback;


-- ── BLOQUE 7 · A los 8 días el ticket venció ────────────────────────────────
-- Espera: fuera_de_ventana, con el mensaje "El ticket del candy venció..."

begin;
  insert into public.ordenes (email_contacto, estado, codigo, sesion_id, pagada_at)
  values ('prueba@ejemplo.com', 'pendiente', 'PRUEBACANDY000000002', 'sesion-candy-dddddddddd',
          now() - interval '8 days');
  insert into public.orden_items (orden_id, tipo, producto_id, cantidad, precio_unitario)
  values ((select id from public.ordenes where codigo = 'PRUEBACANDY000000002'), 'producto',
          (select id from public.productos where activo limit 1), 1, 1000);
  update public.ordenes set estado = 'pagada' where codigo = 'PRUEBACANDY000000002';

  select set_config('request.jwt.claims', '{"sub":"CUENTA_EMPLEADO"}', true);
  set local role authenticated;
  select public.validar_tramo('PRUEBACANDY000000002', 'candy');
rollback;
