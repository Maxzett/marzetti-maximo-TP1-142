-- 0022 — Candy bar, combos, cupones, puntos, crédito y cancelación
-- (RF-30 a RF-37, RF-39, RF-40, RF-43 a RF-48, RN-06 a RN-09, D-06)
--
-- Mismo criterio que la compra (0020): las tablas de venta siguen cerradas y todo lo que
-- toca dinero, puntos o crédito pasa por funciones SECURITY DEFINER que validan por su
-- cuenta. Solo se abren dos cosas con política:
--   · el catálogo del candy y las recompensas, que ve cualquiera (la compra es anónima);
--   · las filas propias del libro mayor de puntos y de crédito, y los canjes.
-- `cupones` y `ordenes` siguen sin política: un cupón no se lista, se canjea por su código.
--
-- Códigos de error (SQLSTATE), redactados en español para mostrarse tal cual:
--   22023  el parámetro no es válido (cupón, recompensa, combos de más, sin cuenta)
--   P0002  la orden no existe (o es de otra persona: para quien pregunta es lo mismo)
--   55000  el estado no admite la operación (sin puntos, ya cancelada, fuera de plazo)
--
-- Por qué acá SÍ se lanza una excepción cuando la selección no es válida: configurar_orden
-- reescribe los ítems del candy antes de calcular, y la excepción deshace esa reescritura.
-- Es lo contrario de confirmar_pago con la reserva vencida (0020), donde el `raise`
-- habría deshecho el UPDATE que se quería conservar.

-- ── Configuración ───────────────────────────────────────────────────────────
insert into public.configuracion (clave, valor) values
  ('max_unidades_por_producto', 20)
on conflict (clave) do nothing;

-- ── Lo que la orden recuerda de la selección ────────────────────────────────
-- Se guardan en la orden para que confirmar_pago recalcule exactamente lo mismo que el
-- usuario vio en pantalla, sin que el cliente vuelva a mandar montos.
alter table public.ordenes
  add column usar_credito boolean not null default false,
  add column recompensa_id uuid references public.recompensas (id) on delete set null;

-- El producto que se lleva por canje no se cobra, pero tiene que distinguirse de uno
-- comprado: si no, la próxima recalculación lo borraría o lo cobraría.
alter table public.orden_items
  add column por_canje boolean not null default false;

-- ── Lectura ─────────────────────────────────────────────────────────────────
-- Igual que en 0017: hacen falta las dos capas, el GRANT y la política.
grant select on public.categorias_productos to anon, authenticated;
grant select on public.productos to anon, authenticated;
grant select on public.combos to anon, authenticated;
grant select on public.combo_items to anon, authenticated;
grant select on public.recompensas to anon, authenticated;

create policy categorias_productos_select_publico on public.categorias_productos
  for select to anon, authenticated
  using (true);

create policy productos_select_activos on public.productos
  for select to anon, authenticated
  using (activo);

create policy combos_select_activos on public.combos
  for select to anon, authenticated
  using (activo);

-- La subconsulta pasa por la política de `combos`: un combo dado de baja no muestra sus ítems.
create policy combo_items_select_de_combos_activos on public.combo_items
  for select to anon, authenticated
  using (exists (select 1 from public.combos c where c.id = combo_id and c.activo));

create policy recompensas_select_activas on public.recompensas
  for select to anon, authenticated
  using (activa);

-- El libro mayor y los canjes se leen solo si son propios (RF-40). No hay política de
-- escritura: los movimientos los asientan las funciones de este archivo, nunca la API.
grant select on public.puntos_movimientos to authenticated;
grant select on public.creditos_movimientos to authenticated;
grant select on public.canjes to authenticated;

create policy puntos_movimientos_select_propios on public.puntos_movimientos
  for select to authenticated
  using (perfil_id = (select auth.uid()));

create policy creditos_movimientos_select_propios on public.creditos_movimientos
  for select to authenticated
  using (perfil_id = (select auth.uid()));

create policy canjes_select_propios on public.canjes
  for select to authenticated
  using (perfil_id = (select auth.uid()));

-- ── Funciones internas (sin EXECUTE para la API) ────────────────────────────

-- El saldo es la suma del libro mayor (0009): no hay un contador que se pise.
create or replace function public.saldo_puntos(p_perfil uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(puntos), 0)::int from public.puntos_movimientos where perfil_id = p_perfil;
$$;

create or replace function public.saldo_credito(p_perfil uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(monto), 0) from public.creditos_movimientos where perfil_id = p_perfil;
$$;

-- RN-06 vive en un solo lugar: la usan cancelar_orden (para rechazar) y mis_ordenes (para
-- explicar por qué el botón no está disponible). Null significa que se puede cancelar.
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
    when p_entrada is not null then 'La entrada ya fue usada para ingresar a la sala.'
    when p_candy is not null then 'Ya retiraste los productos del candy.'
    when p_inicio - now() < interval '2 hours' then 'Solo se puede cancelar hasta 2 horas antes de la función.'
  end;
$$;

-- D-06: el precio de la orden, en el orden en que se aplica cada cosa. Es la ÚNICA función
-- que decide un monto: la llaman configurar_orden (lo que se muestra) y confirmar_pago (lo
-- que se cobra), así lo que el usuario vio es lo que paga.
--
--   1. Los canjes y los combos sustituyen el precio base de una entrada. El recargo de la
--      ubicación se sigue cobrando: un combo o un canje cubre la entrada estándar, no el
--      asiento VIP. Se cubren primero las de menor precio; el ahorro es el mismo elija la
--      que elija, así que solo cambia en qué línea se ve el recargo.
--   2. subtotal = entradas + productos + combos (ya con esas sustituciones).
--   3. cupón sobre el subtotal (RN-08, RN-09).
--   4. crédito sobre lo que queda después del cupón (RF-32): así un porcentaje nunca se
--      calcula sobre un monto que el crédito ya cubrió.
--   5. lo que resta va al medio de pago.
create or replace function public.calcular_orden(p_orden uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_cupon record;
  v_recompensa record;
  v_nacimiento date;
  v_entradas int;
  v_cubiertas int;
  v_base numeric;
  v_subtotal numeric;
  v_descuento numeric := 0;
  v_credito numeric := 0;
  v_total numeric;
  v_puntos_canje int := 0;
  v_json_cupon jsonb;
begin
  select * into o from public.ordenes where id = p_orden;

  select count(*) into v_entradas
    from public.orden_items where orden_id = p_orden and tipo = 'entrada';

  -- Cada combo con entrada cubre una butaca por cada entrada que incluye.
  select coalesce(sum(oi.cantidad * ci.cantidad), 0)::int into v_cubiertas
    from public.orden_items oi
    join public.combo_items ci on ci.combo_id = oi.combo_id and ci.incluye_entrada
   where oi.orden_id = p_orden and oi.tipo = 'combo';

  -- RF-46, RF-48: el canje es de la cuenta que lo hace, con sus propios puntos.
  if o.recompensa_id is not null then
    if o.perfil_id is null then
      raise exception 'Para canjear puntos tenés que iniciar sesión.' using errcode = '22023';
    end if;
    select * into v_recompensa from public.recompensas where id = o.recompensa_id and activa;
    if not found then
      raise exception 'Esa recompensa no está disponible.' using errcode = '22023';
    end if;
    if public.saldo_puntos(o.perfil_id) < v_recompensa.costo_puntos then
      raise exception 'No te alcanzan los puntos para ese canje.' using errcode = '55000';
    end if;
    v_puntos_canje := v_recompensa.costo_puntos;
    if v_recompensa.tipo = 'entrada' then
      v_cubiertas := v_cubiertas + 1;
    end if;
  end if;

  if v_cubiertas > v_entradas then
    raise exception 'Tenés más combos con entrada o canjes de entrada que butacas reservadas.'
      using errcode = '22023';
  end if;

  -- Precio de cada entrada: el completo, salvo las cubiertas, que dejan solo el recargo.
  v_base := public.precio_de_entrada(o.funcion_id, 'estandar');
  update public.orden_items oi
     set precio_unitario = t.precio
    from (
      select x.id,
             case when row_number() over (order by x.precio_lleno, x.butaca_id) <= v_cubiertas
                  then x.precio_lleno - v_base
                  else x.precio_lleno
             end as precio
        from (
          select i.id, i.butaca_id, public.precio_de_entrada(o.funcion_id, b.tipo) as precio_lleno
            from public.orden_items i
            join public.butacas b on b.id = i.butaca_id
           where i.orden_id = p_orden and i.tipo = 'entrada'
        ) x
    ) t
   where oi.id = t.id;

  select coalesce(sum(precio_unitario * cantidad), 0) into v_subtotal
    from public.orden_items where orden_id = p_orden;

  if o.cupon_id is not null then
    select * into v_cupon from public.cupones where id = o.cupon_id;

    if not found or not v_cupon.activo
       or (v_cupon.vigente_desde is not null and v_hoy < v_cupon.vigente_desde)
       or (v_cupon.vigente_hasta is not null and v_hoy > v_cupon.vigente_hasta) then
      raise exception 'Ese cupón no está vigente.' using errcode = '22023';
    end if;

    -- RN-08: una sola vez por cuenta y sobre la primera compra. Las canceladas no cuentan:
    -- la compra se deshizo, y el índice único de 0009 solo mira las pagadas.
    if v_cupon.tipo = 'bienvenida' then
      if o.perfil_id is null then
        raise exception 'El cupón de bienvenida es solo para cuentas registradas.' using errcode = '22023';
      end if;
      if exists (
        select 1 from public.ordenes
         where perfil_id = o.perfil_id and estado = 'pagada' and id <> o.id
      ) then
        raise exception 'El cupón de bienvenida es para tu primera compra.' using errcode = '55000';
      end if;
    end if;

    -- RN-09: la edad se mide a la fecha de la compra y exige cuenta.
    if v_cupon.tipo = 'por_edad' or v_cupon.edad_minima is not null then
      if o.perfil_id is null then
        raise exception 'Ese cupón es solo para cuentas registradas.' using errcode = '22023';
      end if;
      select fecha_nacimiento into v_nacimiento from public.perfiles where id = o.perfil_id;
      if v_cupon.edad_minima is not null
         and extract(year from age(v_hoy, v_nacimiento)) < v_cupon.edad_minima then
        raise exception 'Ese cupón es para mayores de % años.', v_cupon.edad_minima
          using errcode = '22023';
      end if;
    end if;

    v_json_cupon := jsonb_build_object(
      'codigo', v_cupon.codigo, 'tipo_descuento', v_cupon.tipo_descuento, 'valor', v_cupon.valor
    );
    v_descuento := case v_cupon.tipo_descuento
      when 'porcentaje' then least(v_subtotal, round(v_subtotal * v_cupon.valor / 100, 2))
      else least(v_subtotal, v_cupon.valor)
    end;
  end if;

  if o.usar_credito then
    if o.perfil_id is null then
      raise exception 'Para usar tu crédito tenés que iniciar sesión.' using errcode = '22023';
    end if;
    v_credito := least(greatest(public.saldo_credito(o.perfil_id), 0), v_subtotal - v_descuento);
  end if;

  v_total := v_subtotal - v_descuento - v_credito;

  update public.ordenes
     set subtotal = v_subtotal, descuento_cupon = v_descuento,
         credito_aplicado = v_credito, total = v_total
   where id = p_orden;

  return jsonb_build_object(
    'subtotal', v_subtotal,
    'descuento_cupon', v_descuento,
    'credito_aplicado', v_credito,
    'total', v_total,
    -- RN-07: 1 punto por peso efectivamente pagado, y solo con cuenta.
    'puntos_a_ganar', case when o.perfil_id is not null then floor(v_total)::int else 0 end,
    'puntos_canje', v_puntos_canje,
    'cupon', v_json_cupon,
    'tiene_vip', exists (
      select 1 from public.orden_items i join public.butacas b on b.id = i.butaca_id
       where i.orden_id = p_orden and b.tipo = 'vip'
    ),
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'butaca_id', b.id, 'fila', b.fila, 'numero', b.numero,
               'tipo', b.tipo, 'precio', i.precio_unitario
             ) order by b.fila, b.numero)
        from public.orden_items i join public.butacas b on b.id = i.butaca_id
       where i.orden_id = p_orden and i.tipo = 'entrada'
    ), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'producto_id', p.id, 'nombre', p.nombre, 'cantidad', i.cantidad,
               'precio_unitario', i.precio_unitario, 'por_canje', i.por_canje
             ) order by p.nombre)
        from public.orden_items i join public.productos p on p.id = i.producto_id
       where i.orden_id = p_orden and i.tipo = 'producto'
    ), '[]'::jsonb),
    'combos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'combo_id', c.id, 'nombre', c.nombre, 'cantidad', i.cantidad,
               'precio_unitario', i.precio_unitario
             ) order by c.nombre)
        from public.orden_items i join public.combos c on c.id = i.combo_id
       where i.orden_id = p_orden and i.tipo = 'combo'
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Configurar la orden pendiente (RF-34, RF-36, RF-37, RF-43 a RF-47) ───────
-- p_productos: [{"id": uuid, "cantidad": n}]   p_combos: [{"id": uuid, "cantidad": n}]
-- Reemplaza la selección entera cada vez, así que es idempotente: el cliente manda lo que
-- hay en pantalla y recibe el desglose que corresponde.
create or replace function public.configurar_orden(
  p_orden uuid,
  p_sesion text,
  p_productos jsonb,
  p_combos jsonb,
  p_cupon text,
  p_usar_credito boolean,
  p_recompensa uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_max int;
  v_pedidos int;
  v_validos int;
  v_cupon uuid;
  v_recompensa record;
  v_desglose jsonb;
begin
  select * into o from public.ordenes
   where id = p_orden and sesion_id = p_sesion
     for update;
  if not found then
    raise exception 'La orden no existe.' using errcode = 'P0002';
  end if;
  if o.estado <> 'pendiente' then
    raise exception 'La orden ya no se puede modificar.' using errcode = '55000';
  end if;
  if o.expira_at <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'vencida',
      'mensaje', 'La reserva venció. Elegí las butacas de nuevo.');
  end if;

  select valor::int into v_max from public.configuracion where clave = 'max_unidades_por_producto';

  delete from public.orden_items where orden_id = p_orden and tipo in ('producto', 'combo');

  -- Se agrupa por id: mandar dos veces el mismo producto suma, no duplica la fila.
  select count(*), coalesce(max(t.cantidad), 0) into v_pedidos, v_validos
    from (
      select x.id, sum(x.cantidad) as cantidad
        from jsonb_to_recordset(coalesce(p_productos, '[]'::jsonb)) as x(id uuid, cantidad int)
       group by x.id
    ) t;
  if v_validos > v_max or exists (
    select 1 from jsonb_to_recordset(coalesce(p_productos, '[]'::jsonb)) as x(id uuid, cantidad int)
     where x.cantidad is null or x.cantidad < 1
  ) then
    raise exception 'La cantidad de cada producto tiene que estar entre 1 y %.', v_max
      using errcode = '22023';
  end if;

  insert into public.orden_items (orden_id, tipo, producto_id, cantidad, precio_unitario)
  select p_orden, 'producto', p.id, t.cantidad, p.precio
    from (
      select x.id, sum(x.cantidad)::int as cantidad
        from jsonb_to_recordset(coalesce(p_productos, '[]'::jsonb)) as x(id uuid, cantidad int)
       group by x.id
    ) t
    join public.productos p on p.id = t.id and p.activo;
  get diagnostics v_validos = row_count;
  if v_validos <> v_pedidos then
    raise exception 'Alguno de los productos ya no está disponible.' using errcode = '22023';
  end if;

  select count(*) into v_pedidos
    from (
      select x.id from jsonb_to_recordset(coalesce(p_combos, '[]'::jsonb)) as x(id uuid, cantidad int)
       group by x.id
    ) t;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_combos, '[]'::jsonb)) as x(id uuid, cantidad int)
     where x.cantidad is null or x.cantidad < 1 or x.cantidad > v_max
  ) then
    raise exception 'La cantidad de cada combo tiene que estar entre 1 y %.', v_max
      using errcode = '22023';
  end if;

  insert into public.orden_items (orden_id, tipo, combo_id, cantidad, precio_unitario)
  select p_orden, 'combo', c.id, t.cantidad, c.precio
    from (
      select x.id, sum(x.cantidad)::int as cantidad
        from jsonb_to_recordset(coalesce(p_combos, '[]'::jsonb)) as x(id uuid, cantidad int)
       group by x.id
    ) t
    join public.combos c on c.id = t.id and c.activo;
  get diagnostics v_validos = row_count;
  if v_validos <> v_pedidos then
    raise exception 'Alguno de los combos ya no está disponible.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_cupon, '')), '') is not null then
    select id into v_cupon from public.cupones where codigo = upper(trim(p_cupon));
    if v_cupon is null then
      raise exception 'Ese cupón no existe.' using errcode = '22023';
    end if;
  end if;

  -- Un canje de producto agrega ese producto a la orden, sin costo.
  if p_recompensa is not null then
    select * into v_recompensa from public.recompensas where id = p_recompensa and activa;
    if not found then
      raise exception 'Esa recompensa no está disponible.' using errcode = '22023';
    end if;
    if v_recompensa.tipo = 'producto' then
      if v_recompensa.producto_id is null then
        raise exception 'Esa recompensa no está disponible.' using errcode = '22023';
      end if;
      insert into public.orden_items (orden_id, tipo, producto_id, cantidad, precio_unitario, por_canje)
      values (p_orden, 'producto', v_recompensa.producto_id, 1, 0, true);
    end if;
  end if;

  update public.ordenes
     set cupon_id = v_cupon,
         usar_credito = coalesce(p_usar_credito, false),
         recompensa_id = p_recompensa
   where id = p_orden;

  v_desglose := public.calcular_orden(p_orden);

  return v_desglose || jsonb_build_object('ok', true, 'orden_id', p_orden, 'expira_at', o.expira_at);
end;
$$;

-- ── Pago simulado, ahora con todo el modelo de precios (D-06, D-07) ─────────
-- Reemplaza a la de 0020. Sigue siendo el único punto donde ocurre el cobro, y ahora
-- además asienta en la misma transacción todo lo que el pago provoca: el crédito gastado
-- (RF-32), los puntos ganados (RN-07) y el canje (RF-46). O queda todo, o no queda nada.
create or replace function public.confirmar_pago(p_orden uuid, p_sesion text, p_medio text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  d jsonb;
  v_faltan int;
  v_butaca uuid;
  v_total numeric;
  v_credito numeric;
  v_puntos int;
  v_recompensa record;
begin
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

  -- Se bloquea el perfil antes de mirar saldos: dos pagos (o un pago y una cancelación)
  -- de la misma cuenta se serializan y no pueden gastar el mismo crédito o los mismos
  -- puntos dos veces. Siempre en el orden orden → perfil, igual que cancelar_orden.
  if o.perfil_id is not null then
    perform 1 from public.perfiles where id = o.perfil_id for update;
  end if;

  -- El precio se recalcula acá, no se confía en el que se mostró: se congela en el
  -- momento del cobro (RN-10) y con los saldos de ahora.
  d := public.calcular_orden(p_orden);
  v_total := (d ->> 'total')::numeric;
  v_credito := (d ->> 'credito_aplicado')::numeric;
  v_puntos := (d ->> 'puntos_a_ganar')::int;

  if v_total > 0 and (p_medio is null or p_medio not in ('tarjeta_credito', 'tarjeta_debito', 'transferencia')) then
    raise exception 'Elegí un medio de pago válido.' using errcode = '22023';
  end if;

  insert into public.butacas_ordenes (orden_id, funcion_id, butaca_id)
  select p_orden, o.funcion_id, oi.butaca_id
    from public.orden_items oi where oi.orden_id = p_orden and oi.tipo = 'entrada';

  update public.ordenes
     set estado = 'pagada', pagada_at = now(), expira_at = null,
         medio_pago = case when v_total > 0 then p_medio else 'sin_cargo' end
   where id = p_orden;

  if v_credito > 0 then
    insert into public.creditos_movimientos (perfil_id, orden_id, monto, motivo)
    values (o.perfil_id, p_orden, -v_credito, 'Pago de una compra');
  end if;

  if o.recompensa_id is not null then
    select * into v_recompensa from public.recompensas where id = o.recompensa_id;
    -- El costo se congela: si mañana la recompensa sube, este canje sigue diciendo lo que costó.
    insert into public.canjes (perfil_id, recompensa_id, orden_id, costo_puntos)
    values (o.perfil_id, o.recompensa_id, p_orden, v_recompensa.costo_puntos);
    insert into public.puntos_movimientos (perfil_id, orden_id, puntos, motivo)
    values (o.perfil_id, p_orden, -v_recompensa.costo_puntos, 'Canje: ' || v_recompensa.nombre);
  end if;

  if v_puntos > 0 then
    insert into public.puntos_movimientos (perfil_id, orden_id, puntos, motivo)
    values (o.perfil_id, p_orden, v_puntos, 'Compra');
  end if;

  for v_butaca in
    delete from public.holds_butacas
     where funcion_id = o.funcion_id and sesion_id = p_sesion
       and butaca_id in (select butaca_id from public.orden_items where orden_id = p_orden)
    returning butaca_id
  loop
    perform public.avisar_butaca(o.funcion_id, v_butaca, 'ocupada');
  end loop;

  return jsonb_build_object('ok', true, 'codigo', o.codigo, 'puntos_ganados', v_puntos);
end;
$$;

-- ── Cancelación con crédito (RF-30, RF-31, RN-06) ───────────────────────────
-- No devuelve dinero: acredita el monto en la cuenta. Por eso exige cuenta, y una compra
-- anónima no se puede cancelar: no habría dónde acreditar.
create or replace function public.cancelar_orden(p_orden uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  o record;
  v_inicio timestamptz;
  v_motivo text;
  v_monto numeric;
  v_ganados int;
  v_gastados int;
  v_butaca uuid;
begin
  if v_uid is null then
    raise exception 'Iniciá sesión para cancelar una compra.' using errcode = '22023';
  end if;

  -- Solo el titular: una orden ajena responde igual que una que no existe.
  select * into o from public.ordenes where id = p_orden and perfil_id = v_uid for update;
  if not found then
    raise exception 'La orden no existe.' using errcode = 'P0002';
  end if;

  perform 1 from public.perfiles where id = v_uid for update;

  select inicio into v_inicio from public.funciones where id = o.funcion_id;
  v_motivo := public.motivo_no_cancelable(o.estado, v_inicio, o.entrada_validada_at, o.candy_entregado_at);
  if v_motivo is not null then
    raise exception '%', v_motivo using errcode = '55000';
  end if;

  -- El crédito es lo que se pagó de verdad: medio de pago más el crédito que se había
  -- usado. Lo que cubrió un cupón o un canje nunca fue dinero y no vuelve.
  v_monto := o.total + o.credito_aplicado;

  -- Hay que borrar las butacas vendidas: el unique de butacas_ordenes no es parcial, así
  -- que una orden cancelada seguiría ocupando el asiento.
  for v_butaca in
    delete from public.butacas_ordenes where orden_id = o.id returning butaca_id
  loop
    perform public.avisar_butaca(o.funcion_id, v_butaca, 'libre');
  end loop;

  update public.ordenes set estado = 'cancelada', cancelada_at = now() where id = o.id;

  if v_monto > 0 then
    insert into public.creditos_movimientos (perfil_id, orden_id, monto, motivo)
    values (v_uid, o.id, v_monto, 'Cancelación de una compra');
  end if;

  -- Los puntos ganados con la compra se anulan y los gastados en el canje vuelven. Si ya
  -- se habían gastado los ganados el saldo puede quedar negativo: no se pueden canjear
  -- más puntos hasta compensarlo, que es lo justo.
  select coalesce(sum(puntos) filter (where puntos > 0), 0),
         coalesce(-sum(puntos) filter (where puntos < 0), 0)
    into v_ganados, v_gastados
    from public.puntos_movimientos where orden_id = o.id;

  if v_ganados > 0 then
    insert into public.puntos_movimientos (perfil_id, orden_id, puntos, motivo)
    values (v_uid, o.id, -v_ganados, 'Anulación de los puntos de una compra cancelada');
  end if;
  if v_gastados > 0 then
    insert into public.puntos_movimientos (perfil_id, orden_id, puntos, motivo)
    values (v_uid, o.id, v_gastados, 'Devolución de un canje por cancelación');
    delete from public.canjes where orden_id = o.id;
  end if;

  perform public.registrar_actividad(v_uid, 'cancelar_orden', 'orden', o.id::text,
    jsonb_build_object('credito', v_monto, 'funcion_id', o.funcion_id));

  return jsonb_build_object('ok', true, 'credito', v_monto);
end;
$$;

-- ── Lo que ve la cuenta (RF-40) ─────────────────────────────────────────────

-- Saldos y, si corresponde, el cupón de bienvenida que todavía puede usar (RF-39). El
-- porcentaje sale del cupón vigente: RF-43 lo hace configurable.
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
  v_bienvenida jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('puntos', 0, 'credito', 0, 'bienvenida', null);
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

  return jsonb_build_object(
    'puntos', public.saldo_puntos(v_uid),
    'credito', public.saldo_credito(v_uid),
    'bienvenida', v_bienvenida
  );
end;
$$;

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
    select jsonb_agg(t.fila order by t.inicio desc)
      from (
        select f.inicio,
               jsonb_build_object(
                 'orden_id', o.id,
                 'codigo', o.codigo,
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
          join public.funciones f on f.id = o.funcion_id
          join public.peliculas p on p.id = f.pelicula_id
          join public.salas s on s.id = f.sala_id
         where o.perfil_id = v_uid and o.estado in ('pagada', 'cancelada')
      ) t
  ), '[]'::jsonb);
end;
$$;

-- ── Mi entrada: ahora con el candy y el desglose (RF-27, RF-35) ─────────────
-- Reemplaza a la de 0020. El QR sigue siendo uno solo por orden (D-03); el retiro del candy
-- y su consumo, por tramos, los construye la F8.
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
           'estado', o.estado,
           'email', o.email_contacto,
           'subtotal', o.subtotal,
           'descuento_cupon', o.descuento_cupon,
           'credito_aplicado', o.credito_aplicado,
           'total', o.total,
           'pagada_at', o.pagada_at,
           'cancelada_at', o.cancelada_at,
           'entrada_validada_at', o.entrada_validada_at,
           'candy_entregado_at', o.candy_entregado_at,
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
           ),
           'tiene_candy', exists (
             select 1 from public.orden_items where orden_id = o.id and tipo in ('producto', 'combo')
           ),
           -- Lo que se retira con este mismo QR (RF-35). Un combo lista lo que trae.
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
revoke all on function public.saldo_puntos(uuid) from public, anon, authenticated;
revoke all on function public.saldo_credito(uuid) from public, anon, authenticated;
revoke all on function public.motivo_no_cancelable(public.estado_orden, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.calcular_orden(uuid) from public, anon, authenticated;

revoke all on function public.configurar_orden(uuid, text, jsonb, jsonb, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.cancelar_orden(uuid) from public, anon, authenticated;
revoke all on function public.mis_saldos() from public, anon, authenticated;
revoke all on function public.mis_ordenes() from public, anon, authenticated;

-- La compra sigue siendo anónima (RF-26). Lo que necesita una cuenta —cancelar y mirar los
-- propios saldos e historial— no se le otorga a `anon`: sin cuenta no hay nada que mostrar,
-- y el 42501 es una respuesta más honesta que una lista vacía.
grant execute on function public.configurar_orden(uuid, text, jsonb, jsonb, text, boolean, uuid) to anon, authenticated;
grant execute on function public.cancelar_orden(uuid) to authenticated;
grant execute on function public.mis_saldos() to authenticated;
grant execute on function public.mis_ordenes() to authenticated;

-- Verificación: si algo quedó mal, falla la migración y no la primera compra con cupón.
do $$
declare
  v_politicas int;
begin
  if has_function_privilege('anon', 'public.calcular_orden(uuid)', 'execute')
     or has_function_privilege('anon', 'public.saldo_puntos(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.saldo_credito(uuid)', 'execute') then
    raise exception '0022: una función interna quedó expuesta a la API';
  end if;
  if not has_function_privilege('anon', 'public.configurar_orden(uuid, text, jsonb, jsonb, text, boolean, uuid)', 'execute')
     or not has_function_privilege('anon', 'public.confirmar_pago(uuid, text, text)', 'execute') then
    raise exception '0022: la compra anónima no puede ejecutar sus funciones';
  end if;
  if has_function_privilege('anon', 'public.cancelar_orden(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.cancelar_orden(uuid)', 'execute') then
    raise exception '0022: cancelar_orden debe ser solo para cuentas';
  end if;
  if has_table_privilege('anon', 'public.cupones', 'select')
     or has_table_privilege('authenticated', 'public.cupones', 'select')
     or has_table_privilege('anon', 'public.puntos_movimientos', 'select')
     or has_table_privilege('authenticated', 'public.ordenes', 'select') then
    raise exception '0022: una tabla sensible quedó abierta a la API';
  end if;

  select count(*) into v_politicas
    from pg_policies
   where schemaname = 'public'
     and tablename in ('categorias_productos', 'productos', 'combos', 'combo_items',
                       'recompensas', 'puntos_movimientos', 'creditos_movimientos', 'canjes');
  if v_politicas <> 8 then
    raise exception '0022: se esperaban 8 políticas de lectura y hay %', v_politicas;
  end if;
end;
$$;
