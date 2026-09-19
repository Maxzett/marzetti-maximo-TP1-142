-- Pruebas de las políticas de perfiles (RNF-09, RF-38.1, RNF-11)
--
-- ══ LEER ANTES DE CORRER ═══════════════════════════════════════════════════
--
-- 1. El editor SQL de Supabase corre como `postgres`, que es dueño de las tablas y
--    NO está sujeto a RLS. Ejecutar estas consultas tal cual desde ahí devuelve
--    todas las filas y da la falsa impresión de que no hay seguridad. Por eso cada
--    bloque suplanta el rol con set_config() + set local role.
--
-- 2. Correr DE A UN BLOQUE, no el archivo entero. Los bloques 3 y 4 esperan un
--    ERROR: si se corriera todo junto, el primero abortaría el resto.
--
-- 3. Todo termina en ROLLBACK: la prueba no deja rastro y devuelve la sesión a
--    `postgres`.
--
-- Hacen falta dos cuentas creadas desde la app, una de ellas promovida a admin:
--
--   update public.perfiles set rol = 'admin' where email = 'admin@ejemplo.com';
--
-- Reemplazar los dos mails de abajo por los tuyos.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── BLOQUE 1 · El cliente ve lo suyo y nada más ────────────────────────────
-- Espera: perfiles_visibles = 1, sensibles_visibles = 1

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

  select
    (select count(*) from public.perfiles)           as perfiles_visibles,
    (select count(*) from public.perfiles_sensibles) as sensibles_visibles;
rollback;


-- ── BLOQUE 2 · El administrador ────────────────────────────────────────────
-- Espera: es_admin           = true
--         perfiles_visibles  = todas las cuentas (las necesita para RF-61 y su panel)
--         sensibles_propios  = 1   ← su propia fila: el admin también es titular
--         sensibles_de_otros = 0   ← ESTA ES LA PRUEBA DE RF-38.1 Y RNF-11
--
-- El contraste es lo que importa, y hay que leer las dos últimas columnas juntas:
-- el administrador ve el perfil de TODAS las cuentas, y de los datos sensibles ve
-- únicamente los suyos. No porque la aplicación se los oculte, sino porque no
-- existe ninguna política que se los dé. La ausencia de política ES el requerimiento.
--
-- Ojo con el error de medición fácil: contar todas las filas de perfiles_sensibles
-- y esperar 0 es incorrecto, porque el propio admin tiene la suya. Lo que hay que
-- contar son las ajenas.

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

  select
    public.es_admin()                      as es_admin,
    (select count(*) from public.perfiles) as perfiles_visibles,
    (select count(*) from public.perfiles_sensibles
       where perfil_id = (select auth.uid()))  as sensibles_propios,
    (select count(*) from public.perfiles_sensibles
       where perfil_id <> (select auth.uid())) as sensibles_de_otros;
rollback;


-- ── BLOQUE 3 · Nadie se asciende solo ──────────────────────────────────────
-- Espera: ERROR 42501 permission denied for table perfiles
--
-- El UPDATE de la columna `rol` no está otorgado a `authenticated` (0013), así que
-- el motor lo rechaza antes de mirar RLS. Es el mismo camino que usaría cualquiera
-- con las DevTools abiertas.

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

  update public.perfiles set rol = 'admin' where id = (select auth.uid());
rollback;


-- ── BLOQUE 4 · Deny by default sobre el resto del esquema ──────────────────
-- Espera: ERROR 42501 permission denied for table ordenes
--
-- Las otras 22 tablas tienen RLS sin políticas y sin GRANT: no están expuestas
-- hasta que su fase las abra (D3-01).

begin;
  set local role authenticated;
  select count(*) from public.ordenes;
rollback;


-- ── BLOQUE 5 · Invariantes del esquema (como postgres, no dependen de RLS) ──
-- Espera: butacas_por_sala = 532 en las cuatro salas

select s.nombre, count(b.id) as butacas_por_sala
from public.salas s
join public.butacas b on b.sala_id = s.id
group by s.nombre
order by s.nombre;


-- ── BLOQUE 6 · El log de actividad es de solo lectura (RN-12) ──────────────
-- Espera: ERROR "El log de actividad es de solo lectura (RN-12)"
-- Correr solo si ya hay alguna fila en el log.

-- update public.log_actividad set accion = 'editado' where id = 1;


-- ── BLOQUE 7 · No hay dos funciones solapadas en la misma sala (RN-01, RN-02)
-- Espera: ERROR 23P01 conflicting key value violates exclusion constraint
-- Necesita una película cargada. Descomentar cuando exista el catálogo (F4).

-- begin;
--   insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
--   select p.id, s.id, '2026-10-01T20:00:00-03:00', '2D', 'castellano', 5000
--   from public.peliculas p, public.salas s limit 1;
--
--   insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
--   select p.id, s.id, '2026-10-01T21:00:00-03:00', '2D', 'castellano', 5000
--   from public.peliculas p, public.salas s limit 1;
-- rollback;
