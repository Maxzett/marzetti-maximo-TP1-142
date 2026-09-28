-- Pruebas del panel de empleado: validación del QR por tramos
-- (RF-51 a RF-55, RN-05, RN-12, RF-61, D-03)
--
-- ══ LEER ANTES DE CORRER ═══════════════════════════════════════════════════
--
-- 1. El editor SQL de Supabase corre como `postgres`, que NO está sujeto a RLS.
--    Cada bloque suplanta el rol con set local role y el usuario con request.jwt.claims.
-- 2. Correr DE A UN BLOQUE. Los marcados ERROR esperan una excepción.
-- 3. Todo termina en ROLLBACK: no deja rastro, ni en la orden ni en el log.
-- 4. Hace falta haber corrido 0023.
--
-- Reemplazar en cada bloque estos valores por los reales:
--   CODIGO       el código de una orden PAGADA que incluya candy
--   CODIGO_SIN   el código de una orden PAGADA sin candy
--   CLIENTE_ID   el id de una cuenta cliente
--   EMPLEADO_ID  el id de una cuenta empleado (o admin: es_personal() admite los dos)
--   OTRO_ID      el id de otra cuenta empleado o admin
-- (select codigo, estado, (select count(*) from orden_items i where i.orden_id = o.id
--    and i.tipo in ('producto','combo')) as candy from ordenes o where estado = 'pagada';)
-- (select id, email, rol from perfiles;)
--
-- La ventana de validación va de una hora antes del inicio al fin de la película. Para no
-- depender de la hora a la que se corre la prueba, los bloques que validan mueven la función
-- a "empezó hace 10 minutos" dentro de la misma transacción, como postgres y antes de cambiar
-- de rol. La marcan inactiva para que la constraint de no solapamiento no la mire; el ROLLBACK
-- final deshace todo.
--
-- La misma batería se corrió, más completa (36 comprobaciones: orden pendiente y cancelada,
-- función terminada, cancelar después de validar, contenido del log), contra Postgres en
-- WASM. No cubre concurrencia real: dos empleados sobre la misma orden se serializan por el
-- FOR UPDATE de la orden, que se razona, no se midió.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · Sin cuenta no se valida nada ─────────────────────────────────
-- Espera: ERROR 42501 permission denied for function validar_tramo

begin;
  set local role anon;
  select public.validar_tramo('CODIGO', 'entrada');
rollback;


-- ── BLOQUE 2 · Un cliente no se valida su propia entrada ────────────────────
-- Espera: ERROR 42501 "Solo el personal del cine puede validar entradas."

begin;
  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  set local role authenticated;
  select public.validar_tramo('CODIGO', 'entrada');
rollback;


-- ── BLOQUE 3 · El empleado consulta sin consumir ────────────────────────────
-- Espera: la orden sin la clave "email", con tramos.entrada y tramos.candy (usado_at null si
-- nadie los usó) y la ventana con desde, hasta y estado.

begin;
  select set_config('request.jwt.claims', '{"sub":"EMPLEADO_ID"}', true);
  set local role authenticated;
  select public.consultar_orden_personal('CODIGO');
  select public.consultar_orden_personal('CODIGO') ? 'email' as trae_email;  -- false
rollback;


-- ── BLOQUE 4 · Un tramo se usa una sola vez, y dice cuándo y por quién ──────
-- Espera, en orden:
--   1. {"ok": true, "tramo": "entrada", "usado_por": "<nombre del empleado>", ...}
--   2. {"ok": false, "motivo": "ya_usado", "usado_at": ..., "usado_por": "<el mismo nombre>"}
--      aunque lo intente OTRA cuenta del personal
--   3. {"ok": true, "tramo": "candy", ...}: consumir la entrada no toca el candy (D-03)

begin;
  update public.funciones set activa = false, inicio = now() - interval '10 minutes'
   where id = (select funcion_id from public.ordenes where codigo = 'CODIGO');
  select set_config('request.jwt.claims', '{"sub":"EMPLEADO_ID"}', true);
  set local role authenticated;
  select public.validar_tramo('CODIGO', 'entrada');
  select set_config('request.jwt.claims', '{"sub":"OTRO_ID"}', true);
  select public.validar_tramo('CODIGO', 'entrada');
  select public.validar_tramo('CODIGO', 'candy');
rollback;


-- ── BLOQUE 5 · Una orden sin candy no tiene tramo de candy ──────────────────
-- Espera: {"ok": false, "motivo": "sin_candy", ...}

begin;
  update public.funciones set activa = false, inicio = now() - interval '10 minutes'
   where id = (select funcion_id from public.ordenes where codigo = 'CODIGO_SIN');
  select set_config('request.jwt.claims', '{"sub":"EMPLEADO_ID"}', true);
  set local role authenticated;
  select public.validar_tramo('CODIGO_SIN', 'candy');
rollback;


-- ── BLOQUE 6 · Fuera de la ventana no se consume ────────────────────────────
-- Espera: {"ok": false, "motivo": "fuera_de_ventana", "desde": ..., "hasta": ...}
-- (la función se mueve a dentro de 3 días)

begin;
  update public.funciones set activa = false, inicio = now() + interval '3 days'
   where id = (select funcion_id from public.ordenes where codigo = 'CODIGO');
  select set_config('request.jwt.claims', '{"sub":"EMPLEADO_ID"}', true);
  set local role authenticated;
  select public.validar_tramo('CODIGO', 'entrada');
rollback;


-- ── BLOQUE 7 · Todo queda en el log, también los rechazos (RN-12, RF-61) ────
-- Espera: una fila validar_entrada y una validacion_rechazada con motivo ya_usado, las dos
-- con actor_email del empleado. Un código inexistente devuelve no_existe y no se registra.

begin;
  update public.funciones set activa = false, inicio = now() - interval '10 minutes'
   where id = (select funcion_id from public.ordenes where codigo = 'CODIGO');
  select set_config('request.jwt.claims', '{"sub":"EMPLEADO_ID"}', true);
  set local role authenticated;
  select public.validar_tramo('CODIGO', 'entrada');
  select public.validar_tramo('CODIGO', 'entrada');
  select public.validar_tramo('FFFFFFFFFFFFFFFFFFFF', 'entrada');
  reset role;
  select accion, actor_email, detalle ->> 'motivo' as motivo, creado_at
    from public.log_actividad
   where accion in ('validar_entrada', 'entregar_candy', 'validacion_rechazada')
   order by id desc limit 5;
rollback;


-- ── BLOQUE 8 · El personal no escribe la orden por fuera de la función ──────
-- Espera: ERROR 42501 permission denied for table ordenes

begin;
  select set_config('request.jwt.claims', '{"sub":"EMPLEADO_ID"}', true);
  set local role authenticated;
  update public.ordenes set entrada_validada_at = now() where codigo = 'CODIGO';
rollback;
