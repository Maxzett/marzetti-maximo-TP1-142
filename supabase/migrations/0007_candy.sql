-- 0007 — Candy bar: categorías, productos y combos (RF-33 a RF-37)

create table public.categorias_productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  -- Orden de presentación en la pantalla de compra, a criterio del administrador.
  orden smallint not null default 0
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias_productos (id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text not null default '',
  imagen_url text,
  precio numeric(10, 2) not null check (precio >= 0),
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create index productos_categoria_idx on public.productos (categoria_id);

-- RF-36: entrada + pochoclos + bebida a un precio fijo, que no es la suma de las
-- partes. Por eso el precio es una columna propia y no un cálculo.
create table public.combos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text not null default '',
  imagen_url text,
  precio numeric(10, 2) not null check (precio >= 0),
  -- RF-37: los combos aparecen destacados en la página de compra.
  destacado boolean not null default true,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create table public.combo_items (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.combos (id) on delete cascade,
  -- Nulo cuando el ítem del combo es la entrada y no un producto del candy.
  producto_id uuid references public.productos (id) on delete restrict,
  incluye_entrada boolean not null default false,
  cantidad smallint not null default 1 check (cantidad > 0),

  -- Un ítem del combo es una entrada o un producto, nunca las dos cosas ni ninguna.
  constraint combo_items_entrada_o_producto check (
    (incluye_entrada and producto_id is null)
    or (not incluye_entrada and producto_id is not null)
  )
);

create index combo_items_combo_idx on public.combo_items (combo_id);

create trigger productos_actualizado_at
  before update on public.productos
  for each row execute function public.tocar_actualizado_at();

create trigger combos_actualizado_at
  before update on public.combos
  for each row execute function public.tocar_actualizado_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Cada tabla se cierra en el mismo archivo que la crea. El editor SQL manda el
-- archivo entero como una transacción, así que la tabla y su RLS nacen juntas:
-- no hay un instante en que exista abierta a las claves anon o authenticated.
--
-- Se habilita sin escribir ninguna política: en Postgres eso no devuelve ni una
-- fila y no acepta ninguna escritura. Deny by default (D3-01). Las políticas las
-- abre cada fase cuando construye su pantalla; las de perfiles van en 0014.

alter table public.categorias_productos enable row level security;
alter table public.productos enable row level security;
alter table public.combos enable row level security;
alter table public.combo_items enable row level security;
