-- 0009 — Cupones, puntos, recompensas y crédito
-- (RF-39, RF-40, RF-43 a RF-48, RN-07, RN-08, RN-09, RF-31, RF-32)

create table public.cupones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo public.tipo_cupon not null,
  tipo_descuento public.tipo_descuento not null default 'porcentaje',
  valor numeric(10, 2) not null check (valor > 0),

  -- RN-09: un cupón segmentado por edad solo aplica si el usuario está registrado
  -- y cumple la condición. Nulo significa que no mira la edad.
  edad_minima smallint check (edad_minima is null or edad_minima between 0 and 120),

  vigente_desde date,
  vigente_hasta date,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint cupones_vigencia_coherente check (
    vigente_desde is null or vigente_hasta is null or vigente_desde <= vigente_hasta
  )
);

-- La FK quedó pendiente en 0008 porque las órdenes se crean antes que los cupones.
alter table public.ordenes
  add constraint ordenes_cupon_fkey
  foreign key (cupon_id) references public.cupones (id) on delete set null;

-- RN-08: el cupón de bienvenida se usa una única vez por cuenta. El índice parcial
-- lo impone sobre las órdenes que efectivamente se pagaron.
create unique index ordenes_cupon_una_vez_por_cuenta
  on public.ordenes (perfil_id, cupon_id)
  where perfil_id is not null and cupon_id is not null and estado = 'pagada';

-- RN-07: 1 punto por peso efectivamente pagado, y los puntos no se transfieren
-- (RF-48). El saldo es la suma de los movimientos: un libro mayor, no un contador
-- que se pisa. Así el historial de RF-40 sale de la misma tabla que el saldo.
create table public.puntos_movimientos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  orden_id uuid references public.ordenes (id) on delete set null,
  -- Positivo cuando acumula, negativo cuando canjea.
  puntos integer not null check (puntos <> 0),
  motivo text not null,
  creado_at timestamptz not null default now()
);

create index puntos_movimientos_perfil_idx on public.puntos_movimientos (perfil_id);

-- RF-46/RF-47: qué se canjea y cuántos puntos cuesta, configurable por el admin.
create table public.recompensas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  tipo public.tipo_recompensa not null,
  producto_id uuid references public.productos (id) on delete set null,
  costo_puntos integer not null check (costo_puntos > 0),
  activa boolean not null default true,
  creado_at timestamptz not null default now()
);

create table public.canjes (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  recompensa_id uuid not null references public.recompensas (id) on delete restrict,
  orden_id uuid references public.ordenes (id) on delete set null,
  -- Congela el costo: si mañana la recompensa sube de precio, el canje de hoy
  -- sigue diciendo lo que costó.
  costo_puntos integer not null check (costo_puntos > 0),
  creado_at timestamptz not null default now()
);

create index canjes_perfil_idx on public.canjes (perfil_id);

-- RF-31/RF-32: la cancelación no devuelve dinero, acredita crédito. Mismo criterio
-- de libro mayor que los puntos: el saldo es la suma, y cada línea dice por qué.
create table public.creditos_movimientos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  orden_id uuid references public.ordenes (id) on delete set null,
  monto numeric(10, 2) not null check (monto <> 0),
  motivo text not null,
  creado_at timestamptz not null default now()
);

create index creditos_movimientos_perfil_idx on public.creditos_movimientos (perfil_id);

create trigger cupones_actualizado_at
  before update on public.cupones
  for each row execute function public.tocar_actualizado_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Cada tabla se cierra en el mismo archivo que la crea. El editor SQL manda el
-- archivo entero como una transacción, así que la tabla y su RLS nacen juntas:
-- no hay un instante en que exista abierta a las claves anon o authenticated.
--
-- Se habilita sin escribir ninguna política: en Postgres eso no devuelve ni una
-- fila y no acepta ninguna escritura. Deny by default (D3-01). Las políticas las
-- abre cada fase cuando construye su pantalla; las de perfiles van en 0014.

alter table public.cupones enable row level security;
alter table public.puntos_movimientos enable row level security;
alter table public.recompensas enable row level security;
alter table public.canjes enable row level security;
alter table public.creditos_movimientos enable row level security;
