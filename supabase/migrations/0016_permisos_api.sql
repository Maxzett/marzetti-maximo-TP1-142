-- 0016 — Permisos de tabla para los roles de la API
--
-- Hay DOS capas independientes entre una petición y una fila, y las dos tienen que
-- dejar pasar:
--
--   1. El privilegio de tabla (GRANT). Es de Postgres de toda la vida.
--   2. La política RLS, que recién se evalúa si la primera pasó.
--
-- Los proyectos de Supabase creados con los ajustes actuales ya NO otorgan
-- privilegios sobre las tablas nuevas de `public` a `anon` ni a `authenticated`
-- —antes lo hacían con ALTER DEFAULT PRIVILEGES—, así que una tabla recién creada
-- responde 42501 permission denied a todo el mundo. Eso es una buena noticia para
-- el deny by default de D3-01, pero deja a las políticas de 0014 como letra muerta:
-- sin el GRANT, ni siquiera se llegan a evaluar.
--
-- Esta migración otorga el mínimo que la F3 necesita. Cada fase siguiente otorga lo
-- suyo junto con sus políticas, con el mismo criterio: primero el privilegio, después
-- la política que lo acota a las filas que corresponden.

-- El titular lee su perfil; la política perfiles_select_propio lo limita a su fila,
-- y perfiles_select_admin le suma al administrador las de los demás.
-- El UPDATE no se otorga acá: lo hace 0013, columna por columna, para que `rol`
-- quede afuera.
grant select on public.perfiles to authenticated;

-- Los tres campos que solo ve su titular. La política sensibles_solo_titular acota
-- las tres operaciones a la fila propia, en el USING y en el WITH CHECK.
grant select, insert, update on public.perfiles_sensibles to authenticated;

-- A `anon` no se le otorga nada: el visitante sin cuenta no tiene por qué leer un
-- perfil. La compra anónima (RF-26) no necesita perfiles, y las tablas del catálogo
-- las abre la F4 con sus propias políticas.

-- Comprobación: si alguna de las dos quedó sin privilegio, la migración falla acá
-- en vez de descubrirse como una pantalla de perfil vacía.
do $$
declare
  v_faltan text[];
begin
  select array_agg(t.tabla order by t.tabla) into v_faltan
  from (values ('perfiles'), ('perfiles_sensibles')) as t(tabla)
  where not has_table_privilege('authenticated', 'public.' || t.tabla, 'select');

  if v_faltan is not null then
    raise exception 'authenticated no puede leer: %', array_to_string(v_faltan, ', ');
  end if;

  raise notice 'Privilegios de la API otorgados.';
end;
$$;
