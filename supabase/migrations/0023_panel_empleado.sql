-- 0023 — Panel de empleado: validación del QR por tramos
-- (RF-51 a RF-55, RN-05, RN-12, RF-61, D-02, D-03)
--
-- Un QR por orden con dos consumos independientes (D-03): el ingreso a la sala y el retiro del
-- candy. Cada tramo se consume una sola vez, y el segundo intento se rechaza diciendo cuándo y
-- por quién se usó (RN-05). Las marcas ya existen desde 0008 (`entrada_validada_at/_por`,
-- `candy_entregado_at/_por`); acá se agrega la única forma de ponerlas.
--
-- Igual que en la compra, ninguna tabla se abre: dos funciones SECURITY DEFINER que verifican
-- el rol por su cuenta con es_personal() (empleado o admin). El guard de /empleado es una ayuda
-- de interfaz (RNF-09); esto es lo que impide que un cliente se valide su propia entrada.

-- ── Nombre corto del personal ───────────────────────────────────────────────
-- "Ana G.": alcanza para saber a quién preguntar en la puerta, y es lo mismo que muestran las
-- reseñas. Nunca sale nada de perfiles_sensibles (RNF-11).
create or replace function public.nombre_corto(p_perfil uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select trim(p.nombre || ' ' || coalesce(left(p.apellido, 1) || '.', ''))
    from public.perfiles p
   where p.id = p_perfil;
$$;

-- ── Ventana de validación ───────────────────────────────────────────────────
-- Desde una hora antes del inicio hasta que termina la película. El fin es inicio + duración,
-- no el extremo de `funciones.rango`: esos 30 minutos extra son la limpieza de la sala (RN-01),
-- y ahí ya no entra nadie. Con esto una entrada de mañana, o de una función que ya terminó, se
-- rechaza con un motivo claro en lugar de consumirse.
create or replace function public.ventana_de_validacion(p_funcion uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'desde', f.inicio - interval '1 hour',
           'hasta', f.inicio + make_interval(mins => p.duracion_minutos),
           'estado', case
                       when now() < f.inicio - interval '1 hour' then 'antes'
                       when now() >= f.inicio + make_interval(mins => p.duracion_minutos) then 'terminada'
                       else 'abierta'
                     end
         )
    from public.funciones f
    join public.peliculas p on p.id = f.pelicula_id
   where f.id = p_funcion;
$$;

-- ── Lo que ve el empleado al escanear (sin consumir nada) ───────────────────
-- Reutiliza obtener_orden (0022), que es lo mismo que ve el cliente en su entrada, menos el
-- mail: al personal no le sirve para nada y lo que no se muestra no se filtra. Le suma el estado
-- de cada tramo con el nombre de quien lo usó, que el empleado no podría leer por su cuenta
-- (perfiles solo se lee por su titular y el admin).
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
      'entrada', jsonb_build_object(
        'usado_at', o.entrada_validada_at,
        'usado_por', public.nombre_corto(o.entrada_validada_por)
      ),
      -- Una orden sin candy no tiene tramo de candy que consumir (D-03).
      'candy', case when v_tiene_candy then jsonb_build_object(
        'usado_at', o.candy_entregado_at,
        'usado_por', public.nombre_corto(o.candy_entregado_por)
      ) end
    ),
    'ventana', public.ventana_de_validacion(o.funcion_id)
  );
end;
$$;

-- ── Consumir un tramo (RF-51, RF-52, RF-54, RF-55, RN-05) ───────────────────
-- Los casos previstos se DEVUELVEN como {ok:false, motivo}, no se lanzan: un raise desharía el
-- registro del intento rechazado en el log, y un intento de reuso es justo lo que la auditoría
-- quiere ver (RN-12). Es el mismo criterio que confirmar_pago con la reserva vencida (0020).
-- Solo se lanza ante lo que no es un caso de negocio: sin permiso o un tramo inexistente.
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
  -- ve la marca que puso el primero (ya_usado). cancelar_orden bloquea la misma fila primero,
  -- así que una validación y una cancelación simultáneas tampoco se cruzan.
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
  elsif p_tramo = 'candy'
        and not exists (select 1 from public.orden_items
                         where orden_id = o.id and tipo in ('producto', 'combo')) then
    v_motivo := 'sin_candy';
    v_mensaje := 'Esta compra no incluye productos del candy bar.';
  else
    v_ventana := public.ventana_de_validacion(o.funcion_id);
    if v_ventana ->> 'estado' <> 'abierta' then
      v_motivo := 'fuera_de_ventana';
      v_mensaje := case v_ventana ->> 'estado'
                     when 'antes' then 'Todavía es temprano: se valida desde una hora antes de la función.'
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

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on function public.nombre_corto(uuid) from public, anon, authenticated;
revoke all on function public.ventana_de_validacion(uuid) from public, anon, authenticated;
revoke all on function public.consultar_orden_personal(text) from public, anon, authenticated;
revoke all on function public.validar_tramo(text, text) from public, anon, authenticated;

-- Solo cuentas: el rol lo verifica cada función adentro. A `anon` ni se le otorga, así que el
-- rechazo llega antes de ejecutar una línea.
grant execute on function public.consultar_orden_personal(text) to authenticated;
grant execute on function public.validar_tramo(text, text) to authenticated;

-- Verificación: si algo quedó mal, falla la migración y no la primera validación en la puerta.
do $$
begin
  if has_function_privilege('anon', 'public.validar_tramo(text, text)', 'execute')
     or has_function_privilege('anon', 'public.consultar_orden_personal(text)', 'execute') then
    raise exception '0023: la validación quedó expuesta a la API anónima';
  end if;
  if not has_function_privilege('authenticated', 'public.validar_tramo(text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.consultar_orden_personal(text)', 'execute') then
    raise exception '0023: el personal no puede ejecutar la validación';
  end if;
  if has_function_privilege('authenticated', 'public.nombre_corto(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ventana_de_validacion(uuid)', 'execute') then
    raise exception '0023: una función interna quedó expuesta a la API';
  end if;
  if has_table_privilege('authenticated', 'public.ordenes', 'update')
     or has_table_privilege('authenticated', 'public.ordenes', 'select') then
    raise exception '0023: la tabla de órdenes quedó abierta a la API';
  end if;
end;
$$;
