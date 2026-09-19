-- 0013 — Rol: funciones auxiliares y protección contra el auto-ascenso (D3-03)
--
-- Problema 1: recursión. Una política sobre `perfiles` que pregunte "¿el que
-- consulta es admin?" tiene que leer `perfiles`, y esa lectura vuelve a evaluar la
-- política. Postgres corta con el error 42P17 (infinite recursion detected in
-- policy for relation "perfiles"), y en la app se ve como un 500 en TODA lectura
-- de perfil. La salida es encapsular la pregunta en una función SECURITY DEFINER:
-- corre con los permisos del dueño de la tabla, que no está sujeto a RLS, así que
-- la consulta interna no vuelve a pasar por la política.
--
-- `set search_path = ''` no es decorativo: sin él, alguien con permiso de crear un
-- esquema podría anteponer un `perfiles` falso y hacer que la función devuelva true.
-- Es además el aviso `function_search_path_mutable` del linter de Supabase.

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.rol = 'admin' from public.perfiles p where p.id = (select auth.uid())),
    false  -- auth.uid() es NULL para el anónimo y en el editor SQL: ahí no es admin
  );
$$;

create or replace function public.es_personal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.rol in ('empleado', 'admin') from public.perfiles p where p.id = (select auth.uid())),
    false
  );
$$;

comment on function public.es_admin() is
  'Responde si quien consulta es admin, sin recursar sobre las politicas de perfiles.';

-- Problema 2: el auto-ascenso. `perfiles` guarda el rol y su titular puede editar
-- su propia fila (0014). Sin protección, un PATCH con {"rol":"admin"} desde las
-- DevTools convierte a cualquiera en administrador. Dos cerrojos independientes:

-- Cerrojo 1, el permiso. No se puede revocar UPDATE de una sola columna sobre un
-- GRANT de tabla: hay que quitar el UPDATE entero y devolverlo columna por columna.
-- Así el motor rechaza el intento con 42501 antes de mirar RLS ni triggers.
-- `email` tampoco está en la lista: el mail lo cambia Supabase Auth, no esta tabla.
revoke update on public.perfiles from authenticated;
grant update (nombre, apellido, fecha_nacimiento) on public.perfiles to authenticated;

-- Cerrojo 2, el trigger. Cubre cualquier camino que no pase por el GRANT.
-- SECURITY INVOKER es deliberado, y es lo contrario de lo que necesitan es_admin()
-- y el alta de perfil: acá hace falta saber QUIÉN está ejecutando de verdad. Con
-- SECURITY DEFINER, current_user sería siempre `postgres` y el guard dejaría pasar
-- todo. Como INVOKER, vale `postgres` (editor SQL, acto administrativo) y no vale
-- `authenticated` (la aplicación).
create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'El rol no se modifica desde la aplicacion (D3-03)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger perfiles_proteger_rol
  before update on public.perfiles
  for each row execute function public.proteger_rol_perfil();
