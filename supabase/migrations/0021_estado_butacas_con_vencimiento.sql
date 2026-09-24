-- 0021 — estado_butacas devuelve cuándo vence cada reserva propia
-- (RF-25, D-08)
--
-- Sin esto, al recargar la página la pantalla de compra sabe qué butacas son suyas pero no
-- cuánto tiempo les queda, y el temporizador tendría que inventarlo. El vencimiento solo se
-- devuelve para las reservas de la sesión que pregunta: el de las ajenas no le sirve a nadie
-- y no se expone.
--
-- Cambia el tipo de retorno, y Postgres no permite eso con `create or replace`: se borra y se
-- vuelve a crear, con sus permisos.

drop function public.estado_butacas(uuid, text);

create function public.estado_butacas(p_funcion uuid, p_sesion text)
returns table (butaca_id uuid, estado text, expira_at timestamptz)
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
    select bo.butaca_id, 'ocupada'::text, null::timestamptz
      from public.butacas_ordenes bo
     where bo.funcion_id = p_funcion
    union all
    select h.butaca_id,
           case when h.sesion_id = p_sesion then 'propia' else 'retenida' end,
           case when h.sesion_id = p_sesion then h.expira_at end
      from public.holds_butacas h
     where h.funcion_id = p_funcion;
end;
$$;

revoke all on function public.estado_butacas(uuid, text) from public, anon, authenticated;
grant execute on function public.estado_butacas(uuid, text) to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.estado_butacas(uuid, text)', 'execute') then
    raise exception '0021: la compra anónima no puede consultar el mapa';
  end if;
end;
$$;
