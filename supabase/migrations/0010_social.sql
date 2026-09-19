-- 0010 — Reseñas y alertas de estreno (RF-09 a RF-11, RF-42)

create table public.resenas (
  id uuid primary key default gen_random_uuid(),
  pelicula_id uuid not null references public.peliculas (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,

  estrellas smallint not null check (estrellas between 1 and 5),
  comentario text not null default '' check (length(comentario) <= 500),

  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  -- Una reseña por persona y por película: si vuelve a opinar, edita la suya.
  unique (pelicula_id, perfil_id)
);

create index resenas_pelicula_idx on public.resenas (pelicula_id);

-- RF-42: aviso cuando salgan a la venta las entradas de una película de Próximamente.
create table public.alertas_estreno (
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  pelicula_id uuid not null references public.peliculas (id) on delete cascade,
  notificada_at timestamptz,
  creado_at timestamptz not null default now(),
  primary key (perfil_id, pelicula_id)
);

create trigger resenas_actualizado_at
  before update on public.resenas
  for each row execute function public.tocar_actualizado_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Cada tabla se cierra en el mismo archivo que la crea. El editor SQL manda el
-- archivo entero como una transacción, así que la tabla y su RLS nacen juntas:
-- no hay un instante en que exista abierta a las claves anon o authenticated.
--
-- Se habilita sin escribir ninguna política: en Postgres eso no devuelve ni una
-- fila y no acepta ninguna escritura. Deny by default (D3-01). Las políticas las
-- abre cada fase cuando construye su pantalla; las de perfiles van en 0014.

alter table public.resenas enable row level security;
alter table public.alertas_estreno enable row level security;
