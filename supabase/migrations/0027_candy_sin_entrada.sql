-- 0027 — Compra de candy sin entrada, con ticket y QR (RF-34.1, RF-35 · revisión R1 del 28/09)
--
-- Hasta acá toda orden pertenecía a una función: el candy solo se compraba junto con la entrada
-- (RF-34 en la v1.1). La revisión pidió poder comprarlo solo y retirarlo con un QR, igual que la
-- entrada. Esta migración no crea un circuito paralelo: la orden de candy es una orden más, sin
-- función, que se arma y se paga con las mismas funciones de siempre.
--
--   · crear_orden_candy() abre la orden pendiente. Es lo único nuevo del lado de la compra.
--   · configurar_orden() y confirmar_pago() (0022) se reusan tal cual: calcular_orden sigue
--     siendo el único lugar que decide un monto, con cupón, crédito, canje y puntos (D-06).
--   · Dos invariantes nuevas, con triggers: una orden sin función no lleva entradas, y ninguna
--     orden se paga vacía.
--   · El ticket vale 7 días desde el pago y no se cancela (decisión del 28/09): sin función no
--     hay "2 horas antes" que medir, y el candy no ocupa nada que haya que liberar.
--   · obtener_orden, consultar_orden_personal, validar_tramo y mis_ordenes pasan a LEFT JOIN y
--     devuelven `tipo` ('funcion' | 'candy'), para que el cliente no tenga que adivinarlo por
--     los nulos.
--
-- Los reportes no cambian: la facturación suma por fecha de pago sin mirar funciones, el candy
-- más vendido cuenta ítems, y las películas más vendidas y Mis Películas parten de funciones con
-- INNER JOIN, así que una orden de candy no las toca.
--
-- Códigos de error (SQLSTATE), con mensaje en español para mostrarse tal cual:
--   22023  el parámetro no es válido (sesión, mail, entrada en una orden de candy)
--   55000  el estado no admite la operación (pagar una orden vacía)

-- ── La orden puede no tener función ─────────────────────────────────────────
alter table public.ordenes alter column funcion_id drop not null;

comment on column public.ordenes.funcion_id is
  'La función de la entrada. Null en una compra solo de candy (RF-34.1).';

-- Cuánto vale un ticket de candy desde que se paga. En configuracion para que el admin lo vea
-- junto a los demás topes; la validación lo lee de acá.
insert into public.configuracion (clave, valor) values ('dias_ticket_candy', 7)
on conflict (clave) do nothing;

-- Una orden sin función no puede llevar entradas: no habría a qué función asignar la butaca.
-- Es un trigger porque un CHECK no puede mirar otra tabla.
create or replace function public.controlar_items_de_candy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'entrada'
     and exists (select 1 from public.ordenes where id = new.orden_id and funcion_id is null) then
    raise exception 'Una compra del candy bar no lleva entradas.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger orden_items_candy_sin_entradas
  before insert or update of tipo, orden_id on public.orden_items
  for each row execute function public.controlar_items_de_candy();

-- Ninguna orden se paga vacía. Con entrada no podía pasar (crear_orden exige una butaca), pero
-- una orden de candy nace sin ítems y, sin esto, confirmar_pago cobraría $0 por nada.
create or replace function public.controlar_orden_con_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'pagada' and old.estado <> 'pagada'
     and not exists (select 1 from public.orden_items where orden_id = new.id) then
    raise exception 'Elegí al menos un producto.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger ordenes_pagada_con_items
  before update of estado on public.ordenes
  for each row execute function public.controlar_orden_con_items();

-- ── Orden pendiente de candy ────────────────────────────────────────────────
-- Misma identificación que la compra de entradas: la sesión del navegador y, si hay, la cuenta.
-- No hay butacas que reservar, así que la ventana de 10 minutos es la de la orden.
create or replace function public.crear_orden_candy(p_sesion text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(trim(coalesce(p_email, '')));
  v_orden uuid;
  v_codigo text;
  v_expira timestamptz := now() + interval '10 minutes';
begin
  if p_sesion is null or length(p_sesion) < 16 then
    raise exception 'La sesión de compra no es válida.' using errcode = '22023';
  end if;

  if v_uid is not null and v_email = '' then
    select lower(email) into v_email from public.perfiles where id = v_uid;
  end if;
  if position('@' in v_email) <= 1 then
    raise exception 'Ingresá un email válido: queda como dato de contacto de tu compra.'
      using errcode = '22023';
  end if;

  -- limpiar_vencidos (0020) barre por función y a estas no las ve: se barren acá.
  update public.ordenes
     set estado = 'expirada'
   where funcion_id is null and estado = 'pendiente' and expira_at <= now();

  -- Una sola orden de candy pendiente por sesión, igual que con las entradas.
  delete from public.ordenes
   where sesion_id = p_sesion and funcion_id is null and estado = 'pendiente';

  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));

  insert into public.ordenes (perfil_id, email_contacto, funcion_id, estado, codigo, expira_at, sesion_id)
  values (v_uid, v_email, null, 'pendiente', v_codigo, v_expira, p_sesion)
  returning id into v_orden;

  return jsonb_build_object('orden_id', v_orden, 'codigo', v_codigo, 'expira_at', v_expira);
end;
$$;

-- ── Cancelación: el candy no se cancela ─────────────────────────────────────
-- Reemplaza a la de 0022 con la misma firma, así cancelar_orden y mis_ordenes la toman sin
-- cambios. Sin función, `p_inicio` es null: antes la cuenta de las 2 horas daba null y la
-- orden habría quedado cancelable.
create or replace function public.motivo_no_cancelable(
  p_estado public.estado_orden,
  p_inicio timestamptz,
  p_entrada timestamptz,
  p_candy timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_estado = 'cancelada' then 'La compra ya fue cancelada.'
    when p_estado <> 'pagada' then 'Solo se pueden cancelar compras pagadas.'
    when p_inicio is null then 'Las compras del candy bar no se cancelan.'
    when p_entrada is not null then 'La entrada ya fue usada para ingresar a la sala.'
    when p_candy is not null then 'Ya retiraste los productos del candy.'
    when p_inicio - now() < interval '2 hours' then 'Solo se puede cancelar hasta 2 horas antes de la función.'
  end;
$$;

-- ── Ventana de validación de una orden ──────────────────────────────────────
-- Con función, la de 0023 (desde una hora antes hasta el fin de la película). Sin función, los
-- días de vigencia del ticket desde el pago.
create or replace function public.ventana_de_orden(p_orden uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  o record;
  v_dias int;
  v_hasta timestamptz;
begin
  select id, funcion_id, pagada_at into o from public.ordenes where id = p_orden;

  if o.funcion_id is not null then
    return public.ventana_de_validacion(o.funcion_id);
  end if;

  select valor::int into v_dias from public.configuracion where clave = 'dias_ticket_candy';
  v_hasta := o.pagada_at + make_interval(days => coalesce(v_dias, 7));

  return jsonb_build_object(
    'desde', o.pagada_at,
    'hasta', v_hasta,
    'estado', case when o.pagada_at is null or now() < v_hasta then 'abierta' else 'terminada' end
  );
end;
$$;

-- ── Mi entrada o mi ticket (RF-27, RF-35, RF-34.1) ──────────────────────────
-- Reemplaza a la de 0022: LEFT JOIN a la función, `tipo`, `valido_hasta` para el ticket de candy
-- y `con_acompanante` (0026) para que la puerta sepa que ese menor viene con un adulto.
create or replace function public.obtener_orden(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
           'codigo', o.codigo,
           'tipo', case when o.funcion_id is null then 'candy' else 'funcion' end,
           'estado', o.estado,
           'email', o.email_contacto,
           'subtotal', o.subtotal,
           'descuento_cupon', o.descuento_cupon,
           'credito_aplicado', o.credito_aplicado,
           'total', o.total,
           'pagada_at', o.pagada_at,
           'cancelada_at', o.cancelada_at,
           'valido_hasta', case when o.funcion_id is null then public.ventana_de_orden(o.id) -> 'hasta' end,
           'entrada_validada_at', o.entrada_validada_at,
           'candy_entregado_at', o.candy_entregado_at,
           'pelicula', p.titulo,
           'restriccion_edad', coalesce(p.restriccion_edad, 0),
           'requiere_acompanante', coalesce(p.restriccion_edad, 0) > 0,
           'con_acompanante', o.con_acompanante,
           'inicio', f.inicio,
           'formato', f.formato,
           'idioma', f.idioma,
           'sala', s.nombre,
           'butacas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'fila', b.fila, 'numero', b.numero, 'tipo', b.tipo,
                      'precio', oi.precio_unitario
                    ) order by b.fila, b.numero)
               from public.orden_items oi join public.butacas b on b.id = oi.butaca_id
              where oi.orden_id = o.id and oi.tipo = 'entrada'
           ), '[]'::jsonb),
           'tiene_candy', exists (
             select 1 from public.orden_items where orden_id = o.id and tipo in ('producto', 'combo')
           ),
           -- Lo que se retira con este QR (RF-35). Un combo lista lo que trae.
           'candy', coalesce((
             select jsonb_agg(n.item order by n.nombre)
               from (
                 select pr.nombre,
                        jsonb_build_object('nombre', pr.nombre, 'cantidad', oi.cantidad,
                                           'por_canje', oi.por_canje, 'incluye', '[]'::jsonb) as item
                   from public.orden_items oi join public.productos pr on pr.id = oi.producto_id
                  where oi.orden_id = o.id and oi.tipo = 'producto'
                 union all
                 select c.nombre,
                        jsonb_build_object('nombre', c.nombre, 'cantidad', oi.cantidad,
                                           'por_canje', false,
                                           'incluye', coalesce((
                                             select jsonb_agg(jsonb_build_object(
                                                      'nombre', p2.nombre, 'cantidad', ci.cantidad * oi.cantidad
                                                    ) order by p2.nombre)
                                               from public.combo_items ci
                                               join public.productos p2 on p2.id = ci.producto_id
                                              where ci.combo_id = c.id
                                           ), '[]'::jsonb))
                   from public.orden_items oi join public.combos c on c.id = oi.combo_id
                  where oi.orden_id = o.id and oi.tipo = 'combo'
               ) n
           ), '[]'::jsonb)
         )
    into v
    from public.ordenes o
    left join public.funciones f on f.id = o.funcion_id
    left join public.peliculas p on p.id = f.pelicula_id
    left join public.salas s on s.id = f.sala_id
   where o.codigo = upper(trim(p_codigo));

  if v is null then
    raise exception 'No encontramos esa entrada.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- ── Lo que ve el empleado al escanear ───────────────────────────────────────
-- Reemplaza a la de 0023: una orden de candy no tiene tramo de entrada, y su ventana es la del
-- ticket.
create or replace function public.consultar_orden_personal(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o record;
  v jsonb;
  v_tiene_candy boolean;
begin
  if not public.es_personal() then
    raise exception 'Solo el personal del cine puede validar entradas.' using errcode = '42501';
  end if;

  -- Lanza P0002 si el código no existe: una consulta no deja rastro que haya que conservar.
  v := public.obtener_orden(p_codigo) - 'email';
  v_tiene_candy := (v ->> 'tiene_candy')::boolean;

  select * into o from public.ordenes where codigo = upper(trim(p_codigo));

  return v || jsonb_build_object(
    'tramos', jsonb_build_object(
      'entrada', case when o.funcion_id is not null then jsonb_build_object(
        'usado_at', o.entrada_validada_at,
        'usado_por', public.nombre_corto(o.entrada_validada_por)
      ) end,
      'candy', case when v_tiene_candy then jsonb_build_object(
        'usado_at', o.candy_entregado_at,
        'usado_por', public.nombre_corto(o.candy_entregado_por)
      ) end
    ),
    'ventana', public.ventana_de_orden(o.id)
  );
end;
$$;

-- ── Consumir un tramo ───────────────────────────────────────────────────────
-- Reemplaza a la de 0023. Cambian dos cosas: el tramo de entrada en una orden de candy se
-- rechaza con `sin_entrada` (mismo criterio que `sin_candy`), y la ventana sale de
-- ventana_de_orden, que para el candy son los días de vigencia del ticket.
create or replace function public.validar_tramo(p_codigo text, p_tramo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  o record;
  v_pelicula text;
  v_ventana jsonb;
  v_usado_at timestamptz;
  v_usado_por uuid;
  v_motivo text;
  v_mensaje text;
  v_extra jsonb := '{}'::jsonb;
  v_ahora timestamptz := now();
begin
  if not public.es_personal() then
    raise exception 'Solo el personal del cine puede validar entradas.' using errcode = '42501';
  end if;
  if p_tramo is null or p_tramo not in ('entrada', 'candy') then
    raise exception 'El tramo tiene que ser entrada o candy.' using errcode = '22023';
  end if;

  -- FOR UPDATE: dos empleados que escanean la misma orden a la vez se serializan, y el segundo
  -- ve la marca que puso el primero (ya_usado).
  select * into o from public.ordenes where codigo = upper(trim(p_codigo)) for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe',
                              'mensaje', 'No existe ninguna entrada con ese código.');
  end if;

  select p.titulo into v_pelicula
    from public.funciones f join public.peliculas p on p.id = f.pelicula_id
   where f.id = o.funcion_id;

  if p_tramo = 'entrada' then
    v_usado_at := o.entrada_validada_at;
    v_usado_por := o.entrada_validada_por;
  else
    v_usado_at := o.candy_entregado_at;
    v_usado_por := o.candy_entregado_por;
  end if;

  -- El orden de los chequeos es el de la pregunta que se hace el empleado: ¿es una compra
  -- válida?, ¿tiene este tramo?, ¿es el momento?, ¿ya se usó?
  if o.estado <> 'pagada' then
    v_motivo := 'estado';
    v_mensaje := case o.estado
                   when 'cancelada' then 'Esta compra fue cancelada: la entrada ya no vale.'
                   when 'pendiente' then 'Esta compra no se terminó de pagar.'
                   else 'Esta compra venció sin pagarse.'
                 end;
    v_extra := jsonb_build_object('estado', o.estado);
  elsif p_tramo = 'entrada' and o.funcion_id is null then
    v_motivo := 'sin_entrada';
    v_mensaje := 'Es un ticket del candy bar: no incluye entrada a ninguna función.';
  elsif p_tramo = 'candy'
        and not exists (select 1 from public.orden_items
                         where orden_id = o.id and tipo in ('producto', 'combo')) then
    v_motivo := 'sin_candy';
    v_mensaje := 'Esta compra no incluye productos del candy bar.';
  else
    v_ventana := public.ventana_de_orden(o.id);
    if v_ventana ->> 'estado' <> 'abierta' then
      v_motivo := 'fuera_de_ventana';
      v_mensaje := case
                     when o.funcion_id is null then 'El ticket del candy venció: servía por 7 días desde la compra.'
                     when v_ventana ->> 'estado' = 'antes' then 'Todavía es temprano: se valida desde una hora antes de la función.'
                     else 'La función ya terminó.'
                   end;
      v_extra := jsonb_build_object('desde', v_ventana -> 'desde', 'hasta', v_ventana -> 'hasta');
    elsif v_usado_at is not null then
      v_motivo := 'ya_usado';
      v_mensaje := case p_tramo
                     when 'entrada' then 'Esta entrada ya se usó para ingresar.'
                     else 'El candy de esta compra ya se entregó.'
                   end;
      v_extra := jsonb_build_object('usado_at', v_usado_at,
                                    'usado_por', public.nombre_corto(v_usado_por));
    end if;
  end if;

  if v_motivo is not null then
    perform public.registrar_actividad(v_uid, 'validacion_rechazada', 'orden', o.id::text,
      jsonb_build_object('codigo', o.codigo, 'tramo', p_tramo, 'motivo', v_motivo,
                         'funcion_id', o.funcion_id, 'pelicula', v_pelicula));
    return jsonb_build_object('ok', false, 'tramo', p_tramo, 'motivo', v_motivo,
                              'mensaje', v_mensaje) || v_extra;
  end if;

  if p_tramo = 'entrada' then
    update public.ordenes
       set entrada_validada_at = v_ahora, entrada_validada_por = v_uid
     where id = o.id;
  else
    update public.ordenes
       set candy_entregado_at = v_ahora, candy_entregado_por = v_uid
     where id = o.id;
  end if;

  perform public.registrar_actividad(v_uid,
    case p_tramo when 'entrada' then 'validar_entrada' else 'entregar_candy' end,
    'orden', o.id::text,
    jsonb_build_object('codigo', o.codigo, 'funcion_id', o.funcion_id, 'pelicula', v_pelicula));

  return jsonb_build_object('ok', true, 'tramo', p_tramo, 'usado_at', v_ahora,
                            'usado_por', public.nombre_corto(v_uid));
end;
$$;

-- ── Mis compras, con las de candy (RF-40) ───────────────────────────────────
-- Reemplaza a la de 0022: LEFT JOIN y `tipo`. Las de candy se ordenan por la fecha de pago.
create or replace function public.mis_ordenes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(t.fila order by t.cuando desc)
      from (
        select coalesce(f.inicio, o.pagada_at) as cuando,
               jsonb_build_object(
                 'orden_id', o.id,
                 'codigo', o.codigo,
                 'tipo', case when o.funcion_id is null then 'candy' else 'funcion' end,
                 'estado', o.estado,
                 'total', o.total,
                 'credito_aplicado', o.credito_aplicado,
                 'pagada_at', o.pagada_at,
                 'cancelada_at', o.cancelada_at,
                 'pelicula', p.titulo,
                 'inicio', f.inicio,
                 'sala', s.nombre,
                 'entradas', (select count(*) from public.orden_items where orden_id = o.id and tipo = 'entrada'),
                 'tiene_candy', exists (
                   select 1 from public.orden_items where orden_id = o.id and tipo in ('producto', 'combo')
                 ),
                 'cancelable', public.motivo_no_cancelable(o.estado, f.inicio, o.entrada_validada_at, o.candy_entregado_at) is null,
                 'motivo_no_cancelable', public.motivo_no_cancelable(o.estado, f.inicio, o.entrada_validada_at, o.candy_entregado_at)
               ) as fila
          from public.ordenes o
          left join public.funciones f on f.id = o.funcion_id
          left join public.peliculas p on p.id = f.pelicula_id
          left join public.salas s on s.id = f.sala_id
         where o.perfil_id = v_uid and o.estado in ('pagada', 'cancelada')
      ) t
  ), '[]'::jsonb);
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
-- create or replace conserva los permisos de las funciones reemplazadas. Las nuevas se cierran.
revoke all on function public.controlar_items_de_candy() from public, anon, authenticated;
revoke all on function public.controlar_orden_con_items() from public, anon, authenticated;
revoke all on function public.ventana_de_orden(uuid) from public, anon, authenticated;
revoke all on function public.crear_orden_candy(text, text) from public, anon, authenticated;

-- La compra de candy es anónima como la de entradas (RF-26).
grant execute on function public.crear_orden_candy(text, text) to anon, authenticated;

-- Verificación: si algo quedó mal, falla la migración y no la primera compra de candy.
do $$
declare
  v_sin_politica text[];
begin
  if not has_function_privilege('anon', 'public.crear_orden_candy(text, text)', 'execute') then
    raise exception '0027: la compra anónima no puede crear la orden de candy';
  end if;
  if has_function_privilege('authenticated', 'public.ventana_de_orden(uuid)', 'execute')
     or has_function_privilege('anon', 'public.validar_tramo(text, text)', 'execute')
     or has_function_privilege('anon', 'public.consultar_orden_personal(text)', 'execute')
     or has_function_privilege('anon', 'public.mis_ordenes()', 'execute') then
    raise exception '0027: una función quedó abierta de más';
  end if;
  if not has_function_privilege('anon', 'public.obtener_orden(text)', 'execute') then
    raise exception '0027: la entrada anónima dejó de poder verse';
  end if;

  select array_agg(c.relname::text order by c.relname) into v_sin_politica
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);

  if v_sin_politica is distinct from array['butacas_ordenes', 'holds_butacas',
                                           'orden_items', 'ordenes']::text[] then
    raise exception '0027: las tablas sin política no son las esperadas: %', v_sin_politica;
  end if;
end;
$$;
