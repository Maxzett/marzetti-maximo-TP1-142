-- 0006 — Funciones y no solapamiento de sala (RF-19 a RF-23, RN-01, RN-02, D-05)
--
-- `extensions` tiene que estar en el search_path al crear la constraint, porque
-- ahí vive btree_gist (0001) y de ahí sale la clase de operadores para el uuid.
set search_path = public, extensions;

create table public.funciones (
  id uuid primary key default gen_random_uuid(),
  pelicula_id uuid not null references public.peliculas (id) on delete restrict,

  -- El administrador NO elige la sala: la asigna el sistema (RF-21). La columna
  -- existe igual, porque el resultado de esa asignación hay que guardarlo.
  sala_id uuid not null references public.salas (id) on delete restrict,

  -- timestamptz y nunca timestamp: Vercel corre en UTC y el cine está en Buenos
  -- Aires. Un timestamp sin zona se corre tres horas según dónde se lo lea.
  inicio timestamptz not null,

  formato public.formato_funcion not null,
  idioma public.idioma_funcion not null,

  -- D-06: precio base de la función, configurable por el administrador.
  precio_base numeric(10, 2) not null check (precio_base >= 0),

  -- RF-23: la baja de una función es lógica, para no perder las órdenes que la
  -- referencian. Una función dada de baja libera la sala, y por eso la constraint
  -- de exclusión de abajo solo mira las activas.
  activa boolean not null default true,

  -- RN-01: el intervalo que la función ocupa la sala, incluidos los 30 minutos de
  -- separación. Es una columna y no una expresión dentro del índice porque
  -- `timestamptz + interval` es STABLE, no IMMUTABLE: Postgres no acepta una
  -- expresión así ni en un EXCLUDE ni en una columna generada. La llena el trigger.
  rango tstzrange not null,

  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  -- RN-02 convertida en invariante del motor: dos funciones activas de la misma
  -- sala no pueden tener rangos que se toquen. No es una promesa del código de
  -- aplicación; es un error 23P01 aunque la escritura venga por otro camino.
  constraint funciones_sin_solapamiento
    exclude using gist (sala_id with =, rango with &&) where (activa)
);

create index funciones_inicio_idx on public.funciones (inicio);
create index funciones_pelicula_idx on public.funciones (pelicula_id);

-- Calcula el rango a partir de la duración de la película más los 30 minutos de
-- separación. El extremo derecho queda abierto, `[inicio, fin)`, para que una
-- función que arranca exactamente cuando la anterior libera la sala no choque.
create or replace function public.calcular_rango_funcion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_duracion smallint;
begin
  select p.duracion_minutos into v_duracion
  from public.peliculas p
  where p.id = new.pelicula_id;

  if v_duracion is null then
    raise exception 'La pelicula % no existe', new.pelicula_id;
  end if;

  new.rango := tstzrange(
    new.inicio,
    new.inicio + make_interval(mins => v_duracion + 30),
    '[)'
  );

  return new;
end;
$$;

create trigger funciones_rango
  before insert or update of inicio, pelicula_id on public.funciones
  for each row execute function public.calcular_rango_funcion();

create trigger funciones_actualizado_at
  before update on public.funciones
  for each row execute function public.tocar_actualizado_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Cada tabla se cierra en el mismo archivo que la crea. El editor SQL manda el
-- archivo entero como una transacción, así que la tabla y su RLS nacen juntas:
-- no hay un instante en que exista abierta a las claves anon o authenticated.
--
-- Se habilita sin escribir ninguna política: en Postgres eso no devuelve ni una
-- fila y no acepta ninguna escritura. Deny by default (D3-01). Las políticas las
-- abre cada fase cuando construye su pantalla; las de perfiles van en 0014.

alter table public.funciones enable row level security;
