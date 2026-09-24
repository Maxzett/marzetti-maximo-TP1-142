-- 0020 — Compra de entradas: reservas, orden pendiente y pago simulado
-- (RF-24 a RF-29, RN-03, RN-04, RN-10, RN-11, D-02, D-06, D-07, D-08)
--
-- Ninguna de las cuatro tablas de la compra (ordenes, orden_items, butacas_ordenes,
-- holds_butacas) recibe GRANT ni política: la API no las lee ni las escribe. Todo
-- pasa por las funciones de este archivo, que corren como SECURITY DEFINER y validan
-- por su cuenta. Es lo que permite la compra anónima (RF-26) sin abrir tablas:
-- quien no tiene cuenta se identifica con `sesion_id`, un valor al azar que genera el
-- navegador, y el código de la orden funciona como llave para volver a verla.
--
-- Códigos de error (SQLSTATE), redactados en español para mostrarse tal cual:
--   22023  un parámetro no es válido (sesión, mail, edad, medio de pago)
--   P0002  la función, la butaca o la orden no existen
--   55000  el estado no admite la operación (butaca tomada, reserva vencida,
--          función ya comenzada, tope de butacas)
--
-- Tiempo real (RF-25): las funciones emiten un evento Broadcast por función con
-- solo `butaca_id` y `estado`. No se expone `sesion_id` ni ninguna fila de venta, y
-- las tablas siguen cerradas. El estado inicial se pide con estado_butacas().

-- ── Configuración ───────────────────────────────────────────────────────────
-- RN-11: el recargo de la ubicación VIP no vive en el código. Se cierra con RLS y sin
-- política: solo lo leen las funciones de esta migración.
create table public.configuracion (
  clave text primary key,
  valor numeric not null
);

alter table public.configuracion enable row level security;

insert into public.configuracion (clave, valor) values
  ('recargo_vip', 2000),
  ('max_butacas_por_orden', 8);

-- La orden pendiente pertenece a una sesión de navegador: sin esto, cualquiera que
-- adivine un id podría confirmar la orden de otro.
alter table public.ordenes add column sesion_id text;
create index ordenes_pendientes_sesion_idx on public.ordenes (sesion_id, funcion_id)
  where estado = 'pendiente';

-- ── Funciones internas (sin EXECUTE para la API) ────────────────────────────

-- Envía el evento a los mapas abiertos. Si Realtime no está disponible la venta no
-- se rompe: el mapa se corrige igual la próxima vez que se consulta el estado.
create or replace function public.avisar_butaca(p_funcion uuid, p_butaca uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('butaca_id', p_butaca, 'estado', p_estado),
    'butaca',
    'funcion:' || p_funcion::text,
    false
  );
exception when others then
  null;
end;
$$;

-- D-08: no hay job programado. Cada llamada que toca una función barre primero las
-- reservas vencidas y las órdenes pendientes que superaron su ventana.
create or replace function public.limpiar_vencidos(p_funcion uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_butaca uuid;
begin
  for v_butaca in
    delete from public.holds_butacas
     where funcion_id = p_funcion and expira_at <= now()
    returning butaca_id
  loop
    perform public.avisar_butaca(p_funcion, v_butaca, 'libre');
  end loop;

  update public.ordenes
     set estado = 'expirada'
   where funcion_id = p_funcion and estado = 'pendiente' and expira_at <= now();
end;
$$;

-- RN-10 y RN-11: base de la función (o de preventa) más el recargo de la ubicación.
-- La preventa reemplaza al base desde 7 días antes del estreno y hasta la fecha de
-- estreno; después vuelve al precio normal sin que nadie lo cambie. Las fechas se
-- miden en la hora del cine porque el servidor corre en UTC.
create or replace function public.precio_de_entrada(p_funcion uuid, p_tipo public.tipo_ubicacion)
returns numeric
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  f record;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_base numeric;
  v_recargo numeric := 0;
begin
  select fu.precio_base, p.precio_preventa, p.preventa_desde, p.fecha_estreno
    into f
    from public.funciones fu
    join public.peliculas p on p.id = fu.pelicula_id
   where fu.id = p_funcion;

  v_base := f.precio_base;
  if f.precio_preventa is not null
     and f.preventa_desde is not null
     and v_hoy >= f.preventa_desde
     and v_hoy < f.fecha_estreno then
    v_base := f.precio_preventa;
  end if;

  if p_tipo = 'vip' then
    select valor into v_recargo from public.configuracion where clave = 'recargo_vip';
  end if;

  return v_base + coalesce(v_recargo, 0);
end;
$$;

-- ── Estado del mapa ─────────────────────────────────────────────────────────
-- Devuelve solo las butacas que no están libres; el cliente asume libre el resto.
-- `propia` es una reserva de esta misma sesión.
create or replace function public.estado_butacas(p_funcion uuid, p_sesion text)
returns table (butaca_id uuid, estado text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.funciones where id = p_funcion) then
    raise exception 'La función no existe.' using errcode = 'P0002';
  end if;

  perform public.limpiar_vencidos(p_funcion);

  return query
    select bo.butaca_id, 'ocupada'::text
      from public.butacas_ordenes bo
     where bo.funcion_id = p_funcion
    union all
    select h.butaca_id,
           case when h.sesion_id = p_sesion then 'propia' else 'retenida' end
      from public.holds_butacas h
     where h.funcion_id = p_funcion;
end;
$$;

-- ── Reserva de una butaca (D-08) ────────────────────────────────────────────
create or replace function public.retener_butaca(p_funcion uuid, p_butaca uuid, p_sesion text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_propias int;
  v_expira timestamptz := now() + interval '10 minutes';
  v_dueno text;
begin
  if p_sesion is null or length(p_sesion) < 16 then
    raise exception 'La sesión de compra no es válida.' using errcode = '22023';
  end if;

  -- Bloqueo de la función mientras se decide: dos reservas simultáneas sobre la misma
  -- función se serializan y el tope de butacas no se puede saltear con dos pestañas.
  perform 1 from public.funciones where id = p_funcion and activa for update;
  if not found then
    raise exception 'La función no existe o fue dada de baja.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.funciones where id = p_funcion and inicio > now()) then
    raise exception 'La función ya comenzó.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.butacas b join public.funciones f on f.sala_id = b.sala_id
     where b.id = p_butaca and f.id = p_funcion
  ) then
    raise exception 'Esa butaca no pertenece a la sala de la función.' using errcode = '22023';
  end if;

  perform public.limpiar_vencidos(p_funcion);

  if exists (select 1 from public.butacas_ordenes where funcion_id = p_funcion and butaca_id = p_butaca) then
    raise exception 'Esa butaca ya fue vendida.' using errcode = '55000';
  end if;

  select sesion_id into v_dueno
    from public.holds_butacas where funcion_id = p_funcion and butaca_id = p_butaca;
  if v_dueno is not null then
    if v_dueno = p_sesion then
      return jsonb_build_object('ok', true, 'butaca_id', p_butaca);
    end if;
    raise exception 'Otra persona está eligiendo esa butaca en este momento.' using errcode = '55000';
  end if;

  select valor::int into v_max from public.configuracion where clave = 'max_butacas_por_orden';
  select count(*) into v_propias
    from public.holds_butacas where funcion_id = p_funcion and sesion_id = p_sesion;
  if v_propias >= v_max then
    raise exception 'Podés elegir hasta % butacas por compra.', v_max using errcode = '55000';
  end if;

  insert into public.holds_butacas (funcion_id, butaca_id, perfil_id, sesion_id, expira_at)
  values (p_funcion, p_butaca, (select auth.uid()), p_sesion, v_expira);

  perform public.avisar_butaca(p_funcion, p_butaca, 'retenida');
  return jsonb_build_object('ok', true, 'butaca_id', p_butaca, 'expira_at', v_expira);
end;
$$;

create or replace function public.liberar_butaca(p_funcion uuid, p_butaca uuid, p_sesion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borradas int;
begin
  -- Solo borra la reserva propia: con otra sesión no toca nada.
  delete from public.holds_butacas
   where funcion_id = p_funcion and butaca_id = p_butaca and sesion_id = p_sesion;
  get diagnostics v_borradas = row_count;
  if v_borradas > 0 then
    perform public.avisar_butaca(p_funcion, p_butaca, 'libre');
  end if;
end;
$$;

-- ── Orden pendiente ─────────────────────────────────────────────────────────
-- Convierte las reservas de la sesión en una orden pendiente con los precios ya
-- congelados (RN-10) y aplica la restricción de edad (RN-04, D-02).
create or replace function public.crear_orden(
  p_funcion uuid,
  p_sesion text,
  p_email text,
  p_fecha_nacimiento date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
  v_uid uuid := (select auth.uid());
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nacimiento date;
  v_dia_funcion date;
  v_edad int;
  v_orden uuid;
  v_codigo text;
  v_subtotal numeric := 0;
  v_expira timestamptz;
  v_cantidad int;
  v_vip boolean;
  v_items jsonb;
begin
  if p_sesion is null or length(p_sesion) < 16 then
    raise exception 'La sesión de compra no es válida.' using errcode = '22023';
  end if;

  select fu.id, fu.inicio, p.restriccion_edad
    into f
    from public.funciones fu
    join public.peliculas p on p.id = fu.pelicula_id
   where fu.id = p_funcion and fu.activa
     for update of fu;
  if not found then
    raise exception 'La función no existe o fue dada de baja.' using errcode = 'P0002';
  end if;
  if f.inicio <= now() then
    raise exception 'La función ya comenzó.' using errcode = '55000';
  end if;

  perform public.limpiar_vencidos(p_funcion);

  if v_uid is not null and v_email = '' then
    select lower(email) into v_email from public.perfiles where id = v_uid;
  end if;
  if position('@' in v_email) <= 1 then
    raise exception 'Ingresá un email válido: ahí te mandamos la entrada.' using errcode = '22023';
  end if;

  -- RN-04: la edad se mide a la fecha de la función, no a la de hoy. Con cuenta se usa
  -- la fecha registrada; sin cuenta, la declarada, que queda guardada (D-02).
  if f.restriccion_edad > 0 then
    if v_uid is not null then
      select fecha_nacimiento into v_nacimiento from public.perfiles where id = v_uid;
    else
      v_nacimiento := p_fecha_nacimiento;
    end if;
    if v_nacimiento is null then
      raise exception 'Esta película tiene restricción de edad: declará tu fecha de nacimiento.'
        using errcode = '22023';
    end if;
    if v_nacimiento > current_date then
      raise exception 'La fecha de nacimiento no puede ser futura.' using errcode = '22023';
    end if;
    v_dia_funcion := (f.inicio at time zone 'America/Argentina/Buenos_Aires')::date;
    v_edad := extract(year from age(v_dia_funcion, v_nacimiento));
    if v_edad < f.restriccion_edad then
      raise exception 'No podés comprar entradas para esta película: es para mayores de % años.',
        f.restriccion_edad using errcode = '22023';
    end if;
  end if;

  -- Una sola orden pendiente por sesión y función: si vuelve atrás y confirma de nuevo
  -- se reemplaza la anterior en vez de acumular órdenes fantasma.
  delete from public.ordenes
   where sesion_id = p_sesion and funcion_id = p_funcion and estado = 'pendiente';

  select count(*), min(h.expira_at)
    into v_cantidad, v_expira
    from public.holds_butacas h
   where h.funcion_id = p_funcion and h.sesion_id = p_sesion and h.expira_at > now();
  if v_cantidad = 0 then
    raise exception 'No tenés butacas reservadas: elegí al menos una.' using errcode = '55000';
  end if;

  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));

  insert into public.ordenes (
    perfil_id, email_contacto, funcion_id, estado, fecha_nacimiento_declarada,
    codigo, expira_at, sesion_id
  )
  values (
    v_uid, v_email, p_funcion, 'pendiente',
    case when v_uid is null and f.restriccion_edad > 0 then v_nacimiento end,
    v_codigo, v_expira, p_sesion
  )
  returning id into v_orden;

  insert into public.orden_items (orden_id, tipo, butaca_id, cantidad, precio_unitario)
  select v_orden, 'entrada', h.butaca_id, 1, public.precio_de_entrada(p_funcion, b.tipo)
    from public.holds_butacas h
    join public.butacas b on b.id = h.butaca_id
   where h.funcion_id = p_funcion and h.sesion_id = p_sesion and h.expira_at > now();

  select sum(precio_unitario) into v_subtotal from public.orden_items where orden_id = v_orden;

  -- D-06: el cupón, el crédito y el medio de pago llegan en la F7; hoy el total es el
  -- subtotal, pero las columnas ya están en su orden.
  update public.ordenes set subtotal = v_subtotal, total = v_subtotal where id = v_orden;

  select bool_or(b.tipo = 'vip'),
         jsonb_agg(jsonb_build_object(
           'butaca_id', b.id, 'fila', b.fila, 'numero', b.numero,
           'tipo', b.tipo, 'precio', oi.precio_unitario
         ) order by b.fila, b.numero)
    into v_vip, v_items
    from public.orden_items oi join public.butacas b on b.id = oi.butaca_id
   where oi.orden_id = v_orden;

  return jsonb_build_object(
    'orden_id', v_orden,
    'codigo', v_codigo,
    'expira_at', v_expira,
    'subtotal', v_subtotal,
    'total', v_subtotal,
    'tiene_vip', coalesce(v_vip, false),
    'requiere_acompanante', f.restriccion_edad > 0,
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

-- ── Pago simulado (D-07) ────────────────────────────────────────────────────
-- Es el único punto donde ocurre el cobro: reemplazarlo por una pasarela real es un
-- cambio localizado en esta función. RN-03: las reservas se validan y se convierten en
-- venta en la misma transacción; el unique de butacas_ordenes es la red final.
create or replace function public.confirmar_pago(p_orden uuid, p_sesion text, p_medio text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_faltan int;
  v_butaca uuid;
begin
  if p_medio is null or p_medio not in ('tarjeta_credito', 'tarjeta_debito', 'transferencia') then
    raise exception 'Elegí un medio de pago válido.' using errcode = '22023';
  end if;

  select * into o from public.ordenes
   where id = p_orden and sesion_id = p_sesion
     for update;
  if not found then
    raise exception 'La orden no existe.' using errcode = 'P0002';
  end if;
  if o.estado = 'pagada' then
    return jsonb_build_object('ok', true, 'codigo', o.codigo);
  end if;
  -- Vencida: se devuelve en vez de lanzar. Una excepción revertiría el UPDATE que
  -- marca la orden como expirada, y el estado quedaría pendiente para siempre.
  if o.estado = 'pendiente' and o.expira_at <= now() then
    update public.ordenes set estado = 'expirada' where id = p_orden;
    perform public.limpiar_vencidos(o.funcion_id);
    return jsonb_build_object('ok', false, 'motivo', 'vencida',
      'mensaje', 'La reserva venció. Elegí las butacas de nuevo.');
  end if;
  if o.estado <> 'pendiente' then
    raise exception 'La orden ya no se puede pagar.' using errcode = '55000';
  end if;

  select count(*) into v_faltan
    from public.orden_items oi
   where oi.orden_id = p_orden and oi.tipo = 'entrada'
     and not exists (
       select 1 from public.holds_butacas h
        where h.funcion_id = o.funcion_id and h.butaca_id = oi.butaca_id
          and h.sesion_id = p_sesion and h.expira_at > now()
     );
  if v_faltan > 0 then
    raise exception 'Alguna de tus butacas ya no está reservada. Elegí de nuevo.' using errcode = '55000';
  end if;

  insert into public.butacas_ordenes (orden_id, funcion_id, butaca_id)
  select p_orden, o.funcion_id, oi.butaca_id
    from public.orden_items oi where oi.orden_id = p_orden and oi.tipo = 'entrada';

  update public.ordenes
     set estado = 'pagada', pagada_at = now(), medio_pago = p_medio, expira_at = null
   where id = p_orden;

  for v_butaca in
    delete from public.holds_butacas
     where funcion_id = o.funcion_id and sesion_id = p_sesion
       and butaca_id in (select butaca_id from public.orden_items where orden_id = p_orden)
    returning butaca_id
  loop
    perform public.avisar_butaca(o.funcion_id, v_butaca, 'ocupada');
  end loop;

  return jsonb_build_object('ok', true, 'codigo', o.codigo);
end;
$$;

-- ── Mi entrada (RF-27) ──────────────────────────────────────────────────────
-- El comprador anónimo no puede leer tablas: el código de la orden, que no se puede
-- adivinar, es la llave. Devuelve solo lo que la entrada muestra.
create or replace function public.obtener_orden(p_codigo text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
           'codigo', o.codigo,
           'estado', o.estado,
           'email', o.email_contacto,
           'total', o.total,
           'pagada_at', o.pagada_at,
           'entrada_validada_at', o.entrada_validada_at,
           'pelicula', p.titulo,
           'restriccion_edad', p.restriccion_edad,
           'requiere_acompanante', p.restriccion_edad > 0,
           'inicio', f.inicio,
           'formato', f.formato,
           'idioma', f.idioma,
           'sala', s.nombre,
           'butacas', (
             select jsonb_agg(jsonb_build_object(
                      'fila', b.fila, 'numero', b.numero, 'tipo', b.tipo,
                      'precio', oi.precio_unitario
                    ) order by b.fila, b.numero)
               from public.orden_items oi join public.butacas b on b.id = oi.butaca_id
              where oi.orden_id = o.id and oi.tipo = 'entrada'
           )
         )
    into v
    from public.ordenes o
    join public.funciones f on f.id = o.funcion_id
    join public.peliculas p on p.id = f.pelicula_id
    join public.salas s on s.id = f.sala_id
   where o.codigo = upper(trim(p_codigo));

  if v is null then
    raise exception 'No encontramos esa entrada.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
-- Las internas no tienen EXECUTE para la API. Las de compra sí, también para `anon`
-- (RF-26). Son SECURITY DEFINER sin chequeo de rol a propósito: cada una valida por su
-- cuenta la sesión, la función, la butaca y el estado, y el linter las va a marcar.
revoke all on function public.avisar_butaca(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.limpiar_vencidos(uuid) from public, anon, authenticated;
revoke all on function public.precio_de_entrada(uuid, public.tipo_ubicacion) from public, anon, authenticated;

revoke all on function public.estado_butacas(uuid, text) from public, anon, authenticated;
revoke all on function public.retener_butaca(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.liberar_butaca(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.crear_orden(uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.confirmar_pago(uuid, text, text) from public, anon, authenticated;
revoke all on function public.obtener_orden(text) from public, anon, authenticated;

grant execute on function public.estado_butacas(uuid, text) to anon, authenticated;
grant execute on function public.retener_butaca(uuid, uuid, text) to anon, authenticated;
grant execute on function public.liberar_butaca(uuid, uuid, text) to anon, authenticated;
grant execute on function public.crear_orden(uuid, text, text, date) to anon, authenticated;
grant execute on function public.confirmar_pago(uuid, text, text) to anon, authenticated;
grant execute on function public.obtener_orden(text) to anon, authenticated;

-- Verificación: si algo quedó mal la migración entera falla, no la primera compra.
do $$
begin
  if has_function_privilege('anon', 'public.limpiar_vencidos(uuid)', 'execute')
     or has_function_privilege('anon', 'public.avisar_butaca(uuid, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.precio_de_entrada(uuid, public.tipo_ubicacion)', 'execute') then
    raise exception '0020: una función interna quedó expuesta a la API';
  end if;
  if not has_function_privilege('anon', 'public.retener_butaca(uuid, uuid, text)', 'execute')
     or not has_function_privilege('anon', 'public.confirmar_pago(uuid, text, text)', 'execute') then
    raise exception '0020: la compra anónima no puede ejecutar sus funciones';
  end if;
  if has_table_privilege('anon', 'public.holds_butacas', 'select')
     or has_table_privilege('anon', 'public.ordenes', 'select')
     or has_table_privilege('authenticated', 'public.butacas_ordenes', 'select') then
    raise exception '0020: una tabla de la compra quedó abierta a la API';
  end if;
end;
$$;
