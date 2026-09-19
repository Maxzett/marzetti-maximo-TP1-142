-- 0003 — Perfiles y datos sensibles (RF-38, RF-38.1, RNF-11)
--
-- Por qué son DOS tablas y no una:
-- RLS en Postgres filtra FILAS, no columnas. RF-38.1 exige que el tipo de sangre,
-- el color de ojos y los días de vacaciones no los vea nadie más que su titular,
-- ni siquiera el administrador — pero el administrador sí necesita leer nombre y
-- apellido para el log de actividad (RF-61). Con una sola tabla, cualquier política
-- que le dé al admin la fila se la da entera. Separarlas físicamente es la forma
-- simple, verificable y difícil de romper por accidente: perfiles_sensibles tiene
-- una única política, la del titular, y no existe ninguna para el admin.
-- Efecto lateral buscado: los tres campos quedan fuera de reportes y exportaciones
-- por construcción, no por disciplina del que escriba la consulta (D-04, RNF-11).

create table public.perfiles (
  -- La identidad la administra Supabase Auth; acá solo colgamos los datos del TP.
  -- El on delete cascade evita perfiles huérfanos si se borra la cuenta.
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  nombre text not null check (length(trim(nombre)) > 0),
  apellido text not null check (length(trim(apellido)) > 0),

  -- El único de los campos agregados que sí tiene uso funcional: la restricción de
  -- edad (RN-04) y los cupones segmentados por edad (RN-09) dependen de él.
  fecha_nacimiento date not null check (fecha_nacimiento <= current_date),

  -- El rol vive acá, pero su titular NO puede modificarlo: ver 0013.
  rol public.rol_usuario not null default 'cliente',

  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

comment on table public.perfiles is
  'Datos de cuenta del usuario. Los campos sin uso funcional van en perfiles_sensibles (RF-38.1).';

create table public.perfiles_sensibles (
  -- La PK es también la FK: relación uno a uno obligada por el motor.
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,

  -- CHECK y no enum: la lista de tipos de sangre sí es cerrada, pero mantener las
  -- tres columnas con el mismo mecanismo hace el archivo más fácil de leer.
  tipo_sangre text not null check (tipo_sangre in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),

  -- CHECK y no enum a propósito: el pliego trae la lista truncada ("Marrones,
  -- verdes, azules, ") y un label de enum en Postgres no se borra ni se renombra.
  -- Con CHECK, corregir la lista es un ALTER de una línea.
  color_ojos text not null check (color_ojos in ('marrones', 'verdes', 'azules', 'grises', 'negros', 'miel')),

  dias_vacaciones smallint not null check (dias_vacaciones between 0 and 365),

  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

comment on table public.perfiles_sensibles is
  'Datos personales sensibles. Solo los lee su titular: sin politica de admin (RF-38.1, RNF-11).';

-- Mantener actualizado_at es trabajo de la base: si dependiera del cliente,
-- bastaría con que una pantalla se olvidara de mandarlo.
create or replace function public.tocar_actualizado_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_at := now();
  return new;
end;
$$;

create trigger perfiles_actualizado_at
  before update on public.perfiles
  for each row execute function public.tocar_actualizado_at();

create trigger perfiles_sensibles_actualizado_at
  before update on public.perfiles_sensibles
  for each row execute function public.tocar_actualizado_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Cada tabla se cierra en el mismo archivo que la crea. El editor SQL manda el
-- archivo entero como una transacción, así que la tabla y su RLS nacen juntas:
-- no hay un instante en que exista abierta a las claves anon o authenticated.
--
-- Se habilita sin escribir ninguna política: en Postgres eso no devuelve ni una
-- fila y no acepta ninguna escritura. Deny by default (D3-01). Las políticas las
-- abre cada fase cuando construye su pantalla; las de perfiles van en 0014.

alter table public.perfiles enable row level security;
alter table public.perfiles_sensibles enable row level security;
