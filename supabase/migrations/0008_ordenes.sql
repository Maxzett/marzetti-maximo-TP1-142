-- 0008 — Órdenes, butacas vendidas y reservas temporales
-- (RF-24 a RF-32, RF-34, RN-03, RN-05, RN-06, D-02, D-03, D-06, D-08)

create table public.ordenes (
  id uuid primary key default gen_random_uuid(),

  -- RF-26: la compra puede ser anónima, así que el perfil es opcional. Cuando la
  -- cuenta se borra, la orden sobrevive sin dueño: es un comprobante de venta.
  perfil_id uuid references public.perfiles (id) on delete set null,

  -- Con compra anónima el email es el único canal para mandar el PDF (RF-27).
  email_contacto text not null check (position('@' in email_contacto) > 1),

  funcion_id uuid not null references public.funciones (id) on delete restrict,
  estado public.estado_orden not null default 'pendiente',

  -- D-02: en una función con restricción de edad, el comprador anónimo declara su
  -- fecha de nacimiento. Queda guardada porque es la constancia de la declaración.
  fecha_nacimiento_declarada date,

  -- D-06, en el orden en que se aplican: subtotal, después el cupón, después el
  -- crédito, y lo que queda va al medio de pago.
  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  cupon_id uuid,
  descuento_cupon numeric(10, 2) not null default 0 check (descuento_cupon >= 0),
  credito_aplicado numeric(10, 2) not null default 0 check (credito_aplicado >= 0),
  total numeric(10, 2) not null default 0 check (total >= 0),

  -- D-07: no hay pasarela real. Se registra el medio y se confirma en simulado.
  medio_pago text,

  -- RN-05 y D-03: un único código por orden con DOS consumos independientes.
  -- Cada marca se pone una sola vez; consumir una no afecta a la otra.
  codigo text not null unique,
  entrada_validada_at timestamptz,
  entrada_validada_por uuid references public.perfiles (id) on delete set null,
  candy_entregado_at timestamptz,
  candy_entregado_por uuid references public.perfiles (id) on delete set null,

  -- D-08: una orden pendiente vence a los 10 minutos y libera las butacas.
  expira_at timestamptz,

  creada_at timestamptz not null default now(),
  pagada_at timestamptz,
  cancelada_at timestamptz,

  -- Una orden pagada tiene fecha de pago, y una cancelada tiene fecha de
  -- cancelación. Es lo que impide un estado que el historial no respalda.
  constraint ordenes_pagada_con_fecha check (estado <> 'pagada' or pagada_at is not null),
  constraint ordenes_cancelada_con_fecha check (estado <> 'cancelada' or cancelada_at is not null)
);

create index ordenes_perfil_idx on public.ordenes (perfil_id);
create index ordenes_funcion_idx on public.ordenes (funcion_id);
-- RF-57: el reporte de facturación recorre las pagadas por fecha.
create index ordenes_pagada_at_idx on public.ordenes (pagada_at) where estado = 'pagada';

create table public.orden_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete cascade,
  tipo public.tipo_item not null,

  butaca_id uuid references public.butacas (id) on delete restrict,
  producto_id uuid references public.productos (id) on delete restrict,
  combo_id uuid references public.combos (id) on delete restrict,

  cantidad smallint not null default 1 check (cantidad > 0),

  -- RN-10: el precio se congela en la orden. Si mañana cambia el precio de la
  -- función, la orden de ayer sigue valiendo lo que valía.
  precio_unitario numeric(10, 2) not null check (precio_unitario >= 0),

  -- Cada tipo de ítem apunta exactamente a una entidad, y a ninguna otra.
  constraint orden_items_referencia_coherente check (
    (tipo = 'entrada'  and butaca_id is not null and producto_id is null and combo_id is null)
    or (tipo = 'producto' and producto_id is not null and butaca_id is null and combo_id is null)
    or (tipo = 'combo'    and combo_id is not null and butaca_id is null and producto_id is null)
  )
);

create index orden_items_orden_idx on public.orden_items (orden_id);

-- RN-03: una butaca, una venta. El unique sobre (funcion_id, butaca_id) es lo que
-- hace imposible vender dos veces el mismo asiento, aunque dos checkouts corran a
-- la vez: el segundo INSERT choca contra el índice, no contra un IF del código.
create table public.butacas_ordenes (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete cascade,
  funcion_id uuid not null references public.funciones (id) on delete restrict,
  butaca_id uuid not null references public.butacas (id) on delete restrict,
  unique (funcion_id, butaca_id)
);

create index butacas_ordenes_orden_idx on public.butacas_ordenes (orden_id);
create index butacas_ordenes_funcion_idx on public.butacas_ordenes (funcion_id);

-- D-08: reserva temporal de 10 minutos mientras el usuario completa la compra.
-- El unique impide que dos usuarios retengan la misma butaca de la misma función.
-- No se usa un índice parcial con `expira_at > now()` porque now() no es inmutable
-- y Postgres no lo admite en el predicado: las vencidas se borran al tomar una
-- reserva nueva, dentro de la misma RPC transaccional (F6).
create table public.holds_butacas (
  id uuid primary key default gen_random_uuid(),
  funcion_id uuid not null references public.funciones (id) on delete cascade,
  butaca_id uuid not null references public.butacas (id) on delete cascade,

  -- Identifica al que reserva sin exigirle cuenta: la compra anónima también
  -- necesita retener sus butacas (RF-26).
  perfil_id uuid references public.perfiles (id) on delete cascade,
  sesion_id text not null,

  expira_at timestamptz not null,
  creado_at timestamptz not null default now(),

  unique (funcion_id, butaca_id)
);

create index holds_butacas_expira_idx on public.holds_butacas (expira_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Cada tabla se cierra en el mismo archivo que la crea. El editor SQL manda el
-- archivo entero como una transacción, así que la tabla y su RLS nacen juntas:
-- no hay un instante en que exista abierta a las claves anon o authenticated.
--
-- Se habilita sin escribir ninguna política: en Postgres eso no devuelve ni una
-- fila y no acepta ninguna escritura. Deny by default (D3-01). Las políticas las
-- abre cada fase cuando construye su pantalla; las de perfiles van en 0014.

alter table public.ordenes enable row level security;
alter table public.orden_items enable row level security;
alter table public.butacas_ordenes enable row level security;
alter table public.holds_butacas enable row level security;
