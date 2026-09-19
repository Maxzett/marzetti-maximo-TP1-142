-- 0012 — Verificación del deny by default y permisos de tabla (D3-01)
--
-- Cada migración anterior ya cerró sus propias tablas con
-- `enable row level security`, en el mismo archivo —y por lo tanto en la misma
-- transacción— en que las creó. Este archivo no enciende nada: comprueba que no
-- quedó ninguna abierta, y ajusta los permisos de tabla que RLS no cubre.
--
-- Por qué RLS sin políticas alcanza: en Postgres, una tabla con RLS habilitada y
-- SIN políticas no devuelve ni una fila y no acepta ninguna escritura para los
-- roles de la API (anon, authenticated). La estructura completa existe desde hoy,
-- pero nada está expuesto hasta que su fase escriba su política.
--
-- El linter de Supabase va a listar las 22 tablas sin políticas con el aviso
-- informativo `rls_enabled_no_policy`. Es deliberado, no un descuido.
--
-- Se usa ENABLE y no FORCE a propósito. FORCE aplicaría RLS también al dueño de la
-- tabla, y entonces ni el trigger de alta de perfil (0015, SECURITY DEFINER) ni las
-- RPC transaccionales de las fases siguientes podrían escribir. Que una función
-- SECURITY DEFINER saltee RLS es justamente el motivo por el que la lógica crítica
-- vive ahí: valida sus propias reglas antes de tocar una fila.

do $$
declare
  v_abiertas text[];
begin
  select array_agg(c.relname order by c.relname) into v_abiertas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_abiertas is not null then
    raise exception 'Estas tablas quedaron sin RLS: %', array_to_string(v_abiertas, ', ');
  end if;

  raise notice 'Todas las tablas de public tienen RLS habilitada.';
end;
$$;

-- Defensa en profundidad sobre los perfiles: además de RLS, se quita el permiso
-- de tabla al visitante anónimo. Así un GET sin sesión recibe "permission denied"
-- y no una lista vacía, que es una señal mucho más clara de que no le corresponde.
revoke all on public.perfiles from anon;
revoke all on public.perfiles_sensibles from anon;

-- El log de actividad se inserta y se lee, nunca se modifica (RN-12).
revoke update, delete on public.log_actividad from anon, authenticated;
