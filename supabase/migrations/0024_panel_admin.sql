-- 0024 — Panel de administración: reportes, log y gestión del candy y las promociones
-- (RF-33, RF-36, RF-43, RF-44, RF-47, RF-56 a RF-61, RN-12, RNF-11)
--
-- Mismo criterio que 0019: la lectura de lo que el admin gestiona se abre con políticas que
-- piden es_admin(), y la escritura va SOLO por funciones SECURITY DEFINER que verifican el rol
-- y registran la operación en log_actividad dentro de la misma transacción (RN-12). Si la
-- escritura fuera por tabla, el registro de auditoría dependería de que el cliente lo mande.
--
-- Los reportes no abren las tablas de venta: son funciones que devuelven el agregado ya
-- resuelto, igual que peliculas_mas_vendidas() (0017). `ordenes` y `orden_items` siguen sin
-- política. Ninguna función de este archivo lee perfiles_sensibles: los datos de RF-38.1
-- quedan fuera de reportes, exportaciones y logs por construcción (RNF-11).
--
-- Códigos de error (SQLSTATE), con mensaje en español para mostrarse tal cual:
--   42501  quien llama no es administrador
--   22023  el parámetro no es válido
--   P0002  la fila no existe
--   55000  el estado actual no admite la operación

-- ── Lectura para la administración ──────────────────────────────────────────
-- Las políticas públicas de 0022 muestran solo lo activo, que es lo que ve quien compra.
-- El admin necesita ver también lo dado de baja para poder reactivarlo. Las políticas de
-- un mismo comando se combinan con OR: la pública sigue igual para todos los demás.

create policy productos_select_admin on public.productos
  for select to authenticated
  using (public.es_admin());

create policy combos_select_admin on public.combos
  for select to authenticated
  using (public.es_admin());

create policy combo_items_select_admin on public.combo_items
  for select to authenticated
  using (public.es_admin());

create policy recompensas_select_admin on public.recompensas
  for select to authenticated
  using (public.es_admin());

-- Los cupones siguen sin lectura pública: un cupón no se lista, se canjea por su código
-- (0022). El GRANT es necesario para que la política se evalúe; la política es la que deja
-- afuera a todo el que no sea admin.
grant select on public.cupones to authenticated;

create policy cupones_select_admin on public.cupones
  for select to authenticated
  using (public.es_admin());

grant select on public.configuracion to authenticated;

create policy configuracion_select_admin on public.configuracion
  for select to authenticated
  using (public.es_admin());

-- RF-61: el log se lee directo, con filtros y paginación de PostgREST. Solo SELECT: los
-- triggers de 0011 impiden además editarlo o borrarlo aun desde una función definer.
grant select on public.log_actividad to authenticated;

create policy log_actividad_select_admin on public.log_actividad
  for select to authenticated
  using (public.es_admin());

-- ── Reportes (RF-57, RF-59, RF-60) ──────────────────────────────────────────

-- Facturación por día (RF-57, RF-58). El día es el del pago en hora del cine: el servidor
-- corre en UTC y un pago de las 22:00 sería del día siguiente.
--
--   ordenes    órdenes cobradas ese día, incluidas las que después se cancelaron
--   entradas   entradas de esas órdenes que siguen vigentes (una cancelada liberó la butaca)
--   cobrado    lo que entró por el medio de pago. Incluye las canceladas porque la
--              cancelación no devuelve dinero, acredita crédito (RF-31)
--   credito    lo cubierto con crédito. No se suma a `cobrado`: ese dinero ya se cobró en
--              la orden que lo originó, y sumarlo lo contaría dos veces
--   descuentos lo que cubrieron los cupones
--   canceladas de las órdenes cobradas ese día, cuántas se cancelaron después
create or replace function public.reporte_facturacion(p_desde date, p_hasta date)
returns table (
  dia date,
  ordenes int,
  entradas int,
  cobrado numeric,
  credito numeric,
  descuentos numeric,
  canceladas int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede ver los reportes' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;

  if p_hasta - p_desde > 366 then
    raise exception 'El reporte abarca como máximo un año' using errcode = '22023';
  end if;

  return query
  with cobradas as (
    select (o.pagada_at at time zone 'America/Argentina/Buenos_Aires')::date as dia_pago,
           o.id, o.estado, o.total, o.credito_aplicado, o.descuento_cupon
      from public.ordenes o
     where o.estado in ('pagada', 'cancelada')
       and o.pagada_at >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires')
       and o.pagada_at < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
  )
  select d.dia::date,
         count(c.id)::int,
         coalesce(sum((
           select count(*) from public.orden_items i
            where i.orden_id = c.id and i.tipo = 'entrada'
         )) filter (where c.estado = 'pagada'), 0)::int,
         coalesce(sum(c.total), 0),
         coalesce(sum(c.credito_aplicado), 0),
         coalesce(sum(c.descuento_cupon), 0),
         (count(c.id) filter (where c.estado = 'cancelada'))::int
    from generate_series(p_desde, p_hasta, interval '1 day') as d(dia)
    left join cobradas c on c.dia_pago = d.dia::date
   group by d.dia
   order by d.dia;
end;
$$;

-- Películas más vistas por semana o por mes (RF-59). "Vista" = entrada vendida en una orden
-- pagada, el mismo criterio que el top 3 de la portada (0017). El período se toma por la
-- fecha de la función, no por la del pago: la pregunta es qué se vio esa semana. La semana
-- es la ISO (de lunes a domingo), que es la que usa date_trunc.
create or replace function public.peliculas_mas_vistas(
  p_periodo text,
  p_referencia date,
  p_limite int default 10
)
returns table (pelicula_id uuid, titulo text, entradas int)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_desde date;
  v_hasta date;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede ver los reportes' using errcode = '42501';
  end if;

  if p_referencia is null then
    raise exception 'Falta la fecha del período' using errcode = '22023';
  end if;

  if p_periodo = 'semana' then
    v_desde := date_trunc('week', p_referencia)::date;
    v_hasta := v_desde + 7;
  elsif p_periodo = 'mes' then
    v_desde := date_trunc('month', p_referencia)::date;
    v_hasta := (v_desde + interval '1 month')::date;
  else
    raise exception 'El período tiene que ser semana o mes' using errcode = '22023';
  end if;

  return query
  select p.id, p.titulo, count(bo.id)::int
    from public.butacas_ordenes bo
    join public.ordenes o on o.id = bo.orden_id and o.estado = 'pagada'
    join public.funciones f on f.id = bo.funcion_id
    join public.peliculas p on p.id = f.pelicula_id
   where f.inicio >= (v_desde::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and f.inicio < (v_hasta::timestamp at time zone 'America/Argentina/Buenos_Aires')
   group by p.id, p.titulo
   order by count(bo.id) desc, p.titulo
   limit least(greatest(coalesce(p_limite, 10), 1), 50);
end;
$$;

-- Productos del candy más vendidos (RF-60). Cuenta las unidades que salen del mostrador:
-- las compradas sueltas, las canjeadas con puntos y las que van dentro de un combo. Sin el
-- contenido de los combos, el pochoclo mediano del combo más vendido no figuraría nunca.
-- Es exacto porque guardar_combo no deja cambiar la composición de un combo ya vendido.
create or replace function public.productos_mas_vendidos(
  p_desde date,
  p_hasta date,
  p_limite int default 5
)
returns table (producto_id uuid, nombre text, unidades int)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede ver los reportes' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;

  return query
  with pagadas as (
    select o.id
      from public.ordenes o
     where o.estado = 'pagada'
       and o.pagada_at >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires')
       and o.pagada_at < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
  ),
  vendidos as (
    select i.producto_id as id, i.cantidad::int as cantidad
      from public.orden_items i
      join pagadas pg on pg.id = i.orden_id
     where i.tipo = 'producto'
    union all
    select ci.producto_id, (i.cantidad * ci.cantidad)::int
      from public.orden_items i
      join pagadas pg on pg.id = i.orden_id
      join public.combo_items ci on ci.combo_id = i.combo_id and not ci.incluye_entrada
     where i.tipo = 'combo'
  )
  select p.id, p.nombre, sum(v.cantidad)::int
    from vendidos v
    join public.productos p on p.id = v.id
   group by p.id, p.nombre
   order by sum(v.cantidad) desc, p.nombre
   limit least(greatest(coalesce(p_limite, 5), 1), 50);
end;
$$;

-- ── Categorías del candy (RF-33) ────────────────────────────────────────────
-- p_id nulo da de alta; con id, modifica. Devuelve el id en los dos casos. Mismo esquema
-- para todas las funciones guardar_* de este archivo.
create or replace function public.guardar_categoria(p_id uuid, p_nombre text, p_orden smallint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_antes public.categorias_productos%rowtype;
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede gestionar el candy' using errcode = '42501';
  end if;

  if v_nombre = '' then
    raise exception 'Escribí el nombre de la categoría' using errcode = '22023';
  end if;

  -- El unique de la tabla es la red; este chequeo es el que da un mensaje claro
  if exists (
    select 1 from public.categorias_productos
     where lower(nombre) = lower(v_nombre) and id is distinct from p_id
  ) then
    raise exception 'Ya existe una categoría llamada %', v_nombre using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.categorias_productos (nombre, orden)
    values (v_nombre, coalesce(p_orden, 0))
    returning id into v_id;

    perform public.registrar_actividad((select auth.uid()), 'crear_categoria', 'categoria',
      v_id::text, jsonb_build_object('nombre', v_nombre));
    return v_id;
  end if;

  select * into v_antes from public.categorias_productos where id = p_id for update;
  if not found then
    raise exception 'La categoría no existe' using errcode = 'P0002';
  end if;

  update public.categorias_productos
     set nombre = v_nombre, orden = coalesce(p_orden, v_antes.orden)
   where id = p_id;

  perform public.registrar_actividad((select auth.uid()), 'modificar_categoria', 'categoria',
    p_id::text, jsonb_build_object(
      'antes', jsonb_build_object('nombre', v_antes.nombre, 'orden', v_antes.orden),
      'despues', jsonb_build_object('nombre', v_nombre, 'orden', coalesce(p_orden, v_antes.orden))
    ));
  return p_id;
end;
$$;

-- ── Productos (RF-33, RF-56 "productos y precios") ──────────────────────────
-- El cambio de precio se registra aparte (RF-61: "quién modificó un precio"), igual que
-- modificar_funcion en 0019. No hay borrado físico: orden_items los referencia con RESTRICT,
-- y una venta de ayer tiene que seguir diciendo qué se vendió.
create or replace function public.guardar_producto(
  p_id uuid,
  p_categoria uuid,
  p_nombre text,
  p_descripcion text,
  p_precio numeric,
  p_activo boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_descripcion text := trim(coalesce(p_descripcion, ''));
  v_antes public.productos%rowtype;
  v_id uuid;
  v_combo text;
  v_recompensa text;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede gestionar el candy' using errcode = '42501';
  end if;

  if v_nombre = '' then
    raise exception 'Escribí el nombre del producto' using errcode = '22023';
  end if;

  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo' using errcode = '22023';
  end if;

  if not exists (select 1 from public.categorias_productos where id = p_categoria) then
    raise exception 'Elegí una categoría' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.productos (categoria_id, nombre, descripcion, precio, activo)
    values (p_categoria, v_nombre, v_descripcion, p_precio, coalesce(p_activo, true))
    returning id into v_id;

    perform public.registrar_actividad(v_actor, 'crear_producto', 'producto', v_id::text,
      jsonb_build_object('nombre', v_nombre, 'precio', p_precio));
    return v_id;
  end if;

  select * into v_antes from public.productos where id = p_id for update;
  if not found then
    raise exception 'El producto no existe' using errcode = 'P0002';
  end if;

  -- Dar de baja un producto que un combo o un canje activos siguen entregando dejaría una
  -- promoción que promete algo que no se vende. Primero se cambia o se da de baja eso.
  if v_antes.activo and not coalesce(p_activo, true) then
    select c.nombre into v_combo
      from public.combo_items ci join public.combos c on c.id = ci.combo_id
     where ci.producto_id = p_id and c.activo
     limit 1;
    if v_combo is not null then
      raise exception 'El producto está en el combo "%": dalo de baja o cambialo primero', v_combo
        using errcode = '55000';
    end if;

    select r.nombre into v_recompensa
      from public.recompensas r
     where r.producto_id = p_id and r.activa
     limit 1;
    if v_recompensa is not null then
      raise exception 'El producto es la recompensa "%": dala de baja primero', v_recompensa
        using errcode = '55000';
    end if;
  end if;

  update public.productos
     set categoria_id = p_categoria, nombre = v_nombre, descripcion = v_descripcion,
         precio = p_precio, activo = coalesce(p_activo, v_antes.activo)
   where id = p_id;

  if v_antes.nombre is distinct from v_nombre
     or v_antes.descripcion is distinct from v_descripcion
     or v_antes.categoria_id is distinct from p_categoria
     or v_antes.activo is distinct from coalesce(p_activo, v_antes.activo) then
    perform public.registrar_actividad(v_actor, 'modificar_producto', 'producto', p_id::text,
      jsonb_build_object(
        'nombre', v_nombre,
        'antes', jsonb_build_object('nombre', v_antes.nombre, 'activo', v_antes.activo,
                                    'categoria_id', v_antes.categoria_id),
        'despues', jsonb_build_object('nombre', v_nombre, 'activo', coalesce(p_activo, v_antes.activo),
                                      'categoria_id', p_categoria)
      ));
  end if;

  if v_antes.precio is distinct from p_precio then
    perform public.registrar_actividad(v_actor, 'modificar_precio_producto', 'producto', p_id::text,
      jsonb_build_object('nombre', v_nombre, 'antes', v_antes.precio, 'despues', p_precio));
  end if;

  return p_id;
end;
$$;

-- ── Combos (RF-36, RF-37) ───────────────────────────────────────────────────
-- p_items: [{"producto_id": uuid | null, "incluye_entrada": bool, "cantidad": n}]
--
-- La composición de un combo que ya se vendió no se cambia: la entrada de quien lo compró y
-- el reporte de productos más vendidos leen el contenido del combo desde combo_items, y
-- cambiarlo reescribiría lo que ya se entregó. Es el mismo criterio que la función vendida
-- de 0019: el precio sí se puede cambiar, porque cada orden congela el suyo (RN-10). Para
-- otra composición se crea un combo nuevo y se da de baja el anterior.
create or replace function public.guardar_combo(
  p_id uuid,
  p_nombre text,
  p_descripcion text,
  p_precio numeric,
  p_destacado boolean,
  p_activo boolean,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_descripcion text := trim(coalesce(p_descripcion, ''));
  v_antes public.combos%rowtype;
  v_id uuid;
  v_items jsonb;
  v_items_antes jsonb;
  v_lineas int;
  v_entradas int;
  v_productos int;
  v_distintos int;
  v_validos int;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede gestionar los combos' using errcode = '42501';
  end if;

  if v_nombre = '' then
    raise exception 'Escribí el nombre del combo' using errcode = '22023';
  end if;

  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El combo tiene que incluir algo' using errcode = '22023';
  end if;

  -- Normaliza los ítems: una línea es la entrada o un producto, nunca las dos cosas.
  select jsonb_agg(jsonb_build_object(
           'producto_id', case when coalesce(x.incluye_entrada, false) then null else x.producto_id end,
           'incluye_entrada', coalesce(x.incluye_entrada, false),
           'cantidad', x.cantidad
         ) order by coalesce(x.incluye_entrada, false) desc, x.producto_id),
         count(*),
         count(*) filter (where coalesce(x.incluye_entrada, false)),
         count(*) filter (where not coalesce(x.incluye_entrada, false)),
         count(distinct x.producto_id) filter (where not coalesce(x.incluye_entrada, false))
    into v_items, v_lineas, v_entradas, v_productos, v_distintos
    from jsonb_to_recordset(p_items) as x(producto_id uuid, incluye_entrada boolean, cantidad int);

  if exists (
    select 1 from jsonb_to_recordset(v_items) as x(cantidad int)
     where x.cantidad is null or x.cantidad not between 1 and 10
  ) then
    raise exception 'Cada ítem del combo lleva entre 1 y 10 unidades' using errcode = '22023';
  end if;

  if v_entradas > 1 or v_distintos <> v_productos then
    raise exception 'Cada ítem aparece una sola vez: sumá la cantidad en vez de repetirlo'
      using errcode = '22023';
  end if;

  select count(*) into v_validos
    from jsonb_to_recordset(v_items) as x(producto_id uuid, incluye_entrada boolean)
    join public.productos p on p.id = x.producto_id and p.activo
   where not x.incluye_entrada;
  if v_validos <> v_productos then
    raise exception 'Alguno de los productos no existe o está dado de baja' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.combos (nombre, descripcion, precio, destacado, activo)
    values (v_nombre, v_descripcion, p_precio, coalesce(p_destacado, true), coalesce(p_activo, true))
    returning id into v_id;
  else
    select * into v_antes from public.combos where id = p_id for update;
    if not found then
      raise exception 'El combo no existe' using errcode = 'P0002';
    end if;
    v_id := p_id;
  end if;

  select jsonb_agg(jsonb_build_object(
           'producto_id', ci.producto_id, 'incluye_entrada', ci.incluye_entrada, 'cantidad', ci.cantidad
         ) order by ci.incluye_entrada desc, ci.producto_id)
    into v_items_antes
    from public.combo_items ci where ci.combo_id = v_id;

  if p_id is not null and v_items_antes is distinct from v_items then
    if exists (
      select 1 from public.orden_items i
        join public.ordenes o on o.id = i.orden_id
       where i.combo_id = p_id and o.estado in ('pagada', 'cancelada')
    ) then
      raise exception 'El combo ya se vendió y su contenido no se puede cambiar: creá uno nuevo y dale de baja a este'
        using errcode = '55000';
    end if;
  end if;

  if v_items_antes is distinct from v_items then
    delete from public.combo_items where combo_id = v_id;
    insert into public.combo_items (combo_id, producto_id, incluye_entrada, cantidad)
    select v_id, x.producto_id, x.incluye_entrada, x.cantidad
      from jsonb_to_recordset(v_items) as x(producto_id uuid, incluye_entrada boolean, cantidad int);
  end if;

  if p_id is null then
    perform public.registrar_actividad(v_actor, 'crear_combo', 'combo', v_id::text,
      jsonb_build_object('nombre', v_nombre, 'precio', p_precio, 'items', v_items));
    return v_id;
  end if;

  update public.combos
     set nombre = v_nombre, descripcion = v_descripcion, precio = p_precio,
         destacado = coalesce(p_destacado, v_antes.destacado),
         activo = coalesce(p_activo, v_antes.activo)
   where id = p_id;

  if v_antes.nombre is distinct from v_nombre
     or v_antes.descripcion is distinct from v_descripcion
     or v_antes.destacado is distinct from coalesce(p_destacado, v_antes.destacado)
     or v_antes.activo is distinct from coalesce(p_activo, v_antes.activo)
     or v_items_antes is distinct from v_items then
    perform public.registrar_actividad(v_actor, 'modificar_combo', 'combo', p_id::text,
      jsonb_build_object(
        'nombre', v_nombre,
        'antes', jsonb_build_object('nombre', v_antes.nombre, 'destacado', v_antes.destacado,
                                    'activo', v_antes.activo, 'items', v_items_antes),
        'despues', jsonb_build_object('nombre', v_nombre,
                                      'destacado', coalesce(p_destacado, v_antes.destacado),
                                      'activo', coalesce(p_activo, v_antes.activo), 'items', v_items)
      ));
  end if;

  if v_antes.precio is distinct from p_precio then
    perform public.registrar_actividad(v_actor, 'modificar_precio_combo', 'combo', p_id::text,
      jsonb_build_object('nombre', v_nombre, 'antes', v_antes.precio, 'despues', p_precio));
  end if;

  return p_id;
end;
$$;

-- ── Cupones (RF-39, RF-43, RF-44, RN-08, RN-09) ─────────────────────────────
-- El código se guarda en mayúsculas porque configurar_orden lo busca con upper(trim()).
-- Solo puede haber un cupón de bienvenida activo: mis_saldos le muestra a cada cuenta nueva
-- "tu cupón de bienvenida", y con dos activos no habría uno solo que mostrar.
create or replace function public.guardar_cupon(
  p_id uuid,
  p_codigo text,
  p_tipo public.tipo_cupon,
  p_tipo_descuento public.tipo_descuento,
  p_valor numeric,
  p_edad_minima smallint,
  p_desde date,
  p_hasta date,
  p_activo boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_activo boolean := coalesce(p_activo, true);
  v_antes public.cupones%rowtype;
  v_id uuid;
  v_datos jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede gestionar los cupones' using errcode = '42501';
  end if;

  if v_codigo !~ '^[A-Z0-9_-]{3,30}$' then
    raise exception 'El código lleva de 3 a 30 letras, números, guiones o guiones bajos, sin espacios'
      using errcode = '22023';
  end if;

  if p_tipo is null or p_tipo_descuento is null then
    raise exception 'Elegí el tipo de cupón y el tipo de descuento' using errcode = '22023';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'El descuento tiene que ser mayor que cero' using errcode = '22023';
  end if;

  if p_tipo_descuento = 'porcentaje' and p_valor > 100 then
    raise exception 'Un porcentaje no puede superar el 100 %%' using errcode = '22023';
  end if;

  if p_tipo = 'por_edad' and p_edad_minima is null then
    raise exception 'Un cupón por edad necesita la edad mínima' using errcode = '22023';
  end if;

  if p_edad_minima is not null and p_edad_minima not between 0 and 120 then
    raise exception 'La edad mínima va de 0 a 120' using errcode = '22023';
  end if;

  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La vigencia termina antes de empezar' using errcode = '22023';
  end if;

  if exists (select 1 from public.cupones where codigo = v_codigo and id is distinct from p_id) then
    raise exception 'Ya existe un cupón con el código %', v_codigo using errcode = '22023';
  end if;

  if p_tipo = 'bienvenida' and v_activo and exists (
    select 1 from public.cupones
     where tipo = 'bienvenida' and activo and id is distinct from p_id
  ) then
    raise exception 'Ya hay un cupón de bienvenida activo: dalo de baja antes de activar otro'
      using errcode = '55000';
  end if;

  v_datos := jsonb_build_object(
    'codigo', v_codigo, 'tipo', p_tipo, 'tipo_descuento', p_tipo_descuento, 'valor', p_valor,
    'edad_minima', p_edad_minima, 'vigente_desde', p_desde, 'vigente_hasta', p_hasta,
    'activo', v_activo
  );

  if p_id is null then
    insert into public.cupones (codigo, tipo, tipo_descuento, valor, edad_minima,
                                vigente_desde, vigente_hasta, activo)
    values (v_codigo, p_tipo, p_tipo_descuento, p_valor, p_edad_minima, p_desde, p_hasta, v_activo)
    returning id into v_id;

    perform public.registrar_actividad(v_actor, 'crear_cupon', 'cupon', v_id::text, v_datos);
    return v_id;
  end if;

  select * into v_antes from public.cupones where id = p_id for update;
  if not found then
    raise exception 'El cupón no existe' using errcode = 'P0002';
  end if;

  update public.cupones
     set codigo = v_codigo, tipo = p_tipo, tipo_descuento = p_tipo_descuento, valor = p_valor,
         edad_minima = p_edad_minima, vigente_desde = p_desde, vigente_hasta = p_hasta,
         activo = v_activo
   where id = p_id;

  perform public.registrar_actividad(v_actor, 'modificar_cupon', 'cupon', p_id::text,
    jsonb_build_object(
      'codigo', v_codigo,
      'antes', jsonb_build_object(
        'codigo', v_antes.codigo, 'tipo', v_antes.tipo, 'tipo_descuento', v_antes.tipo_descuento,
        'valor', v_antes.valor, 'edad_minima', v_antes.edad_minima,
        'vigente_desde', v_antes.vigente_desde, 'vigente_hasta', v_antes.vigente_hasta,
        'activo', v_antes.activo),
      'despues', v_datos
    ));
  return p_id;
end;
$$;

-- ── Recompensas (RF-46, RF-47) ──────────────────────────────────────────────
-- El costo en puntos es configuración (RF-47). Cada canje congela el suyo (0009), así que
-- cambiarlo no toca los canjes ya hechos.
create or replace function public.guardar_recompensa(
  p_id uuid,
  p_nombre text,
  p_tipo public.tipo_recompensa,
  p_producto uuid,
  p_costo integer,
  p_activa boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_producto uuid := case when p_tipo = 'producto' then p_producto end;
  v_activa boolean := coalesce(p_activa, true);
  v_antes public.recompensas%rowtype;
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede gestionar las recompensas' using errcode = '42501';
  end if;

  if v_nombre = '' then
    raise exception 'Escribí el nombre de la recompensa' using errcode = '22023';
  end if;

  if p_tipo is null then
    raise exception 'Elegí si la recompensa es una entrada o un producto' using errcode = '22023';
  end if;

  if p_costo is null or p_costo <= 0 then
    raise exception 'El costo en puntos tiene que ser mayor que cero' using errcode = '22023';
  end if;

  if p_tipo = 'producto' and not exists (
    select 1 from public.productos where id = v_producto and activo
  ) then
    raise exception 'Elegí un producto activo para la recompensa' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.recompensas (nombre, tipo, producto_id, costo_puntos, activa)
    values (v_nombre, p_tipo, v_producto, p_costo, v_activa)
    returning id into v_id;

    perform public.registrar_actividad(v_actor, 'crear_recompensa', 'recompensa', v_id::text,
      jsonb_build_object('nombre', v_nombre, 'tipo', p_tipo, 'costo_puntos', p_costo));
    return v_id;
  end if;

  select * into v_antes from public.recompensas where id = p_id for update;
  if not found then
    raise exception 'La recompensa no existe' using errcode = 'P0002';
  end if;

  update public.recompensas
     set nombre = v_nombre, tipo = p_tipo, producto_id = v_producto,
         costo_puntos = p_costo, activa = v_activa
   where id = p_id;

  perform public.registrar_actividad(v_actor, 'modificar_recompensa', 'recompensa', p_id::text,
    jsonb_build_object(
      'nombre', v_nombre,
      'antes', jsonb_build_object('nombre', v_antes.nombre, 'tipo', v_antes.tipo,
                                  'producto_id', v_antes.producto_id,
                                  'costo_puntos', v_antes.costo_puntos, 'activa', v_antes.activa),
      'despues', jsonb_build_object('nombre', v_nombre, 'tipo', p_tipo, 'producto_id', v_producto,
                                    'costo_puntos', p_costo, 'activa', v_activa)
    ));
  return p_id;
end;
$$;

-- ── Configuración (RN-11, D-08) ─────────────────────────────────────────────
-- Solo las claves que existen y con un rango razonable: un recargo VIP negativo o un tope
-- de 0 butacas romperían la compra entera. El recargo VIP es un precio, así que queda en el
-- log con su valor anterior (RF-61).
create or replace function public.guardar_configuracion(p_clave text, p_valor numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes numeric;
  v_min numeric;
  v_max numeric;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede cambiar la configuración' using errcode = '42501';
  end if;

  case p_clave
    when 'recargo_vip' then v_min := 0; v_max := 100000;
    when 'max_butacas_por_orden' then v_min := 1; v_max := 20;
    when 'max_unidades_por_producto' then v_min := 1; v_max := 50;
    else
      raise exception 'La opción % no existe', coalesce(p_clave, '(vacía)') using errcode = '22023';
  end case;

  if p_valor is null or p_valor < v_min or p_valor > v_max then
    raise exception 'El valor va de % a %', v_min, v_max using errcode = '22023';
  end if;

  -- Los topes se cuentan en unidades enteras
  if p_clave <> 'recargo_vip' and p_valor <> trunc(p_valor) then
    raise exception 'El tope tiene que ser un número entero' using errcode = '22023';
  end if;

  select valor into v_antes from public.configuracion where clave = p_clave for update;

  if v_antes is not distinct from p_valor then
    return;
  end if;

  insert into public.configuracion (clave, valor) values (p_clave, p_valor)
  on conflict (clave) do update set valor = excluded.valor;

  perform public.registrar_actividad((select auth.uid()), 'modificar_configuracion',
    'configuracion', p_clave,
    jsonb_build_object('clave', p_clave, 'antes', v_antes, 'despues', p_valor));
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
-- Todas verifican es_admin() por su cuenta; el EXECUTE para authenticated es la puerta, no
-- el control. anon no tiene nada que hacer acá.
revoke all on function public.reporte_facturacion(date, date) from public, anon, authenticated;
revoke all on function public.peliculas_mas_vistas(text, date, int) from public, anon, authenticated;
revoke all on function public.productos_mas_vendidos(date, date, int) from public, anon, authenticated;
revoke all on function public.guardar_categoria(uuid, text, smallint) from public, anon, authenticated;
revoke all on function public.guardar_producto(uuid, uuid, text, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public.guardar_combo(uuid, text, text, numeric, boolean, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.guardar_cupon(uuid, text, public.tipo_cupon, public.tipo_descuento, numeric, smallint, date, date, boolean) from public, anon, authenticated;
revoke all on function public.guardar_recompensa(uuid, text, public.tipo_recompensa, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.guardar_configuracion(text, numeric) from public, anon, authenticated;

grant execute on function public.reporte_facturacion(date, date) to authenticated;
grant execute on function public.peliculas_mas_vistas(text, date, int) to authenticated;
grant execute on function public.productos_mas_vendidos(date, date, int) to authenticated;
grant execute on function public.guardar_categoria(uuid, text, smallint) to authenticated;
grant execute on function public.guardar_producto(uuid, uuid, text, text, numeric, boolean) to authenticated;
grant execute on function public.guardar_combo(uuid, text, text, numeric, boolean, boolean, jsonb) to authenticated;
grant execute on function public.guardar_cupon(uuid, text, public.tipo_cupon, public.tipo_descuento, numeric, smallint, date, date, boolean) to authenticated;
grant execute on function public.guardar_recompensa(uuid, text, public.tipo_recompensa, uuid, integer, boolean) to authenticated;
grant execute on function public.guardar_configuracion(text, numeric) to authenticated;

-- Verificación: si algo quedó mal, falla la migración y no el primer reporte.
do $$
declare
  v_sin_politica text[];
begin
  if has_function_privilege('anon', 'public.reporte_facturacion(date, date)', 'execute')
     or has_function_privilege('anon', 'public.guardar_producto(uuid, uuid, text, text, numeric, boolean)', 'execute') then
    raise exception '0024: una función de administración quedó abierta a anon';
  end if;

  if has_table_privilege('anon', 'public.log_actividad', 'select')
     or has_table_privilege('anon', 'public.cupones', 'select')
     or has_table_privilege('authenticated', 'public.log_actividad', 'insert')
     or has_table_privilege('authenticated', 'public.log_actividad', 'update')
     or has_table_privilege('authenticated', 'public.log_actividad', 'delete')
     or has_table_privilege('authenticated', 'public.productos', 'insert')
     or has_table_privilege('authenticated', 'public.cupones', 'update')
     or has_table_privilege('authenticated', 'public.configuracion', 'update') then
    raise exception '0024: una tabla quedó abierta de más';
  end if;

  -- Deny by default: estas cinco siguen sin ninguna política, a propósito. Todo lo que las
  -- toca pasa por funciones.
  select array_agg(c.relname::text order by c.relname) into v_sin_politica
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);

  if v_sin_politica is distinct from array['alertas_estreno', 'butacas_ordenes', 'holds_butacas',
                                           'orden_items', 'ordenes']::text[] then
    raise exception '0024: las tablas sin política no son las esperadas: %', v_sin_politica;
  end if;
end;
$$;
