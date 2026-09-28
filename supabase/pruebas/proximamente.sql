-- Pruebas de Próximamente: apertura de venta, alertas, Mis Películas y alta de películas
-- (RF-08, RF-41, RF-42, RF-49, RF-56, RN-10)
--
-- ══ LEER ANTES DE CORRER ═══════════════════════════════════════════════════
--
-- 1. El editor SQL de Supabase corre como `postgres`, que NO está sujeto a RLS.
--    Cada bloque prepara sus datos como postgres y después suplanta el rol con set local role
--    y el usuario con request.jwt.claims.
-- 2. Correr DE A UN BLOQUE. Los marcados ERROR esperan una excepción.
-- 3. Todo termina en ROLLBACK: no deja rastro, ni en las tablas ni en el log.
-- 4. Hace falta haber corrido 0025.
--
-- Reemplazar en cada bloque estos valores por los reales:
--   ADMIN_ID     el id de una cuenta admin
--   CLIENTE_ID   el id de una cuenta cliente
-- (select id, email, rol from perfiles;)
--
-- Los bloques 1 a 3 mueven el estreno de una película dentro de la transacción y le programan
-- una función a un mes o más, donde la grilla de demo no tiene nada: así no chocan con la
-- constraint de no solapamiento.
--
-- La misma batería se corrió, más completa, contra Postgres en WASM.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · No se reserva una butaca antes de que abra la venta ──────────
-- Estreno en 40 días, sin preventa: la venta abre el día del estreno.
-- Espera: ERROR 55000 "Las entradas de esta película salen a la venta el DD/MM/AAAA."

begin;
  update public.peliculas set fecha_estreno = current_date + 40, precio_preventa = null
   where id = (select id from public.peliculas order by titulo limit 1);

  insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
  select (select id from public.peliculas order by titulo limit 1),
         (select id from public.salas where activa order by nombre limit 1),
         ((current_date + 41)::timestamp + time '20:00') at time zone 'America/Argentina/Buenos_Aires',
         '2D', 'castellano', 5000;

  select set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select public.retener_butaca(
    (select f.id from public.funciones f
      where f.pelicula_id = (select id from public.peliculas order by titulo limit 1)
      order by f.inicio desc limit 1),
    (select b.id from public.butacas b
      join public.funciones f on f.sala_id = b.sala_id
      where f.pelicula_id = (select id from public.peliculas order by titulo limit 1)
      order by f.inicio desc, b.fila, b.numero limit 1),
    'prueba-proximamente-0001');
rollback;


-- ── BLOQUE 2 · Con preventa, la misma reserva se acepta siete días antes ────
-- Estreno en 3 días con precio de preventa: la venta ya abrió.
-- Espera: {"ok": true, ...}

begin;
  update public.peliculas set fecha_estreno = current_date + 3, precio_preventa = 3000
   where id = (select id from public.peliculas order by titulo limit 1);

  insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
  select (select id from public.peliculas order by titulo limit 1),
         (select id from public.salas where activa order by nombre limit 1),
         ((current_date + 45)::timestamp + time '20:00') at time zone 'America/Argentina/Buenos_Aires',
         '2D', 'castellano', 5000;

  select set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select public.retener_butaca(
    (select f.id from public.funciones f
      where f.pelicula_id = (select id from public.peliculas order by titulo limit 1)
      order by f.inicio desc limit 1),
    (select b.id from public.butacas b
      join public.funciones f on f.sala_id = b.sala_id
      where f.pelicula_id = (select id from public.peliculas order by titulo limit 1)
      order by f.inicio desc, b.fila, b.numero limit 1),
    'prueba-proximamente-0002');
rollback;


-- ── BLOQUE 3 · Ninguna función antes del estreno ────────────────────────────
-- Espera: ERROR 22023 "... se estrena el DD/MM/AAAA: no se pueden programar funciones antes."

begin;
  update public.peliculas set fecha_estreno = current_date + 50
   where id = (select id from public.peliculas order by titulo limit 1);

  insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
  select (select id from public.peliculas order by titulo limit 1),
         (select id from public.salas where activa order by nombre limit 1),
         ((current_date + 49)::timestamp + time '20:00') at time zone 'America/Argentina/Buenos_Aires',
         '2D', 'castellano', 5000;
rollback;


-- ── BLOQUE 4 · Nadie pide una alerta en nombre de otro ──────────────────────
-- Espera: ERROR 42501 "new row violates row-level security policy"

begin;
  update public.peliculas set fecha_estreno = current_date + 40, precio_preventa = null
   where id = (select id from public.peliculas order by titulo limit 1);

  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  set local role authenticated;
  insert into public.alertas_estreno (perfil_id, pelicula_id)
  values ('ADMIN_ID', (select id from public.peliculas order by titulo limit 1));
rollback;


-- ── BLOQUE 5 · No se pide aviso de una película que ya está a la venta ──────
-- Espera: ERROR 42501 (el WITH CHECK pide que la venta todavía no haya abierto)

begin;
  update public.peliculas set fecha_estreno = current_date - 1
   where id = (select id from public.peliculas order by titulo limit 1);

  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  set local role authenticated;
  insert into public.alertas_estreno (perfil_id, pelicula_id)
  values ('CLIENTE_ID', (select id from public.peliculas order by titulo limit 1));
rollback;


-- ── BLOQUE 6 · La alerta propia se crea y solo la ve su titular ─────────────
-- Espera: propia = 1, ajenas_vistas_por_admin = 0

begin;
  update public.peliculas set fecha_estreno = current_date + 40, precio_preventa = null
   where id = (select id from public.peliculas order by titulo limit 1);

  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  set local role authenticated;
  insert into public.alertas_estreno (perfil_id, pelicula_id)
  values ('CLIENTE_ID', (select id from public.peliculas order by titulo limit 1));

  -- El editor muestra solo el último resultado: lo que ve el cliente se guarda en una variable
  select set_config('prueba.propia', (select count(*)::text from public.alertas_estreno), true);

  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  select current_setting('prueba.propia')::int as propia,
         (select count(*)::int from public.alertas_estreno where perfil_id = 'CLIENTE_ID') as ajenas_vistas_por_admin;
rollback;


-- ── BLOQUE 7 · Un cliente no da de alta películas ───────────────────────────
-- Espera: ERROR 42501 "Solo la administración puede gestionar las películas"

begin;
  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  set local role authenticated;
  select public.guardar_pelicula(null, 'Pirata', '', null, 100::smallint, 0::smallint,
    null, false, null, array[(select id from public.generos limit 1)]);
rollback;


-- ── BLOQUE 8 · El admin da de alta una película y queda en el log ───────────
-- Espera: una fila con el título y 1 registro crear_pelicula

begin;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  set local role authenticated;
  select public.guardar_pelicula(null, 'Estreno de prueba', 'Sinopsis.', null, 110::smallint,
    13::smallint, current_date + 20, false, 3200,
    array(select id from public.generos order by nombre limit 2)) as id;

  select p.titulo, p.preventa_desde, count(pg.*) as generos,
         (select count(*) from public.log_actividad where accion = 'crear_pelicula'
            and detalle ->> 'nombre' = 'Estreno de prueba') as en_el_log
    from public.peliculas p
    join public.peliculas_generos pg on pg.pelicula_id = p.id
   where p.titulo = 'Estreno de prueba'
   group by p.titulo, p.preventa_desde;
rollback;


-- ── BLOQUE 9 · No se cambia la duración de una película con funciones ───────
-- Espera: ERROR 55000 "La película tiene funciones programadas: no se puede cambiar la duración"

begin;
  select set_config('request.jwt.claims', '{"sub":"ADMIN_ID"}', true);
  set local role authenticated;
  select public.guardar_pelicula(p.id, p.titulo, p.sinopsis, p.poster_url,
    (p.duracion_minutos + 10)::smallint, p.restriccion_edad, p.fecha_estreno, p.destacada,
    p.precio_preventa, array(select genero_id from public.peliculas_generos where pelicula_id = p.id))
    from public.peliculas p
   where exists (select 1 from public.funciones f where f.pelicula_id = p.id and f.activa and f.inicio > now())
     and exists (select 1 from public.peliculas_generos pg where pg.pelicula_id = p.id)
   limit 1;
rollback;


-- ── BLOQUE 10 · Mis Películas no es para anónimos ───────────────────────────
-- Espera: ERROR 42501 "permission denied for function mis_peliculas"

begin;
  select set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select * from public.mis_peliculas();
rollback;


-- ── BLOQUE 11 · Un cliente no sube pósters (solo en el proyecto real) ───────
-- Storage no existe fuera de Supabase: este bloque no se corrió en WASM.
-- Espera: ERROR 42501 "new row violates row-level security policy"

begin;
  select set_config('request.jwt.claims', '{"sub":"CLIENTE_ID"}', true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('posters', 'pirata.png');
rollback;
