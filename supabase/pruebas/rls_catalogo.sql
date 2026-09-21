-- Pruebas del catálogo y las reseñas (RNF-09, RF-04, RF-09, RF-10, RF-11)
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
--    `postgres`.
--
-- Los bloques 6 a 9 necesitan DOS cuentas de cliente creadas desde la app.
-- Reemplazar los dos mails de abajo por los tuyos:
--
--     cliente@ejemplo.com   (la que reseña)
--     otro@ejemplo.com      (la ajena)
--
-- Y haber corrido antes 0017, 0018 y el seed 003.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · El visitante anónimo lee el catálogo ────────────────────────
-- Espera: peliculas >= 12, generos = 8, vinculos >= 12

begin;
  set local role anon;

  select
    (select count(*) from public.peliculas)         as peliculas,
    (select count(*) from public.generos)           as generos,
    (select count(*) from public.peliculas_generos) as vinculos;
rollback;


-- ── BLOQUE 2 · El anónimo NO puede escribir el catálogo ─────────────────────
-- Espera: ERROR 42501 permission denied for table peliculas
-- (No hay GRANT de INSERT: el motor lo corta antes de mirar ninguna política.)

begin;
  set local role anon;

  insert into public.peliculas (titulo, duracion_minutos) values ('Pelicula pirata', 90);
rollback;


-- ── BLOQUE 3 · Ni siquiera un cliente autenticado escribe el catálogo ───────
-- Espera: ERROR 42501 permission denied for table peliculas
-- La escritura del catálogo es del administrador y llega en la F9; hasta entonces
-- no la tiene nadie desde la API.

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

  update public.peliculas set destacada = true where titulo = 'Cielo de papel';
rollback;


-- ── BLOQUE 4 · El anónimo NO lee la tabla de reseñas directo ────────────────
-- Espera: ERROR 42501 permission denied for table resenas

begin;
  set local role anon;

  select count(*) from public.resenas;
rollback;


-- ── BLOQUE 5 · Pero sí llama a las funciones públicas ───────────────────────
-- Espera: top con 3 filas (mientras no haya ventas, todas con entradas = 0),
--         y ninguna con estreno futuro.
--         reseñas y puntajes ejecutan sin error (pueden devolver 0 filas).

begin;
  set local role anon;

  select p.titulo, p.fecha_estreno, m.entradas
  from public.peliculas_mas_vendidas(3) m
  join public.peliculas p on p.id = m.pelicula_id
  order by m.entradas desc, p.titulo;

  select * from public.puntajes_peliculas();

  select * from public.resenas_de_pelicula(
    (select id from public.peliculas order by titulo limit 1)
  );
rollback;


-- ── BLOQUE 6 · Un cliente reseña, y la función lo devuelve como propio ──────
-- Espera: una fila con autor "Nombre A." y es_propia = true.
--         Después, el mismo dato visto como anónimo: la misma reseña con
--         es_propia = false, y sin ninguna columna que identifique al perfil.

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

  insert into public.resenas (pelicula_id, perfil_id, estrellas, comentario)
  values (
    (select id from public.peliculas where titulo = 'Noche de marquesina'),
    (select auth.uid()),
    4,
    'Prueba de RLS'
  );

  select autor, estrellas, comentario, es_propia
  from public.resenas_de_pelicula(
    (select id from public.peliculas where titulo = 'Noche de marquesina')
  );

  -- Ahora como visitante sin cuenta, en la misma transacción
  set local role anon;

  select autor, estrellas, comentario, es_propia
  from public.resenas_de_pelicula(
    (select id from public.peliculas where titulo = 'Noche de marquesina')
  );

  select * from public.puntajes_peliculas();  -- promedio 4.0, cantidad 1
rollback;


-- ── BLOQUE 7 · Una segunda reseña de la misma persona a la misma película ───
-- Espera: ERROR 23505 duplicate key value violates unique constraint
-- (Una reseña por persona y por película: la regla la hace cumplir el motor.)

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

  insert into public.resenas (pelicula_id, perfil_id, estrellas)
  select id, (select auth.uid()), 5 from public.peliculas where titulo = 'Noche de marquesina';

  insert into public.resenas (pelicula_id, perfil_id, estrellas)
  select id, (select auth.uid()), 1 from public.peliculas where titulo = 'Noche de marquesina';
rollback;


-- ── BLOQUE 8 · Reseñar en nombre de otro ────────────────────────────────────
-- Espera: ERROR 42501 new row violates row-level security policy for table "resenas"
-- (El WITH CHECK compara el perfil_id que llega contra el del token.)

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

  insert into public.resenas (pelicula_id, perfil_id, estrellas)
  select
    (select id from public.peliculas where titulo = 'Noche de marquesina'),
    (select id from public.perfiles where email = 'otro@ejemplo.com'),
    1;
rollback;


-- ── BLOQUE 9 · Editar y borrar la reseña de otra persona ────────────────────
-- Espera: editadas = 0 y borradas = 0, SIN error.
-- Es distinto de los bloques anteriores: cuando USING no coincide, Postgres no
-- lanza una excepción, la fila simplemente no existe para esa consulta. Por eso la
-- prueba mide el conteo. La reseña ajena se crea como postgres, antes de cambiar
-- de rol, y el bloque cierra verificando que sigue intacta.

begin;
  insert into public.resenas (pelicula_id, perfil_id, estrellas, comentario)
  values (
    (select id from public.peliculas where titulo = 'Noche de marquesina'),
    (select id from public.perfiles where email = 'otro@ejemplo.com'),
    5,
    'Reseña ajena'
  );

  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id from public.perfiles where email = 'cliente@ejemplo.com'),
      'role', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;

  with u as (
    update public.resenas set estrellas = 1, comentario = 'Pisada'
    where comentario = 'Reseña ajena' returning 1
  ),
  d as (
    delete from public.resenas where comentario = 'Reseña ajena' returning 1
  )
  select (select count(*) from u) as editadas, (select count(*) from d) as borradas;

  -- Sigue ahí, con sus cinco estrellas: la ve cualquiera por la función pública
  select estrellas, comentario, es_propia
  from public.resenas_de_pelicula(
    (select id from public.peliculas where titulo = 'Noche de marquesina')
  );
rollback;


-- ── PENDIENTE PARA LA F6 ────────────────────────────────────────────────────
-- La prueba de peliculas_mas_vendidas con ventas reales necesita `ordenes`,
-- `funciones` y `butacas_ordenes` cargadas. Cuando exista la compra, agregar acá un
-- bloque que arme dos películas con entradas y verifique que: (a) ordena por
-- cantidad, (b) NO cuenta las órdenes 'pendiente', 'cancelada' ni 'expirada', y
-- (c) deja afuera las de estreno futuro aunque tengan preventa vendida.
