-- 0025 — Próximamente, apertura de venta, alertas, Mis Películas y alta/edición de películas
-- (RF-08, RF-41, RF-42, RF-49, RF-50, RF-56, RF-61, RN-10, RN-12)
--
-- Hasta acá la preventa solo cambiaba el precio (precio_de_entrada(), 0020): nada impedía
-- comprar hoy una función de una película que se estrena en dos meses, ni programar funciones
-- antes del estreno. Esta migración convierte la fecha de apertura de la venta en una
-- invariante de la base, con una sola definición (venta_desde) y dos triggers que la aplican
-- sin reescribir las funciones de compra y de programación.
--
-- Códigos de error (SQLSTATE), con mensaje en español para mostrarse tal cual:
--   42501  quien llama no es administrador
--   22023  el parámetro no es válido
--   P0002  la fila no existe
--   55000  el estado actual no admite la operación

-- ── Cuándo sale a la venta una película (RF-49, RN-10) ──────────────────────
-- Con precio de preventa, desde `preventa_desde` (siete días antes del estreno). Sin preventa,
-- desde el día del estreno. Sin fecha de estreno, siempre: ya está en cartelera.
-- La misma regla la escribe el cliente en core/catalogo/venta.ts para mostrarla sin esperar a
-- la base; la que decide es esta.
create or replace function public.venta_desde(p_pelicula uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.precio_preventa is not null then p.preventa_desde else p.fecha_estreno end
    from public.peliculas p
   where p.id = p_pelicula;
$$;

-- Toda venta empieza con una reserva (D-08): retener_butaca inserta en holds_butacas antes de
-- que exista la orden. Controlar ese INSERT cierra la venta anticipada en un solo lugar, sin
-- copiar retener_butaca de 0020. La excepción deshace solo ese intento de reserva.
create or replace function public.controlar_apertura_de_venta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desde date;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  select public.venta_desde(f.pelicula_id) into v_desde
    from public.funciones f
   where f.id = new.funcion_id;

  if v_desde is not null and v_hoy < v_desde then
    raise exception 'Las entradas de esta película salen a la venta el %.',
      to_char(v_desde, 'DD/MM/YYYY') using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger holds_butacas_apertura_de_venta
  before insert on public.holds_butacas
  for each row execute function public.controlar_apertura_de_venta();

-- Ninguna función antes del estreno. Va en un trigger y no en crear_funciones porque así cubre
-- también modificar_funcion, programar_funciones y los seeds: el alta sigue siendo todo o nada,
-- porque la excepción deshace el lote entero.
create or replace function public.controlar_funcion_antes_del_estreno()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estreno date;
  v_titulo text;
begin
  select p.fecha_estreno, p.titulo into v_estreno, v_titulo
    from public.peliculas p
   where p.id = new.pelicula_id;

  if v_estreno is not null
     and (new.inicio at time zone 'America/Argentina/Buenos_Aires')::date < v_estreno then
    raise exception '"%" se estrena el %: no se pueden programar funciones antes.',
      v_titulo, to_char(v_estreno, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger funciones_no_antes_del_estreno
  before insert or update of inicio, pelicula_id on public.funciones
  for each row execute function public.controlar_funcion_antes_del_estreno();

-- ── Alertas de estreno (RF-42) ──────────────────────────────────────────────
-- A diferencia de las tablas de venta, acá no hay nada que calcular ni que serializar: es la
-- lista de avisos de cada persona. Se abre con políticas sobre la fila propia, igual que
-- resenas (0018). La única regla de negocio va en el WITH CHECK del alta: solo se pide aviso
-- de una película que todavía no salió a la venta.
create or replace function public.admite_alerta(p_pelicula uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (now() at time zone 'America/Argentina/Buenos_Aires')::date < public.venta_desde(p_pelicula),
    false
  );
$$;

grant select, insert, delete on public.alertas_estreno to authenticated;
-- Marcar una alerta como avisada es escribir la propia fila; nada más se puede cambiar.
grant update (notificada_at) on public.alertas_estreno to authenticated;

create policy alertas_select_propias on public.alertas_estreno
  for select to authenticated
  using (perfil_id = (select auth.uid()));

create policy alertas_insert_propias on public.alertas_estreno
  for insert to authenticated
  with check (perfil_id = (select auth.uid()) and public.admite_alerta(pelicula_id));

create policy alertas_update_propias on public.alertas_estreno
  for update to authenticated
  using (perfil_id = (select auth.uid()))
  with check (perfil_id = (select auth.uid()));

create policy alertas_delete_propias on public.alertas_estreno
  for delete to authenticated
  using (perfil_id = (select auth.uid()));

-- ── Mis Películas (RF-41) ───────────────────────────────────────────────────
-- "Lo que el usuario vio" = órdenes propias con el ingreso validado por un empleado (RN-05).
-- Una fila por película, con la última vez que la vio y su propia calificación. Es una función
-- porque `ordenes` sigue sin política: nadie lee ventas por tabla.
create or replace function public.mis_peliculas()
returns table (
  pelicula_id uuid,
  titulo text,
  poster_url text,
  vista_el timestamptz,
  estrellas smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return;
  end if;

  return query
  select v.pelicula_id, v.titulo, v.poster_url, v.vista_el, r.estrellas
    from (
      select distinct on (p.id) p.id as pelicula_id, p.titulo, p.poster_url, f.inicio as vista_el
        from public.ordenes o
        join public.funciones f on f.id = o.funcion_id
        join public.peliculas p on p.id = f.pelicula_id
       where o.perfil_id = v_uid
         and o.estado = 'pagada'
         and o.entrada_validada_at is not null
       order by p.id, f.inicio desc
    ) v
    left join public.resenas r on r.pelicula_id = v.pelicula_id and r.perfil_id = v_uid
   order by v.vista_el desc;
end;
$$;

-- ── Alta y edición de películas (RF-56, RF-07, RF-49) ───────────────────────
-- Mismo esquema que los guardar_* de 0024: p_id nulo da de alta, con id modifica; verifica el
-- rol y registra en el log dentro de la misma transacción (RN-12). El cambio del precio de
-- preventa se registra aparte con antes y después (RF-61, "quién modificó un precio").
--
-- No hay baja: las funciones y las órdenes referencian la película, y una venta de ayer tiene
-- que seguir diciendo qué se vio. Una película sale de cartelera cuando deja de tener funciones.
create or replace function public.guardar_pelicula(
  p_id uuid,
  p_titulo text,
  p_sinopsis text,
  p_poster_url text,
  p_duracion smallint,
  p_restriccion smallint,
  p_estreno date,
  p_destacada boolean,
  p_precio_preventa numeric,
  p_generos uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_titulo text := trim(coalesce(p_titulo, ''));
  v_sinopsis text := trim(coalesce(p_sinopsis, ''));
  v_poster text := nullif(trim(coalesce(p_poster_url, '')), '');
  v_generos uuid[] := coalesce(p_generos, '{}');
  v_generos_antes uuid[];
  v_antes public.peliculas%rowtype;
  v_primera timestamptz;
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede gestionar las películas' using errcode = '42501';
  end if;

  if v_titulo = '' then
    raise exception 'Escribí el título de la película' using errcode = '22023';
  end if;

  if p_duracion is null or p_duracion < 1 or p_duracion > 600 then
    raise exception 'La duración va de 1 a 600 minutos' using errcode = '22023';
  end if;

  if p_restriccion is null or p_restriccion not in (0, 13, 18) then
    raise exception 'La restricción de edad es ATP, 13 o 18' using errcode = '22023';
  end if;

  if p_precio_preventa is not null and p_precio_preventa < 0 then
    raise exception 'El precio de preventa no puede ser negativo' using errcode = '22023';
  end if;

  -- La preventa se cuenta desde el estreno (RN-10): sin fecha no hay desde cuándo abrirla
  if p_precio_preventa is not null and p_estreno is null then
    raise exception 'La preventa necesita una fecha de estreno' using errcode = '22023';
  end if;

  -- Solo se guardan URL del propio bucket o de otro sitio seguro: nada de javascript: ni data:
  if v_poster is not null and v_poster not like 'https://%' then
    raise exception 'La imagen del póster tiene que ser una dirección https' using errcode = '22023';
  end if;

  -- RF-06 filtra por géneros: una película sin ninguno no aparecería en ningún filtro
  if cardinality(v_generos) = 0 then
    raise exception 'Elegí al menos un género' using errcode = '22023';
  end if;

  if (select count(*) from public.generos where id = any (v_generos))
     <> (select count(distinct g) from unnest(v_generos) as g) then
    raise exception 'Uno de los géneros no existe' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.peliculas (titulo, sinopsis, poster_url, duracion_minutos, restriccion_edad,
                                  fecha_estreno, destacada, precio_preventa)
    values (v_titulo, v_sinopsis, v_poster, p_duracion, p_restriccion,
            p_estreno, coalesce(p_destacada, false), p_precio_preventa)
    returning id into v_id;

    insert into public.peliculas_generos (pelicula_id, genero_id)
    select v_id, g from (select distinct unnest(v_generos) as g) s;

    perform public.registrar_actividad(v_actor, 'crear_pelicula', 'pelicula', v_id::text,
      jsonb_build_object('nombre', v_titulo, 'fecha_estreno', p_estreno,
                         'precio_preventa', p_precio_preventa));
    return v_id;
  end if;

  select * into v_antes from public.peliculas where id = p_id for update;
  if not found then
    raise exception 'La película no existe' using errcode = 'P0002';
  end if;

  -- El rango de ocupación de cada función se calculó con la duración vieja (0006) y el trigger
  -- no lo recalcula al cambiar la película: cambiarla con funciones por delante dejaría salas
  -- ocupadas de menos o de más, y RN-01 dejaría de ser cierta.
  if v_antes.duracion_minutos <> p_duracion and exists (
    select 1 from public.funciones
     where pelicula_id = p_id and activa and upper(rango) > now()
  ) then
    raise exception 'La película tiene funciones programadas: no se puede cambiar la duración'
      using errcode = '55000';
  end if;

  -- Mover el estreno después de una función ya programada la dejaría antes del estreno
  select min(inicio) into v_primera
    from public.funciones
   where pelicula_id = p_id and activa;
  if p_estreno is not null and v_primera is not null
     and (v_primera at time zone 'America/Argentina/Buenos_Aires')::date < p_estreno then
    raise exception 'Hay una función el %: el estreno no puede ser posterior',
      to_char(v_primera at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')
      using errcode = '55000';
  end if;

  select coalesce(array_agg(genero_id order by genero_id), '{}') into v_generos_antes
    from public.peliculas_generos where pelicula_id = p_id;

  update public.peliculas
     set titulo = v_titulo, sinopsis = v_sinopsis, poster_url = v_poster,
         duracion_minutos = p_duracion, restriccion_edad = p_restriccion,
         fecha_estreno = p_estreno, destacada = coalesce(p_destacada, v_antes.destacada),
         precio_preventa = p_precio_preventa
   where id = p_id;

  -- Los géneros se reemplazan como conjunto: es lo que el formulario manda
  delete from public.peliculas_generos
   where pelicula_id = p_id and genero_id <> all (v_generos);
  insert into public.peliculas_generos (pelicula_id, genero_id)
  select p_id, g from (select distinct unnest(v_generos) as g) s
  on conflict do nothing;

  if v_antes.titulo is distinct from v_titulo
     or v_antes.sinopsis is distinct from v_sinopsis
     or v_antes.poster_url is distinct from v_poster
     or v_antes.duracion_minutos is distinct from p_duracion
     or v_antes.restriccion_edad is distinct from p_restriccion
     or v_antes.fecha_estreno is distinct from p_estreno
     or v_antes.destacada is distinct from coalesce(p_destacada, v_antes.destacada)
     or v_generos_antes is distinct from (select array_agg(distinct g order by g) from unnest(v_generos) as g) then
    perform public.registrar_actividad(v_actor, 'modificar_pelicula', 'pelicula', p_id::text,
      jsonb_build_object(
        'nombre', v_titulo,
        'antes', jsonb_build_object('titulo', v_antes.titulo, 'fecha_estreno', v_antes.fecha_estreno,
                                    'destacada', v_antes.destacada,
                                    'duracion_minutos', v_antes.duracion_minutos,
                                    'restriccion_edad', v_antes.restriccion_edad),
        'despues', jsonb_build_object('titulo', v_titulo, 'fecha_estreno', p_estreno,
                                      'destacada', coalesce(p_destacada, v_antes.destacada),
                                      'duracion_minutos', p_duracion,
                                      'restriccion_edad', p_restriccion)
      ));
  end if;

  if v_antes.precio_preventa is distinct from p_precio_preventa then
    perform public.registrar_actividad(v_actor, 'modificar_precio_preventa', 'pelicula', p_id::text,
      jsonb_build_object('nombre', v_titulo, 'antes', v_antes.precio_preventa,
                         'despues', p_precio_preventa));
  end if;

  return p_id;
end;
$$;

-- ── Pósters en Storage (RNF-02) ─────────────────────────────────────────────
-- Bucket público de lectura: el póster se muestra a cualquiera, con o sin cuenta, por su URL
-- pública. Los límites de tamaño y de tipo los aplica Storage, no solo el formulario.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Escribir, reemplazar y borrar: solo la administración. La lectura del bucket público no pasa
-- por estas políticas; la de SELECT existe porque Storage la exige para borrar un archivo.
create policy posters_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'posters' and public.es_admin());

create policy posters_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posters' and public.es_admin());

create policy posters_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'posters' and public.es_admin())
  with check (bucket_id = 'posters' and public.es_admin());

create policy posters_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'posters' and public.es_admin());

-- ── Permisos ────────────────────────────────────────────────────────────────
-- venta_desde es interna: la usan los triggers y admite_alerta.
revoke all on function public.venta_desde(uuid) from public, anon, authenticated;
revoke all on function public.controlar_apertura_de_venta() from public, anon, authenticated;
revoke all on function public.controlar_funcion_antes_del_estreno() from public, anon, authenticated;
revoke all on function public.mis_peliculas() from public, anon, authenticated;
revoke all on function public.guardar_pelicula(uuid, text, text, text, smallint, smallint, date, boolean, numeric, uuid[]) from public, anon, authenticated;

-- La política de alta de alertas se evalúa con los permisos de quien inserta: authenticated
-- necesita poder ejecutar admite_alerta. Es de solo lectura y no dice nada que la tabla
-- pública de películas no muestre ya.
revoke all on function public.admite_alerta(uuid) from public, anon;
grant execute on function public.admite_alerta(uuid) to authenticated;

grant execute on function public.mis_peliculas() to authenticated;
grant execute on function public.guardar_pelicula(uuid, text, text, text, smallint, smallint, date, boolean, numeric, uuid[]) to authenticated;

-- Verificación: si algo quedó mal, falla la migración y no la primera compra.
do $$
declare
  v_sin_politica text[];
begin
  if has_function_privilege('anon', 'public.guardar_pelicula(uuid, text, text, text, smallint, smallint, date, boolean, numeric, uuid[])', 'execute')
     or has_function_privilege('anon', 'public.mis_peliculas()', 'execute')
     or has_function_privilege('authenticated', 'public.venta_desde(uuid)', 'execute') then
    raise exception '0025: una función quedó abierta de más';
  end if;

  if has_table_privilege('anon', 'public.alertas_estreno', 'select')
     or has_table_privilege('authenticated', 'public.peliculas', 'insert')
     or has_table_privilege('authenticated', 'public.peliculas', 'update')
     or has_column_privilege('authenticated', 'public.alertas_estreno', 'pelicula_id', 'update') then
    raise exception '0025: una tabla quedó abierta de más';
  end if;

  -- Deny by default: estas cuatro siguen sin ninguna política, a propósito. Son las tablas de
  -- venta, y todo lo que las toca pasa por funciones.
  select array_agg(c.relname::text order by c.relname) into v_sin_politica
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);

  if v_sin_politica is distinct from array['butacas_ordenes', 'holds_butacas',
                                           'orden_items', 'ordenes']::text[] then
    raise exception '0025: las tablas sin política no son las esperadas: %', v_sin_politica;
  end if;
end;
$$;
