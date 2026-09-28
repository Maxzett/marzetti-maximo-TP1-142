-- Pruebas de la restricción de edad revisada y del aviso del cupón por edad
-- (RN-04 y D-02 revisadas el 28/09, RF-44, RN-09 · migración 0026)
--
-- ══ LEER ANTES DE CORRER ═══════════════════════════════════════════════════
--
-- 1. El editor SQL de Supabase corre como `postgres`, que NO está sujeto a RLS.
--    Cada bloque suplanta el rol con set local role (y la cuenta con request.jwt.claims).
-- 2. Correr DE A UN BLOQUE. Los marcados ERROR esperan una excepción.
-- 3. Todo termina en ROLLBACK: no deja rastro.
-- 4. Hace falta haber corrido 0026.
--
-- Reemplazar en cada bloque los valores de abajo con los reales:
--   FUNCION_13    una función futura de una película +13
--   CUENTA_MENOR  el id de una cuenta con menos de 13 años (se registra desde la app)
--   CUENTA_MAYOR  el id de una cuenta de 50 años o más
--   CUENTA_JOVEN  el id de una cuenta adulta de menos de 50
-- (select f.id, p.titulo, p.restriccion_edad from funciones f
--    join peliculas p on p.id = f.pelicula_id where f.inicio > now() limit 20;)
-- (select id, email, fecha_nacimiento from perfiles order by fecha_nacimiento;)
--
-- La misma batería se corrió, más completa (22 comprobaciones, con +18 y ATP), contra
-- Postgres en WASM.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · Anónimo sin firmar ninguna casilla ───────────────────────────
-- Espera: ERROR 22023 "Esta película es para mayores de 13 años: declará tu edad o
-- indicá que vas con un adulto."

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_13',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_13' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.crear_orden('FUNCION_13', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com',
    false, false);
rollback;


-- ── BLOQUE 2 · Anónimo que firma la edad, con una sola entrada ──────────────
-- Espera: la orden, con con_acompanante = false

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_13',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_13' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.crear_orden('FUNCION_13', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com',
    true, false);
rollback;


-- ── BLOQUE 3 · Anónimo acompañado con una sola entrada ──────────────────────
-- Espera: ERROR 22023 "Si vas con un adulto, elegí al menos 2 entradas..."

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_13',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_13' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.crear_orden('FUNCION_13', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com',
    false, true);
rollback;


-- ── BLOQUE 4 · Anónimo acompañado con dos entradas ──────────────────────────
-- Espera: la orden, con con_acompanante = true

begin;
  set local role anon;
  select public.retener_butaca('FUNCION_13', b.id, 'sesion-aaaaaaaaaaaaaaaa')
    from (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
           where f.id = 'FUNCION_13' and b.tipo = 'estandar' order by b.fila, b.numero limit 2) b;
  select public.crear_orden('FUNCION_13', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com',
    false, true);
rollback;


-- ── BLOQUE 5 · Cuenta menor con una sola entrada ────────────────────────────
-- Espera: ERROR 22023 "Como sos menor de 13 años, tenés que ir con un adulto: elegí al
-- menos 2 entradas." (con cuenta, la declaración se ignora: vale la fecha registrada)

begin;
  select set_config('request.jwt.claims', '{"sub":"CUENTA_MENOR"}', true);
  set local role authenticated;
  select public.retener_butaca('FUNCION_13',
    (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
      where f.id = 'FUNCION_13' and b.tipo = 'estandar' order by b.fila, b.numero limit 1),
    'sesion-aaaaaaaaaaaaaaaa');
  select public.crear_orden('FUNCION_13', 'sesion-aaaaaaaaaaaaaaaa', '', true, false);
rollback;


-- ── BLOQUE 6 · Cuenta menor con dos entradas ────────────────────────────────
-- Espera: la orden, con con_acompanante = true

begin;
  select set_config('request.jwt.claims', '{"sub":"CUENTA_MENOR"}', true);
  set local role authenticated;
  select public.retener_butaca('FUNCION_13', b.id, 'sesion-aaaaaaaaaaaaaaaa')
    from (select b.id from public.butacas b join public.funciones f on f.sala_id = b.sala_id
           where f.id = 'FUNCION_13' and b.tipo = 'estandar' order by b.fila, b.numero limit 2) b;
  select public.crear_orden('FUNCION_13', 'sesion-aaaaaaaaaaaaaaaa', '');
rollback;


-- ── BLOQUE 7 · La firma vieja, con fecha de nacimiento, ya no existe ─────────
-- Espera: ERROR 42883 function public.crear_orden(...) does not exist

begin;
  set local role anon;
  select public.crear_orden('FUNCION_13', 'sesion-aaaaaaaaaaaaaaaa', 'prueba@ejemplo.com',
    '1990-01-01'::date);
rollback;


-- ── BLOQUE 8 · El cupón por edad se ofrece solo a quien le corresponde ──────
-- Espera: la cuenta mayor ve cupon_edad = PLATINO50 (edad_minima 50); la joven, null

begin;
  select set_config('request.jwt.claims', '{"sub":"CUENTA_MAYOR"}', true);
  set local role authenticated;
  select public.mis_saldos() -> 'cupon_edad' as mayor;
rollback;

begin;
  select set_config('request.jwt.claims', '{"sub":"CUENTA_JOVEN"}', true);
  set local role authenticated;
  select public.mis_saldos() -> 'cupon_edad' as joven;
rollback;
