-- Pruebas de la compra (RF-24 a RF-29, RN-03, RN-04, RN-10, RN-11, D-02, D-08)
--
-- ══ LEER ANTES DE CORRER ═══════════════════════════════════════════════════
--
-- 1. El editor SQL de Supabase corre como `postgres`, que NO está sujeto a RLS.
--    Cada bloque suplanta el rol con set local role.
-- 2. Correr DE A UN BLOQUE. Los marcados ERROR esperan una excepción.
-- 3. Todo termina en ROLLBACK: no deja rastro.
-- 4. Hace falta haber corrido 0020 y los seeds 001, 003 y 004.
--
-- Reemplazar en cada bloque los dos valores de abajo con los reales:
--   FUNCION_ID  una función futura de una película sin restricción de edad b485f7db-9d9b-4181-8512-aa30d1a27f47
--   FUNCION_18  una función futura de una película +18 4691506d-376b-4733-b902-2a4270baf98a
-- (select f.id, p.titulo, p.restriccion_edad from funciones f
--    join peliculas p on p.id = f.pelicula_id where f.inicio > now() limit 20;)
--
-- La misma batería se corrió, más completa (47 comprobaciones, incluida la edad en el
-- borde del cumpleaños y la reserva vencida), contra Postgres en WASM. No cubre
-- concurrencia real: la serialización se apoya en el FOR UPDATE de la función y en el
-- unique de butacas_ordenes, que se razonan, no se midieron.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · La API no lee las tablas de la compra ────────────────────────
-- Espera: ERROR 42501 permission denied for table holds_butacas

begin;
  set local role anon;
  select * from public.holds_butacas;
rollback;


-- ── BLOQUE 2 · Reservar, y que otra sesión no pueda la misma butaca ─────────
-- Espera: la primera devuelve ok; la segunda, ERROR 55000 "Otra persona está
-- eligiendo esa butaca en este momento."

begin;
  set local role anon;
  select public.retener_butaca(
    'FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.retener_butaca(
    'FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-bbbbbbbbbbbbbbbb');
rollback;


-- ── BLOQUE 3 · Precio: base + recargo VIP, congelado en la orden ────────────
-- Espera: subtotal = precio_base + (precio_base + 2000), tiene_vip = true

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'vip' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.crear_orden('FUNCION_ID', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com', null);
rollback;


-- ── BLOQUE 4 · Anónimo menor de 18 en una película +18 ──────────────────────
-- Espera: ERROR 22023 "No podés comprar entradas para esta película..."

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_18',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_18' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.crear_orden('FUNCION_18', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com',
    (current_date - interval '15 years')::date);
rollback;


-- ── BLOQUE 5 · Anónimo sin declarar fecha en una película +18 ───────────────
-- Espera: ERROR 22023 "Esta película tiene restricción de edad: declará tu fecha..."

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_18',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_18' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.crear_orden('FUNCION_18', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com', null);
rollback;


-- ── BLOQUE 6 · Pagar la orden de otra sesión ────────────────────────────────
-- Espera: ERROR P0002 "La orden no existe." (la sesión ajena no encuentra la fila)

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.confirmar_pago(
    (select (public.crear_orden('FUNCION_ID', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com', null)
             ->> 'orden_id')::uuid),
    'sesion-bbbbbbbbbbbbbbbb', 'tarjeta_debito');
rollback;


-- ── BLOQUE 7 · Pago, "Mi entrada" y la butaca ya vendida ────────────────────
-- Espera: el pago devuelve ok; obtener_orden devuelve 1 butaca y estado pagada;
-- el último intento de reservar la misma butaca falla con ERROR 55000 "Esa butaca
-- ya fue vendida."

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.confirmar_pago(
    (select (public.crear_orden('FUNCION_ID', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com', null)
             ->> 'orden_id')::uuid),
    'sesion-aaaaaaaaaaaaaaaa', 'tarjeta_debito');
  -- Como anon no puede leer `ordenes`, el código se lee un momento como postgres.
  reset role;
  create temp table codigo_de_prueba as
    select codigo from public.ordenes where sesion_id = 'sesion-aaaaaaaaaaaaaaaa';
  grant select on codigo_de_prueba to anon;
  set local role anon;
  select public.obtener_orden((select codigo from codigo_de_prueba));
  select public.retener_butaca('FUNCION_ID',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_ID' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-bbbbbbbbbbbbbbbb');
rollback;
