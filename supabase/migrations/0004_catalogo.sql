-- 0004 — Catálogo de películas y géneros (RF-01 a RF-08, RF-49, RF-50)

create table public.generos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  -- El slug es lo que viaja en la URL del filtro por género (RF-06).
  slug text not null unique
);

create table public.peliculas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  sinopsis text not null default '',
  poster_url text,
  duracion_minutos smallint not null check (duracion_minutos between 1 and 600),

  -- RF-03: smallint y no enum porque RN-04 compara la edad del comprador contra
  -- este número. Con un enum habría que traducirlo a entero en cada comparación.
  restriccion_edad smallint not null default 0 check (restriccion_edad in (0, 13, 18)),

  fecha_estreno date,

  -- RF-07: el administrador decide qué aparece en la portada.
  destacada boolean not null default false,

  -- RF-49/RN-10: precio especial de preventa. Nulo significa que no hay preventa.
  precio_preventa numeric(10, 2) check (precio_preventa is null or precio_preventa >= 0),

  -- La preventa arranca 7 días antes del estreno (RF-49). Es columna generada
  -- porque `date - integer` sí es IMMUTABLE — a diferencia de timestamptz + interval,
  -- que es lo que obliga al trigger de 0006.
  preventa_desde date generated always as (fecha_estreno - 7) stored,

  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

-- RF-05: buscador por texto sobre el nombre. Índice simple sobre minúsculas:
-- con el volumen de un TP alcanza y evita depender de la extensión pg_trgm.
create index peliculas_titulo_idx on public.peliculas (lower(titulo));
create index peliculas_destacada_idx on public.peliculas (destacada) where destacada;

-- RF-02: una película puede tener varios géneros. Tabla puente con PK compuesta,
-- que es la que impide cargar dos veces el mismo par.
create table public.peliculas_generos (
  pelicula_id uuid not null references public.peliculas (id) on delete cascade,
  genero_id uuid not null references public.generos (id) on delete cascade,
  primary key (pelicula_id, genero_id)
);

create index peliculas_generos_genero_idx on public.peliculas_generos (genero_id);

create trigger peliculas_actualizado_at
  before update on public.peliculas
  for each row execute function public.tocar_actualizado_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Cada tabla se cierra en el mismo archivo que la crea. El editor SQL manda el
-- archivo entero como una transacción, así que la tabla y su RLS nacen juntas:
-- no hay un instante en que exista abierta a las claves anon o authenticated.
--
-- Se habilita sin escribir ninguna política: en Postgres eso no devuelve ni una
-- fila y no acepta ninguna escritura. Deny by default (D3-01). Las políticas las
-- abre cada fase cuando construye su pantalla; las de perfiles van en 0014.

alter table public.generos enable row level security;
alter table public.peliculas enable row level security;
alter table public.peliculas_generos enable row level security;
