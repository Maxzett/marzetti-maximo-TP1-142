-- 0005 — Salas y butacas (RF-12 a RF-18, D-01)

create table public.salas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  activa boolean not null default true,
  creado_at timestamptz not null default now()
);

create table public.butacas (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references public.salas (id) on delete cascade,

  -- RF-12: 20 filas, de la A a la T.
  fila char(1) not null check (fila between 'A' and 'T'),

  -- RF-12: tres columnas de butacas separadas por los dos pasillos.
  columna smallint not null check (columna between 1 and 3),

  -- Numeración corrida dentro de la fila, de 1 a 28 (o a 14 en J y K).
  numero smallint not null check (numero between 1 and 28),

  tipo public.tipo_ubicacion not null,

  -- Dos butacas no pueden compartir número dentro de la misma fila de la misma sala.
  unique (sala_id, fila, numero)
);

create index butacas_sala_idx on public.butacas (sala_id);

comment on column public.butacas.tipo is
  'estandar (A-I, L-Q), silla_ruedas (J y K, D-01) y vip (R, S, T). El mapa las dibuja distinto, no solo de otro color (RF-16, RNF-10).';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Cada tabla se cierra en el mismo archivo que la crea. El editor SQL manda el
-- archivo entero como una transacción, así que la tabla y su RLS nacen juntas:
-- no hay un instante en que exista abierta a las claves anon o authenticated.
--
-- Se habilita sin escribir ninguna política: en Postgres eso no devuelve ni una
-- fila y no acepta ninguna escritura. Deny by default (D3-01). Las políticas las
-- abre cada fase cuando construye su pantalla; las de perfiles van en 0014.

alter table public.salas enable row level security;
alter table public.butacas enable row level security;
