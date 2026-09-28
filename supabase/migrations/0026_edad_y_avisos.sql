-- 0026 — Cambios de la revisión del 28/09: restricción de edad con acompañante y aviso del
-- cupón por edad (RN-04 y D-02 revisados, RF-44, RN-09)
--
-- Dos reglas cambian respecto del documento v1.1:
--
--   · RN-04: un menor ya no queda afuera de una película +13 o +18. Puede comprar si va con un
--     adulto, y eso se exige como mínimo 2 entradas en la misma compra (la suya y la del adulto).
--     La leyenda de adulto acompañante sigue en toda entrada con restricción (RF-29).
--   · D-02: en la compra anónima ya no se declara la fecha de nacimiento con un calendario. Se
--     firma una casilla ("tengo 13/18 años o más"); quien no puede firmarla, firma la segunda
--     ("voy acompañado por un adulto") y cae en la misma regla de las 2 entradas.
--
-- Además, mis_saldos() avisa del cupón por edad (RF-44) a quien lo puede usar: la tabla de
-- cupones no se lee desde la API, así que la cuenta no tenía cómo enterarse de que existe.
--
-- Códigos de error (SQLSTATE), con mensaje en español para mostrarse tal cual:
--   22023  el parámetro no es válido (sesión, mail, declaración de edad)
--   P0002  la función no existe
--   55000  el estado no admite la operación (función comenzada, sin butacas)

-- ── Constancia de la declaración (D-02) ─────────────────────────────────────
-- `fecha_nacimiento_declarada` se queda: la usan las órdenes anteriores a este cambio.
alter table public.ordenes
  add column declara_edad boolean,
  add column con_acompanante boolean not null default false;

comment on column public.ordenes.declara_edad is
  'D-02: en una compra anónima de una película con restricción, si firmó tener la edad.';
comment on column public.ordenes.con_acompanante is
  'RN-04: el comprador no tiene la edad de la película y va con un adulto (mínimo 2 entradas).';

-- ── Orden pendiente con la regla nueva ──────────────────────────────────────
-- Se borra la firma vieja en vez de dejarla como sobrecarga: si quedara, alguien podría seguir
-- llamándola desde las DevTools con la regla de antes.
drop function public.crear_orden(uuid, text, text, date);

create or replace function public.crear_orden(
  p_funcion uuid,
  p_sesion text,
  p_email text,
  p_declara_edad boolean default false,
  p_acompanante boolean default false
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
  v_menor boolean := false;
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
    raise exception 'Ingresá un email válido: queda como dato de contacto de tu compra.'
      using errcode = '22023';
  end if;

  -- La cantidad se cuenta antes que la edad: la regla del acompañante depende de ella.
  select count(*), min(h.expira_at)
    into v_cantidad, v_expira
    from public.holds_butacas h
   where h.funcion_id = p_funcion and h.sesion_id = p_sesion and h.expira_at > now();
  if v_cantidad = 0 then
    raise exception 'No tenés butacas reservadas: elegí al menos una.' using errcode = '55000';
  end if;

  -- RN-04 revisada. Con cuenta, la edad sale de la fecha registrada y se mide a la fecha de la
  -- función, no a la de hoy. Sin cuenta, de lo que firmó (D-02).
  if f.restriccion_edad > 0 then
    if v_uid is not null then
      select fecha_nacimiento into v_nacimiento from public.perfiles where id = v_uid;
      if v_nacimiento is null then
        raise exception 'Tu cuenta no tiene fecha de nacimiento: no podemos verificar tu edad.'
          using errcode = '22023';
      end if;
      v_dia_funcion := (f.inicio at time zone 'America/Argentina/Buenos_Aires')::date;
      v_edad := extract(year from age(v_dia_funcion, v_nacimiento));
      v_menor := v_edad < f.restriccion_edad;

      if v_menor and v_cantidad < 2 then
        raise exception 'Como sos menor de % años, tenés que ir con un adulto: elegí al menos 2 entradas.',
          f.restriccion_edad using errcode = '22023';
      end if;
    else
      if not coalesce(p_declara_edad, false) and not coalesce(p_acompanante, false) then
        raise exception 'Esta película es para mayores de % años: declará tu edad o indicá que vas con un adulto.',
          f.restriccion_edad using errcode = '22023';
      end if;
      v_menor := not coalesce(p_declara_edad, false);

      if v_menor and v_cantidad < 2 then
        raise exception 'Si vas con un adulto, elegí al menos 2 entradas: la tuya y la de quien te acompaña.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  -- Una sola orden pendiente por sesión y función: si vuelve atrás y confirma de nuevo
  -- se reemplaza la anterior en vez de acumular órdenes fantasma.
  delete from public.ordenes
   where sesion_id = p_sesion and funcion_id = p_funcion and estado = 'pendiente';

  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));

  insert into public.ordenes (
    perfil_id, email_contacto, funcion_id, estado, declara_edad, con_acompanante,
    codigo, expira_at, sesion_id
  )
  values (
    v_uid, v_email, p_funcion, 'pendiente',
    case when v_uid is null and f.restriccion_edad > 0 then coalesce(p_declara_edad, false) end,
    v_menor,
    v_codigo, v_expira, p_sesion
  )
  returning id into v_orden;

  insert into public.orden_items (orden_id, tipo, butaca_id, cantidad, precio_unitario)
  select v_orden, 'entrada', h.butaca_id, 1, public.precio_de_entrada(p_funcion, b.tipo)
    from public.holds_butacas h
    join public.butacas b on b.id = h.butaca_id
   where h.funcion_id = p_funcion and h.sesion_id = p_sesion and h.expira_at > now();

  select sum(precio_unitario) into v_subtotal from public.orden_items where orden_id = v_orden;

  -- El cupón, el crédito y el canje los aplica configurar_orden (0022) sobre este subtotal.
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
    'con_acompanante', v_menor,
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

-- ── Saldos, ahora con el cupón por edad (RF-44, RN-09) ──────────────────────
-- Reemplaza a la de 0022. El cupón por edad se ofrece con la misma cuenta que usa
-- calcular_orden para aceptarlo: edad cumplida hoy, en la hora del cine. Si hay más de uno
-- vigente, el de mayor valor.
create or replace function public.mis_saldos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_nacimiento date;
  v_edad int;
  v_bienvenida jsonb;
  v_por_edad jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('puntos', 0, 'credito', 0, 'bienvenida', null, 'cupon_edad', null);
  end if;

  select jsonb_build_object('codigo', c.codigo, 'tipo_descuento', c.tipo_descuento, 'valor', c.valor)
    into v_bienvenida
    from public.cupones c
   where c.tipo = 'bienvenida' and c.activo
     and (c.vigente_desde is null or v_hoy >= c.vigente_desde)
     and (c.vigente_hasta is null or v_hoy <= c.vigente_hasta)
     and not exists (select 1 from public.ordenes where perfil_id = v_uid and estado = 'pagada')
   order by c.creado_at desc
   limit 1;

  select fecha_nacimiento into v_nacimiento from public.perfiles where id = v_uid;
  if v_nacimiento is not null then
    v_edad := extract(year from age(v_hoy, v_nacimiento));

    select jsonb_build_object('codigo', c.codigo, 'tipo_descuento', c.tipo_descuento,
                              'valor', c.valor, 'edad_minima', c.edad_minima)
      into v_por_edad
      from public.cupones c
     where c.tipo = 'por_edad' and c.activo
       and c.edad_minima is not null and v_edad >= c.edad_minima
       and (c.vigente_desde is null or v_hoy >= c.vigente_desde)
       and (c.vigente_hasta is null or v_hoy <= c.vigente_hasta)
     order by c.valor desc, c.creado_at desc
     limit 1;
  end if;

  return jsonb_build_object(
    'puntos', public.saldo_puntos(v_uid),
    'credito', public.saldo_credito(v_uid),
    'bienvenida', v_bienvenida,
    'cupon_edad', v_por_edad
  );
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on function public.crear_orden(uuid, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.crear_orden(uuid, text, text, boolean, boolean) to anon, authenticated;
-- create or replace conserva los permisos de mis_saldos (solo authenticated, 0022).

-- Verificación: si algo quedó mal, falla la migración y no la primera compra.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'crear_orden'
       and pg_get_function_identity_arguments(p.oid) <> 'p_funcion uuid, p_sesion text, p_email text, p_declara_edad boolean, p_acompanante boolean'
  ) then
    raise exception '0026: quedó otra versión de crear_orden';
  end if;

  if not has_function_privilege('anon', 'public.crear_orden(uuid, text, text, boolean, boolean)', 'execute') then
    raise exception '0026: la compra anónima no puede crear la orden';
  end if;

  if has_function_privilege('anon', 'public.mis_saldos()', 'execute') then
    raise exception '0026: mis_saldos quedó abierta a anon';
  end if;
end;
$$;
