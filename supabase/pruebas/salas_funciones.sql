-- Pruebas de salas, butacas y funciones (RNF-09, RF-18, RF-21, RF-22, RF-23, RN-01, RN-02, RN-12, D-05)
--
-- ══ LEER ANTES DE CORRER ═══════════════════════════════════════════════════
--
-- 1. El editor SQL de Supabase corre como `postgres`, que NO está sujeto a RLS.
--    Ejecutar estas consultas sin suplantar el rol devuelve todo y da la falsa
--    impresión de que no hay seguridad. Cada bloque suplanta el rol con
--    set local role (y, para `authenticated`, con set_config del JWT).
--
-- 2. Correr DE A UN BLOQUE, no el archivo entero. Los bloques marcados ERROR
--    esperan una excepción: si se corriera todo junto, la primera abortaría el resto.
--
-- 3. Todo termina en ROLLBACK: la prueba no deja rastro y devuelve la sesión a
--    `postgres`. Las funciones de prueba viven a más de un año de distancia
--    (current_date + 400) para no chocar con las del seed 004.
--
-- Necesita dos cuentas creadas desde la app, una promovida a admin (ver
-- supabase/README.md). Reemplazar los mails de abajo por los tuyos:
--
--     admin@ejemplo.com     (rol admin)
--     cliente@ejemplo.com   (rol cliente)
--
-- Y haber corrido antes 0019 y los seeds 001 y 003.
--
-- Cada regla se prueba con el caso ajeno o con el borde, no con el caso feliz: que el
-- administrador SÍ pueda programar no demuestra nada; que un cliente no pueda, que el
-- admin no pueda elegir la sala a mano y que la quinta función simultánea sea rechazada,
-- sí.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · El visitante anónimo lee salas, butacas y funciones ──────────
-- Espera: salas >= 4, butacas >= 2128, y solo funciones vigentes.

begin;
  set local role anon;

  select
    (select count(*) from public.salas)                             as salas,
    (select count(*) from public.butacas)                           as butacas,
    (select count(*) from public.funciones where not activa)        as funciones_de_baja_visibles;
rollback;


-- ── BLOQUE 2 · El anónimo NO inserta una función ────────────────────────────
-- Espera: ERROR 42501 permission denied for table funciones

begin;
  set local role anon;

  insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
  select p.id, s.id, now() + interval '400 days', '2D', 'castellano', 100
  from public.peliculas p, public.salas s
  limit 1;
rollback;


-- ── BLOQUE 3 · NI SIQUIERA EL ADMIN inserta una función a mano ──────────────
-- Espera: ERROR 42501 permission denied for table funciones
-- Es la prueba de RF-21: el administrador no elige la sala. No hay GRANT de INSERT
-- sobre `funciones` para ningún rol de la API, así que el único camino es
-- crear_funciones(), que asigna la sala. Con una política de INSERT, el admin podría
-- mandar sala_id desde las DevTools.

begin;
  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
  select p.id, s.id, now() + interval '400 days', '2D', 'castellano', 100
  from public.peliculas p, public.salas s
  limit 1;
rollback;


-- ── BLOQUE 4 · Un cliente NO programa funciones ─────────────────────────────
-- Espera: ERROR 42501 Solo la administración puede programar funciones
-- Entra a la función (tiene EXECUTE: es authenticated) y choca con la verificación
-- de rol de adentro.

begin;
  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'cliente@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  select public.crear_funciones(
    (select id from public.peliculas order by titulo limit 1),
    current_date + 400, current_date + 400,
    array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
  );
rollback;


-- ── BLOQUE 5 · El anónimo NO llega ni a llamar a la función ─────────────────
-- Espera: ERROR 42501 permission denied for function crear_funciones
-- Distinto del bloque 4: acá lo frena el EXECUTE, antes de que corra una línea.

begin;
  set local role anon;

  select public.crear_funciones(
    (select id from public.peliculas order by titulo limit 1),
    current_date + 400, current_date + 400,
    array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
  );
rollback;


-- ── BLOQUE 6 · La QUINTA función simultánea es rechazada ────────────────────
-- Espera: n = 1..4 con ok = true y sala = Sala 1, Sala 2, Sala 3, Sala 4 (en ese
-- orden: la asignación es determinística); n = 5 con ok = false, sala vacía y
-- sugerencias con horarios cercanos.
-- Cinco películas distintas a la misma hora, cuatro salas: RN-02 y D-05.

begin;
  create temp table res (n int, r jsonb);
  grant all on res to authenticated;

  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  do $$
  declare
    v record;
  begin
    for v in
      select id, row_number() over (order by titulo) as n
      from public.peliculas
      order by titulo
      limit 5
    loop
      insert into res
      values (v.n, public.crear_funciones(
        v.id, current_date + 400, current_date + 400,
        array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
      ));
    end loop;
  end;
  $$;

  select
    n,
    r ->> 'ok'                              as ok,
    r -> 'creadas' -> 0 ->> 'sala'          as sala,
    r -> 'sin_sala' -> 0 -> 'sugerencias'   as sugerencias
  from res
  order by n;
rollback;


-- ── BLOQUE 7 · Todo o nada: un día sin sala frena TODO el lote ──────────────
-- Espera: ok = false, fecha_sin_sala = el día del medio, y funciones_creadas = 0
-- (ni siquiera los dos días que sí tenían sala).
-- Se llenan las 4 salas el día D+1 a las 18:00 y después se pide una quinta película
-- para D, D+1 y D+2. Los días D y D+2 tienen sala; D+1 no.

begin;
  create temp table res (n int, r jsonb);
  grant all on res to authenticated;

  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  do $$
  declare
    v record;
  begin
    for v in
      select id, row_number() over (order by titulo) as n
      from public.peliculas
      order by titulo
      limit 4
    loop
      perform public.crear_funciones(
        v.id, current_date + 401, current_date + 401,
        array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
      );
    end loop;
  end;
  $$;

  insert into res
  values (99, public.crear_funciones(
    (select id from public.peliculas order by titulo offset 4 limit 1),
    current_date + 400, current_date + 402,
    array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
  ));

  select
    r ->> 'ok'                              as ok,
    r -> 'sin_sala' -> 0 ->> 'fecha'        as fecha_sin_sala,
    (current_date + 401)::text              as esperada,
    (
      select count(*)
      from public.funciones
      where pelicula_id = (select id from public.peliculas order by titulo offset 4 limit 1)
        and inicio > now() + interval '399 days'
    )                                       as funciones_creadas
  from res
  where n = 99;
rollback;


-- ── BLOQUE 8A · Borde de RN-01: a fin + 30 min exactos, ENTRA ───────────────
-- Espera: dos filas, las dos en Sala 1; la segunda arranca exactamente cuando la
-- anterior termina de ocupar la sala (duración + 30 min).
-- Inserción directa como postgres: prueba la constraint, no el algoritmo.

begin;
  insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
  select p.id, s.id, timestamptz '2030-06-07 18:00:00-03', '2D', 'castellano', 1000
  from public.peliculas p, public.salas s
  where p.titulo = 'Noche de marquesina' and s.nombre = 'Sala 1';

  insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
  select p.id, s.id,
         timestamptz '2030-06-07 18:00:00-03' + make_interval(mins => p.duracion_minutos + 30),
         '2D', 'castellano', 1000
  from public.peliculas p, public.salas s
  where p.titulo = 'Noche de marquesina' and s.nombre = 'Sala 1';

  select s.nombre as sala, f.inicio, upper(f.rango) as libera_la_sala_a
  from public.funciones f
  join public.salas s on s.id = f.sala_id
  where f.inicio between timestamptz '2030-06-07 00:00-03' and timestamptz '2030-06-08 00:00-03'
  order by f.inicio;
rollback;


-- ── BLOQUE 8B · Borde de RN-01: a fin + 29 min, se RECHAZA ──────────────────
-- Espera: ERROR 23P01 conflicting key value violates exclusion constraint
--         "funciones_sin_solapamiento"
-- Un minuto menos que el bloque 8A. La invariante es del motor: aunque alguien
-- escriba por otro camino que no sea el algoritmo, la base no lo deja.

begin;
  insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
  select p.id, s.id, timestamptz '2030-06-07 18:00:00-03', '2D', 'castellano', 1000
  from public.peliculas p, public.salas s
  where p.titulo = 'Noche de marquesina' and s.nombre = 'Sala 1';

  insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
  select p.id, s.id,
         timestamptz '2030-06-07 18:00:00-03' + make_interval(mins => p.duracion_minutos + 29),
         '2D', 'castellano', 1000
  from public.peliculas p, public.salas s
  where p.titulo = 'Noche de marquesina' and s.nombre = 'Sala 1';
rollback;


-- ── BLOQUE 9 · Dar de baja una función LIBERA la sala ───────────────────────
-- Espera: n = 5 pasa de ok = false a ok = true, y la sala asignada es Sala 2 (la que
-- quedó libre al dar de baja la función que la ocupaba).

begin;
  create temp table res (n int, r jsonb);
  grant all on res to authenticated;

  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  do $$
  declare
    v record;
  begin
    for v in
      select id, row_number() over (order by titulo) as n
      from public.peliculas
      order by titulo
      limit 5
    loop
      insert into res
      values (v.n, public.crear_funciones(
        v.id, current_date + 400, current_date + 400,
        array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
      ));
    end loop;

    -- La quinta falló. Se da de baja la que quedó en Sala 2 y se reintenta.
    perform public.dar_de_baja_funcion(
      (select f.id from public.funciones f
       join public.salas s on s.id = f.sala_id
       where s.nombre = 'Sala 2' and f.activa and f.inicio > now() + interval '399 days'
       limit 1)
    );

    insert into res
    values (55, public.crear_funciones(
      (select id from public.peliculas order by titulo offset 4 limit 1),
      current_date + 400, current_date + 400,
      array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
    ));
  end;
  $$;

  select n, r ->> 'ok' as ok, r -> 'creadas' -> 0 ->> 'sala' as sala
  from res
  where n in (5, 55)
  order by n;
rollback;


-- ── BLOQUE 10 · Una función con entradas vendidas NO se da de baja ──────────
-- Espera: ERROR 55000 La función tiene entradas vendidas y no se puede dar de baja
-- La orden pagada se inserta como postgres, sin pasar por la app.

begin;
  select public.programar_funciones(
    (select id from public.peliculas order by titulo limit 1),
    current_date + 400, current_date + 400,
    array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
  );

  insert into public.ordenes (email_contacto, funcion_id, estado, pagada_at, codigo)
  select 'prueba@ejemplo.com', f.id, 'pagada', now(), 'PRUEBA-F5'
  from public.funciones f
  where f.inicio > now() + interval '399 days' and f.activa
  limit 1;

  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  select public.dar_de_baja_funcion(
    (select id from public.funciones where inicio > now() + interval '399 days' and activa limit 1)
  );
rollback;


-- ── BLOQUE 11A · Con entradas vendidas, el PRECIO sí se puede cambiar ───────
-- Espera: ok = true, precio_base = 9999, y en el log una fila 'modificar_precio_funcion'
-- hecha por el admin. Cada orden congela su precio (RN-10), así que cambiar el de la
-- función no toca lo que ya se vendió.

begin;
  select public.programar_funciones(
    (select id from public.peliculas order by titulo limit 1),
    current_date + 400, current_date + 400,
    array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
  );

  insert into public.ordenes (email_contacto, funcion_id, estado, pagada_at, codigo)
  select 'prueba@ejemplo.com', f.id, 'pagada', now(), 'PRUEBA-F5'
  from public.funciones f
  where f.inicio > now() + interval '399 days' and f.activa
  limit 1;

  create temp table res (r jsonb);
  grant all on res to authenticated;

  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  insert into res
  select public.modificar_funcion(f.id, f.inicio, f.formato, f.idioma, 9999)
  from public.funciones f
  where f.inicio > now() + interval '399 days' and f.activa
  limit 1;

  reset role;

  select
    (select r ->> 'ok' from res)                                             as ok,
    (select precio_base from public.funciones
       where inicio > now() + interval '399 days' and activa limit 1)        as precio_base,
    (select accion || ' por ' || actor_email from public.log_actividad
       order by id desc limit 1)                                             as ultimo_log;
rollback;


-- ── BLOQUE 11B · Con entradas vendidas, el HORARIO no se puede mover ────────
-- Espera: ERROR 55000 La función tiene entradas vendidas: solo se puede cambiar el precio

begin;
  select public.programar_funciones(
    (select id from public.peliculas order by titulo limit 1),
    current_date + 400, current_date + 400,
    array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
  );

  insert into public.ordenes (email_contacto, funcion_id, estado, pagada_at, codigo)
  select 'prueba@ejemplo.com', f.id, 'pagada', now(), 'PRUEBA-F5'
  from public.funciones f
  where f.inicio > now() + interval '399 days' and f.activa
  limit 1;

  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  select public.modificar_funcion(f.id, f.inicio + interval '1 hour', f.formato, f.idioma, f.precio_base)
  from public.funciones f
  where f.inicio > now() + interval '399 days' and f.activa
  limit 1;
rollback;


-- ── BLOQUE 12 · Una sala con funciones por delante NO se desactiva ──────────
-- Espera: ERROR 55000 La sala tiene funciones programadas: dalas de baja o esperá a que terminen

begin;
  select public.programar_funciones(
    (select id from public.peliculas order by titulo limit 1),
    current_date + 400, current_date + 400,
    array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
  );

  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  -- La función de arriba quedó en Sala 1 (la primera libre).
  select public.actualizar_sala((select id from public.salas where nombre = 'Sala 1'), 'Sala 1', false);
rollback;


-- ── BLOQUE 13 · Crear una sala genera exactamente 532 butacas ───────────────
-- Espera: total = 532, estandar = 420, silla_ruedas = 28, vip = 84.

begin;
  create temp table res (sala_id uuid);
  grant all on res to authenticated;

  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  insert into res select public.crear_sala('Sala de prueba');

  select
    count(*)                                        as total,
    count(*) filter (where b.tipo = 'estandar')     as estandar,
    count(*) filter (where b.tipo = 'silla_ruedas') as silla_ruedas,
    count(*) filter (where b.tipo = 'vip')          as vip
  from public.butacas b
  where b.sala_id = (select sala_id from res);
rollback;


-- ── BLOQUE 14 · Un nombre de sala repetido se rechaza ───────────────────────
-- Espera: ERROR 23505 duplicate key value violates unique constraint "salas_nombre_key"

begin;
  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  select public.crear_sala('Sala 1');
rollback;


-- ── BLOQUE 15 · El log lo escribe la función y nadie más lo lee ni lo toca ──
-- Parte A. Espera: accion = crear_funcion, actor_email = el del admin.

begin;
  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  select public.crear_funciones(
    (select id from public.peliculas order by titulo limit 1),
    current_date + 400, current_date + 400,
    array[1, 2, 3, 4, 5, 6, 7]::smallint[], '18:00', '2D', 'castellano', 5000
  );

  reset role;

  select accion, entidad, actor_email, actor_rol, detalle
  from public.log_actividad
  order by id desc
  limit 1;
rollback;


-- Parte B. Espera: ERROR 42501 permission denied for table log_actividad
-- Ni el admin lee el log desde la API todavía: su lectura llega con el panel de la F9.

begin;
  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'admin@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  select count(*) from public.log_actividad;
rollback;


-- Parte C. Espera: ERROR El log de actividad es de solo lectura (RN-12)
-- Ni siquiera postgres, que es dueño de la tabla, puede editar una entrada.

begin;
  select public.registrar_actividad(null, 'prueba', 'prueba', 'x');
  update public.log_actividad set accion = 'otra' where accion = 'prueba';
rollback;
