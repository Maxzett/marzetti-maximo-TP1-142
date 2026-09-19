-- 0011 — Log de actividad, de solo lectura (RN-12, RF-61)

create table public.log_actividad (
  id bigint generated always as identity primary key,

  -- El actor puede borrar su cuenta; el registro de lo que hizo no se va con él.
  -- Por eso además del id se guarda una copia del email y del rol del momento.
  actor_id uuid references public.perfiles (id) on delete set null,
  actor_email text,
  actor_rol public.rol_usuario,

  accion text not null,
  entidad text not null,
  entidad_id text,

  -- Detalle libre del cambio. NUNCA lleva datos de perfiles_sensibles: RNF-11 los
  -- excluye explícitamente de reportes, exportaciones y logs.
  detalle jsonb not null default '{}'::jsonb,

  creado_at timestamptz not null default now()
);

create index log_actividad_creado_at_idx on public.log_actividad (creado_at desc);
create index log_actividad_entidad_idx on public.log_actividad (entidad, entidad_id);

comment on table public.log_actividad is
  'Auditoria de RN-12. Se inserta y se lee; no se edita ni se borra. Sin datos sensibles (RNF-11).';

-- RN-12 dice que el log no se edita ni se borra. Quitar el permiso alcanza para la
-- API, pero no para una función SECURITY DEFINER de una fase futura, que correría
-- como dueña de la tabla. El trigger cierra también esa puerta.
create or replace function public.log_actividad_es_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El log de actividad es de solo lectura (RN-12)';
end;
$$;

create trigger log_actividad_sin_update
  before update on public.log_actividad
  for each row execute function public.log_actividad_es_inmutable();

create trigger log_actividad_sin_delete
  before delete on public.log_actividad
  for each row execute function public.log_actividad_es_inmutable();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Cada tabla se cierra en el mismo archivo que la crea. El editor SQL manda el
-- archivo entero como una transacción, así que la tabla y su RLS nacen juntas:
-- no hay un instante en que exista abierta a las claves anon o authenticated.
--
-- Se habilita sin escribir ninguna política: en Postgres eso no devuelve ni una
-- fila y no acepta ninguna escritura. Deny by default (D3-01). Las políticas las
-- abre cada fase cuando construye su pantalla; las de perfiles van en 0014.

alter table public.log_actividad enable row level security;
