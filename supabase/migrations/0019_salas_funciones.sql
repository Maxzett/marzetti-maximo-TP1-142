-- 0019 — Salas, butacas y funciones: lectura pública y escritura solo por RPC
-- (RF-12 a RF-15, RF-18 a RF-23, RN-01, RN-02, RN-12, D-05)
--
-- Las tres tablas se abren a LECTURA para los roles de la API, y a nada más. No hay
-- INSERT, UPDATE ni DELETE otorgado a nadie sobre salas, butacas ni funciones: toda
-- escritura pasa por una función de esta migración. Es lo que hace cumplir RF-21
-- ("el administrador no elige la sala"): con una política de INSERT sobre `funciones`,
-- el admin podría mandar `sala_id` a mano desde las DevTools y saltearse la asignación.
-- Con las RPC, el único camino a una función pasa por el algoritmo.
--
-- Códigos de error (SQLSTATE) que usan las funciones, para que el cliente pueda
-- distinguirlos sin leer el texto:
--   42501  quien llama no es administrador
--   22023  un parámetro no es válido (fechas, precio, días, nombre)
--   P0002  la fila que se quiere tocar no existe
--   55000  el estado actual no admite la operación (con entradas vendidas, ya
--          comenzada, sala con funciones por delante)
-- Los mensajes ya están redactados para la persona que administra: la interfaz los
-- muestra tal cual.

-- ── Lectura pública ─────────────────────────────────────────────────────────
-- Igual que en 0017: primero el GRANT y después la política, porque son dos capas y
-- una sin la otra no deja pasar nada. La compra anónima (RF-26) tiene que poder
-- dibujar el mapa de la sala, así que `anon` también lee.

grant select on public.salas to anon, authenticated;
grant select on public.butacas to anon, authenticated;
grant select on public.funciones to anon, authenticated;

create policy salas_select_publico on public.salas
  for select to anon, authenticated
  using (true);

create policy butacas_select_publico on public.butacas
  for select to anon, authenticated
  using (true);

-- Una función dada de baja (RF-23) deja de existir para el público, pero el
-- administrador la sigue viendo para poder consultarla. `(select ...)` hace que
-- Postgres evalúe es_admin() una sola vez por consulta y no una vez por fila.
create policy funciones_select_vigentes on public.funciones
  for select to anon, authenticated
  using (activa or (select public.es_admin()));

-- ── Distribución de butacas (RF-12 a RF-15, D-01) ───────────────────────────
-- La grilla vivía inline en el seed 001. Pasa a una función para que exista en un
-- solo lugar: RF-12 dice que todas las salas comparten la misma distribución, y crear
-- una sala desde la app (crear_sala) tiene que generar exactamente lo mismo que el seed.
--
--   A–I y L–Q  estándar      4 + 20 + 4 = 28   × 15 filas = 420
--   J y K      silla_ruedas  2 + 10 + 2 = 14   ×  2 filas =  28   (D-01)
--   R, S, T    vip           4 + 20 + 4 = 28   ×  3 filas =  84   (RF-15)
--                                                          ─────
--                                                            532
--
-- Es idempotente (`on conflict do nothing`) y verifica su propio resultado: si la
-- composición no da 420 + 28 + 84, falla acá y no con el mapa ya dibujado y una fila
-- de menos. No tiene GRANT para la API: la llaman crear_sala y el seed.

create or replace function public.generar_butacas_sala(p_sala_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_estandar integer;
  v_ruedas integer;
  v_vip integer;
begin
  if not exists (select 1 from public.salas where id = p_sala_id) then
    raise exception 'La sala % no existe', p_sala_id using errcode = 'P0002';
  end if;

  with filas as (
    select
      chr(64 + i) as fila,  -- 1 → 'A', 20 → 'T'
      case
        when i in (10, 11) then 'silla_ruedas'::public.tipo_ubicacion  -- J y K
        when i >= 18       then 'vip'::public.tipo_ubicacion           -- R, S, T
        else                    'estandar'::public.tipo_ubicacion
      end as tipo,
      case when i in (10, 11) then array[2, 10, 2] else array[4, 20, 4] end as bloques
    from generate_series(1, 20) as i
  ),
  ubicaciones as (
    select
      f.fila,
      f.tipo,
      c.columna,
      c.cantidad,
      -- Cuántas butacas quedaron a la izquierda: la numeración es corrida dentro de
      -- la fila, así que la columna 2 no arranca en 1 sino después del primer bloque.
      sum(c.cantidad) over (
        partition by f.fila order by c.columna
        rows between unbounded preceding and 1 preceding
      ) as previas
    from filas f
    cross join lateral unnest(f.bloques) with ordinality as c(cantidad, columna)
  )
  insert into public.butacas (sala_id, fila, columna, numero, tipo)
  select
    p_sala_id,
    u.fila,
    u.columna::smallint,
    (coalesce(u.previas, 0) + n.i)::smallint,
    u.tipo
  from ubicaciones u
  cross join lateral generate_series(1, u.cantidad) as n(i)
  on conflict (sala_id, fila, numero) do nothing;

  select
    count(*) filter (where tipo = 'estandar'),
    count(*) filter (where tipo = 'silla_ruedas'),
    count(*) filter (where tipo = 'vip')
  into v_estandar, v_ruedas, v_vip
  from public.butacas
  where sala_id = p_sala_id;

  if (v_estandar, v_ruedas, v_vip) is distinct from (420, 28, 84) then
    raise exception 'La sala % quedó con % estándar, % de silla de ruedas y % VIP (se esperaban 420, 28 y 84)',
      p_sala_id, v_estandar, v_ruedas, v_vip;
  end if;

  return v_estandar + v_ruedas + v_vip;
end;
$$;

-- ── Auditoría (RN-12, RF-61) ────────────────────────────────────────────────
-- Único punto de escritura de log_actividad. Guarda una copia del email y del rol de
-- quien actuó: si esa cuenta se borra, el registro de lo que hizo se queda. `detalle`
-- NUNCA recibe datos de perfiles_sensibles (RNF-11): acá solo entran ids, nombres de
-- película y de sala, fechas y precios.

create or replace function public.registrar_actividad(
  p_actor uuid,
  p_accion text,
  p_entidad text,
  p_entidad_id text,
  p_detalle jsonb default '{}'::jsonb
)
returns void
language sql
set search_path = ''
as $$
  -- El LEFT JOIN contra (select 1) hace que haya siempre una fila aunque p_actor sea
  -- nulo (el seed y las pruebas corren como postgres, sin sesión de nadie).
  insert into public.log_actividad (actor_id, actor_email, actor_rol, accion, entidad, entidad_id, detalle)
  select p_actor, p.email, p.rol, p_accion, p_entidad, p_entidad_id, coalesce(p_detalle, '{}'::jsonb)
  from (select 1) as una
  left join public.perfiles p on p.id = p_actor;
$$;

-- ── Asignación de sala (RF-21, RN-01, RN-02) ────────────────────────────────

-- Elige la sala para un intervalo de ocupación. Determinística (RN-02): entre las
-- activas que no se superponen con ninguna función vigente, la de menor nombre, con
-- el id como desempate. Mismo estado de la grilla, misma sala, siempre.
--
-- `p_preferida` existe para modificar_funcion: al mover una función conviene que
-- se quede donde estaba si sigue libre, y no que salte a otra sala sin necesidad.
-- `p_funcion_excluida` es esa misma función: no puede chocar consigo misma.
create or replace function public.buscar_sala_libre(
  p_rango tstzrange,
  p_preferida uuid default null,
  p_funcion_excluida uuid default null
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select s.id
  from public.salas s
  where s.activa
    and not exists (
      select 1
      from public.funciones f
      where f.sala_id = s.id
        and f.activa
        and f.id is distinct from p_funcion_excluida
        and f.rango && p_rango
    )
  order by coalesce(s.id = p_preferida, false) desc, s.nombre, s.id
  limit 1;
$$;

-- Horarios cercanos al pedido en los que alguna sala estaría libre (D-05). Barre
-- desplazamientos de ±15 min hasta ±6 h y devuelve los `p_cantidad` más próximos, del
-- más cercano al más lejano. No propone nada en el pasado. Un horario sugerido no es
-- una reserva: es una pista para el administrador, que vuelve a pedirlo.
create or replace function public.horarios_libres_cercanos(
  p_duracion_min integer,
  p_inicio timestamptz,
  p_cantidad integer default 3,
  p_funcion_excluida uuid default null
)
returns timestamptz[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(t.inicio order by t.distancia, t.inicio), '{}'::timestamptz[])
  from (
    select c.inicio, abs(g.paso) as distancia
    from generate_series(-24, 24) as g(paso)
    cross join lateral (
      select p_inicio + make_interval(mins => g.paso * 15) as inicio
    ) as c
    where g.paso <> 0
      and c.inicio > now()
      and public.buscar_sala_libre(
            tstzrange(c.inicio, c.inicio + make_interval(mins => p_duracion_min + 30), '[)'),
            null,
            p_funcion_excluida
          ) is not null
    order by abs(g.paso), c.inicio
    limit least(greatest(p_cantidad, 0), 10)
  ) as t;
$$;

-- ── Programar funciones (RF-19 a RF-22, RN-01, RN-02, D-05) ─────────────────
-- El algoritmo, sin chequeo de rol: no tiene GRANT para la API. La puerta de entrada
-- es crear_funciones(), que verifica que quien llama es administrador. Separarlas deja
-- el algoritmo invocable desde el seed 004 (corre como postgres, sin sesión) sin
-- abrir un camino que se saltee el control de rol.
--
-- Recibe días y horario, no una fecha suelta (RF-20): "lunes, martes y viernes a las
-- 18:00" entre dos fechas. La hora es la del cine (Buenos Aires) y se convierte a
-- timestamptz acá, porque el servidor corre en UTC y una hora sin zona se correría
-- tres horas según quién la lea.
--
-- TODO O NADA (D-05): dos pasadas. La primera busca sala para cada fecha SIN insertar;
-- si alguna no tiene, devuelve el detalle del conflicto y no se creó ninguna. Solo si
-- todas tienen sala, la segunda inserta. Las funciones de un mismo lote no pueden
-- pisarse entre sí (es la misma película en días distintos y una función ocupa la sala
-- menos de 24 horas), así que la primera pasada no necesita ver las inserciones.
--
-- Concurrencia (RN-02): el advisory lock hace que dos altas simultáneas se ejecuten una
-- detrás de otra; la segunda ya ve las funciones de la primera. Si igual algo se
-- colara por otro camino, la constraint EXCLUDE de 0006 lo frena con 23P01: el lock
-- evita el error, la constraint garantiza la invariante.

create or replace function public.programar_funciones(
  p_pelicula_id uuid,
  p_desde date,
  p_hasta date,
  p_dias smallint[],
  p_hora time,
  p_formato public.formato_funcion,
  p_idioma public.idioma_funcion,
  p_precio_base numeric,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_duracion smallint;
  v_fecha date;
  v_inicio timestamptz;
  v_sala uuid;
  v_nombre_sala text;
  v_ocurrencias integer;
  v_inicios timestamptz[] := '{}';
  v_salas uuid[] := '{}';
  v_sin_sala jsonb := '[]'::jsonb;
  v_creadas jsonb := '[]'::jsonb;
  v_id uuid;
  i integer;
begin
  if p_desde is null or p_hasta is null or p_hora is null then
    raise exception 'Faltan las fechas o el horario' using errcode = '22023';
  end if;

  if p_hasta < p_desde then
    raise exception 'La fecha final es anterior a la inicial' using errcode = '22023';
  end if;

  -- Se mide antes de generar la serie: un rango de diez años no debe armarse siquiera.
  if p_hasta - p_desde > 366 then
    raise exception 'El período no puede superar un año' using errcode = '22023';
  end if;

  if p_dias is null
     or cardinality(p_dias) = 0
     or not (p_dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]) then
    raise exception 'Elegí al menos un día de la semana' using errcode = '22023';
  end if;

  if p_precio_base is null or p_precio_base < 0 then
    raise exception 'El precio base no puede ser negativo' using errcode = '22023';
  end if;

  select p.titulo, p.duracion_minutos into v_titulo, v_duracion
  from public.peliculas p
  where p.id = p_pelicula_id;

  if not found then
    raise exception 'La película no existe' using errcode = 'P0002';
  end if;

  select count(*) into v_ocurrencias
  from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as d
  where extract(isodow from d)::smallint = any (p_dias);

  if v_ocurrencias = 0 then
    raise exception 'Ninguna fecha del período cae en los días elegidos' using errcode = '22023';
  end if;

  if v_ocurrencias > 200 then
    raise exception 'Son % funciones de una sola vez; el máximo es 200', v_ocurrencias using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('cine.asignacion_de_salas'));

  -- Pasada 1: buscar sala para cada fecha, sin insertar.
  for v_fecha in
    select d::date
    from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as d
    where extract(isodow from d)::smallint = any (p_dias)
    order by d
  loop
    v_inicio := (v_fecha + p_hora) at time zone 'America/Argentina/Buenos_Aires';

    if v_inicio <= now() then
      -- left(...::text, 5) y no to_char: no existe to_char(time, text).
      raise exception 'La función del % a las % ya pasó', v_fecha, left(p_hora::text, 5)
        using errcode = '22023';
    end if;

    v_sala := public.buscar_sala_libre(
      tstzrange(v_inicio, v_inicio + make_interval(mins => v_duracion + 30), '[)')
    );

    if v_sala is null then
      v_sin_sala := v_sin_sala || jsonb_build_object(
        'fecha', v_fecha,
        'inicio', v_inicio,
        'sugerencias', to_jsonb(public.horarios_libres_cercanos(v_duracion, v_inicio))
      );
    else
      v_inicios := v_inicios || v_inicio;
      v_salas := v_salas || v_sala;
    end if;
  end loop;

  if jsonb_array_length(v_sin_sala) > 0 then
    return jsonb_build_object('ok', false, 'sin_sala', v_sin_sala);
  end if;

  -- Pasada 2: todas tienen sala, se crean.
  for i in 1 .. cardinality(v_inicios) loop
    insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
    values (p_pelicula_id, v_salas[i], v_inicios[i], p_formato, p_idioma, p_precio_base)
    returning id into v_id;

    select s.nombre into v_nombre_sala from public.salas s where s.id = v_salas[i];

    perform public.registrar_actividad(
      p_actor, 'crear_funcion', 'funcion', v_id::text,
      jsonb_build_object(
        'pelicula_id', p_pelicula_id,
        'pelicula', v_titulo,
        'sala', v_nombre_sala,
        'inicio', v_inicios[i],
        'formato', p_formato,
        'idioma', p_idioma,
        'precio_base', p_precio_base
      )
    );

    v_creadas := v_creadas || jsonb_build_object(
      'id', v_id,
      'inicio', v_inicios[i],
      'sala_id', v_salas[i],
      'sala', v_nombre_sala
    );
  end loop;

  return jsonb_build_object('ok', true, 'creadas', v_creadas);
end;
$$;

-- ── Puertas de entrada para el administrador ────────────────────────────────
-- SECURITY DEFINER para poder escribir en tablas que la API no puede tocar, y por eso
-- el primer paso de cada una es preguntar si quien llama es admin. `search_path` fijado
-- por el mismo motivo que en es_admin() (0013).

create or replace function public.crear_funciones(
  p_pelicula_id uuid,
  p_desde date,
  p_hasta date,
  p_dias smallint[],
  p_hora time,
  p_formato public.formato_funcion,
  p_idioma public.idioma_funcion,
  p_precio_base numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede programar funciones' using errcode = '42501';
  end if;

  return public.programar_funciones(
    p_pelicula_id, p_desde, p_hasta, p_dias, p_hora,
    p_formato, p_idioma, p_precio_base, (select auth.uid())
  );
end;
$$;

-- Modifica una función existente (RF-23). Si cambia el horario, la sala se conserva
-- mientras siga libre y solo se reasigna si no; si no hay ninguna, se informa igual que
-- en el alta y la función queda como estaba.
--
-- Con entradas vendidas solo se puede cambiar el precio: mover el horario, el formato o
-- el idioma de una función ya vendida cambia lo que la gente compró. El precio sí,
-- porque cada orden congela el suyo (RN-10). Cambiar un precio se registra aparte
-- (RF-61: "quién modificó un precio").
create or replace function public.modificar_funcion(
  p_funcion_id uuid,
  p_inicio timestamptz,
  p_formato public.formato_funcion,
  p_idioma public.idioma_funcion,
  p_precio_base numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_f public.funciones%rowtype;
  v_titulo text;
  v_duracion smallint;
  v_sala uuid;
  v_nombre_sala text;
  v_agenda_cambia boolean;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede modificar funciones' using errcode = '42501';
  end if;

  if p_inicio is null or p_inicio <= now() then
    raise exception 'El nuevo horario tiene que estar en el futuro' using errcode = '22023';
  end if;

  if p_precio_base is null or p_precio_base < 0 then
    raise exception 'El precio base no puede ser negativo' using errcode = '22023';
  end if;

  -- El lock de asignación va antes que el de la fila, igual que en programar_funciones:
  -- con el orden invertido dos operaciones cruzadas podrían trabarse entre sí.
  perform pg_advisory_xact_lock(hashtext('cine.asignacion_de_salas'));

  select * into v_f from public.funciones where id = p_funcion_id for update;

  if not found then
    raise exception 'La función no existe' using errcode = 'P0002';
  end if;

  if not v_f.activa then
    raise exception 'La función está dada de baja' using errcode = '55000';
  end if;

  if v_f.inicio <= now() then
    raise exception 'La función ya comenzó y no se puede modificar' using errcode = '55000';
  end if;

  select p.titulo, p.duracion_minutos into v_titulo, v_duracion
  from public.peliculas p
  where p.id = v_f.pelicula_id;

  v_agenda_cambia := p_inicio is distinct from v_f.inicio
                  or p_formato is distinct from v_f.formato
                  or p_idioma is distinct from v_f.idioma;

  if v_agenda_cambia and exists (
    select 1 from public.ordenes o where o.funcion_id = p_funcion_id and o.estado = 'pagada'
  ) then
    raise exception 'La función tiene entradas vendidas: solo se puede cambiar el precio'
      using errcode = '55000';
  end if;

  v_sala := v_f.sala_id;

  if p_inicio is distinct from v_f.inicio then
    v_sala := public.buscar_sala_libre(
      tstzrange(p_inicio, p_inicio + make_interval(mins => v_duracion + 30), '[)'),
      v_f.sala_id,
      p_funcion_id
    );

    if v_sala is null then
      return jsonb_build_object(
        'ok', false,
        'sin_sala', jsonb_build_array(jsonb_build_object(
          'fecha', (p_inicio at time zone 'America/Argentina/Buenos_Aires')::date,
          'inicio', p_inicio,
          'sugerencias', to_jsonb(public.horarios_libres_cercanos(v_duracion, p_inicio, 3, p_funcion_id))
        ))
      );
    end if;
  end if;

  update public.funciones
  set inicio = p_inicio,
      sala_id = v_sala,
      formato = p_formato,
      idioma = p_idioma,
      precio_base = p_precio_base
  where id = p_funcion_id;

  select s.nombre into v_nombre_sala from public.salas s where s.id = v_sala;

  if v_agenda_cambia then
    perform public.registrar_actividad(
      v_actor, 'modificar_funcion', 'funcion', p_funcion_id::text,
      jsonb_build_object(
        'pelicula', v_titulo,
        'antes', jsonb_build_object('inicio', v_f.inicio, 'formato', v_f.formato, 'idioma', v_f.idioma, 'sala_id', v_f.sala_id),
        'despues', jsonb_build_object('inicio', p_inicio, 'formato', p_formato, 'idioma', p_idioma, 'sala_id', v_sala)
      )
    );
  end if;

  if p_precio_base is distinct from v_f.precio_base then
    perform public.registrar_actividad(
      v_actor, 'modificar_precio_funcion', 'funcion', p_funcion_id::text,
      jsonb_build_object(
        'pelicula', v_titulo,
        'antes', v_f.precio_base,
        'despues', p_precio_base
      )
    );
  end if;

  return jsonb_build_object('ok', true, 'funcion_id', p_funcion_id, 'sala_id', v_sala, 'sala', v_nombre_sala);
end;
$$;

-- Baja lógica (RF-23): la fila se conserva porque las órdenes la referencian, y al pasar
-- a `activa = false` sale de la constraint de exclusión y libera la sala. Con entradas
-- pagadas se rechaza: dar de baja una función vendida sin devolver nada al comprador
-- es un problema que resuelve la F7 con la cancelación con crédito, no esta función.
create or replace function public.dar_de_baja_funcion(p_funcion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f public.funciones%rowtype;
  v_titulo text;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede dar de baja funciones' using errcode = '42501';
  end if;

  select * into v_f from public.funciones where id = p_funcion_id for update;

  if not found then
    raise exception 'La función no existe' using errcode = 'P0002';
  end if;

  -- Dar de baja dos veces no debe dejar dos registros de auditoría de algo que pasó una.
  if not v_f.activa then
    return;
  end if;

  if exists (
    select 1 from public.ordenes o where o.funcion_id = p_funcion_id and o.estado = 'pagada'
  ) then
    raise exception 'La función tiene entradas vendidas y no se puede dar de baja'
      using errcode = '55000';
  end if;

  update public.funciones set activa = false where id = p_funcion_id;

  select p.titulo into v_titulo from public.peliculas p where p.id = v_f.pelicula_id;

  perform public.registrar_actividad(
    (select auth.uid()), 'baja_funcion', 'funcion', p_funcion_id::text,
    jsonb_build_object('pelicula', v_titulo, 'inicio', v_f.inicio, 'sala_id', v_f.sala_id)
  );
end;
$$;

-- ── Salas (RF-18) ───────────────────────────────────────────────────────────
-- Todas las salas comparten la misma distribución (RF-12), así que "gestionar la
-- distribución de butacas" no es editar butaca por butaca: crear una sala genera su
-- mapa completo, y una sala se puede renombrar o dar de baja. No hay borrado físico:
-- `funciones.sala_id` es ON DELETE RESTRICT porque las funciones pasadas la referencian.

create or replace function public.crear_sala(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_nombre text := trim(coalesce(p_nombre, ''));
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede crear salas' using errcode = '42501';
  end if;

  if v_nombre = '' then
    raise exception 'La sala necesita un nombre' using errcode = '22023';
  end if;

  -- Un nombre repetido lo frena el UNIQUE de la tabla (23505); el cliente lo traduce.
  insert into public.salas (nombre) values (v_nombre) returning id into v_id;

  perform public.generar_butacas_sala(v_id);

  perform public.registrar_actividad(
    (select auth.uid()), 'crear_sala', 'sala', v_id::text,
    jsonb_build_object('nombre', v_nombre)
  );

  return v_id;
end;
$$;

-- Renombrar y activar o desactivar. Una sala con funciones por delante no se puede
-- desactivar: quedarían programadas en una sala que la asignación automática ya no
-- considera.
create or replace function public.actualizar_sala(
  p_sala_id uuid,
  p_nombre text,
  p_activa boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sala public.salas%rowtype;
  v_nombre text := trim(coalesce(p_nombre, ''));
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede modificar salas' using errcode = '42501';
  end if;

  if v_nombre = '' then
    raise exception 'La sala necesita un nombre' using errcode = '22023';
  end if;

  if p_activa is null then
    raise exception 'Falta indicar si la sala está activa' using errcode = '22023';
  end if;

  select * into v_sala from public.salas where id = p_sala_id for update;

  if not found then
    raise exception 'La sala no existe' using errcode = 'P0002';
  end if;

  -- Mientras la función no terminó de ocupar la sala (upper del rango), la sala no es
  -- desactivable: una en curso todavía la está usando.
  if v_sala.activa and not p_activa and exists (
    select 1
    from public.funciones f
    where f.sala_id = p_sala_id and f.activa and upper(f.rango) > now()
  ) then
    raise exception 'La sala tiene funciones programadas: dalas de baja o esperá a que terminen'
      using errcode = '55000';
  end if;

  if v_nombre = v_sala.nombre and p_activa = v_sala.activa then
    return;
  end if;

  update public.salas set nombre = v_nombre, activa = p_activa where id = p_sala_id;

  perform public.registrar_actividad(
    (select auth.uid()), 'modificar_sala', 'sala', p_sala_id::text,
    jsonb_build_object(
      'antes', jsonb_build_object('nombre', v_sala.nombre, 'activa', v_sala.activa),
      'despues', jsonb_build_object('nombre', v_nombre, 'activa', p_activa)
    )
  );
end;
$$;

-- ── Quién puede ejecutar qué ────────────────────────────────────────────────
-- Postgres le da EXECUTE a PUBLIC a toda función nueva. Se saca de todos lados y se
-- otorga a mano: la lista de quién llama a qué queda escrita, no heredada de un default.
--
-- Las cinco de arriba son las puertas del administrador: solo `authenticated` puede
-- llamarlas, y adentro cada una verifica el rol (un cliente autenticado entra, choca
-- con el 42501). `anon` ni siquiera llega a la función. Las internas no se otorgan a
-- nadie de la API: las usan las de arriba y el seed, que corren como postgres.

revoke all on function public.generar_butacas_sala(uuid) from public, anon, authenticated;
revoke all on function public.registrar_actividad(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.buscar_sala_libre(tstzrange, uuid, uuid) from public, anon, authenticated;
revoke all on function public.horarios_libres_cercanos(integer, timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.programar_funciones(uuid, date, date, smallint[], time, public.formato_funcion, public.idioma_funcion, numeric, uuid) from public, anon, authenticated;

revoke all on function public.crear_funciones(uuid, date, date, smallint[], time, public.formato_funcion, public.idioma_funcion, numeric) from public, anon, authenticated;
revoke all on function public.modificar_funcion(uuid, timestamptz, public.formato_funcion, public.idioma_funcion, numeric) from public, anon, authenticated;
revoke all on function public.dar_de_baja_funcion(uuid) from public, anon, authenticated;
revoke all on function public.crear_sala(text) from public, anon, authenticated;
revoke all on function public.actualizar_sala(uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.crear_funciones(uuid, date, date, smallint[], time, public.formato_funcion, public.idioma_funcion, numeric) to authenticated;
grant execute on function public.modificar_funcion(uuid, timestamptz, public.formato_funcion, public.idioma_funcion, numeric) to authenticated;
grant execute on function public.dar_de_baja_funcion(uuid) to authenticated;
grant execute on function public.crear_sala(text) to authenticated;
grant execute on function public.actualizar_sala(uuid, text, boolean) to authenticated;

-- Comprobación: si algún privilegio o política quedó mal, la migración falla acá en vez
-- de descubrirse como una pantalla de administración que responde 403 o, peor, 200.
do $$
declare
  v_politicas integer;
begin
  select count(*) into v_politicas
  from pg_policies
  where schemaname = 'public'
    and tablename in ('salas', 'butacas', 'funciones')
    and cmd = 'SELECT';

  if v_politicas <> 3 then
    raise exception 'Se esperaban 3 politicas de lectura y hay %', v_politicas;
  end if;

  if not has_table_privilege('anon', 'public.butacas', 'select')
     or not has_table_privilege('anon', 'public.funciones', 'select')
     or not has_table_privilege('anon', 'public.salas', 'select') then
    raise exception 'anon no puede leer salas, butacas o funciones';
  end if;

  -- La escritura tiene que estar cerrada para los tres roles de la API, en las tres tablas.
  if exists (
    select 1
    from (values ('anon'), ('authenticated')) as r(rol)
    cross join (values ('salas'), ('butacas'), ('funciones')) as t(tabla)
    cross join (values ('insert'), ('update'), ('delete')) as p(privilegio)
    where has_table_privilege(r.rol, 'public.' || t.tabla, p.privilegio)
  ) then
    raise exception 'Algun rol de la API puede escribir salas, butacas o funciones';
  end if;

  if has_function_privilege('anon', 'public.crear_sala(text)', 'execute')
     or has_function_privilege('anon', 'public.dar_de_baja_funcion(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.generar_butacas_sala(uuid)', 'execute')
     or has_function_privilege(
          'authenticated',
          'public.programar_funciones(uuid, date, date, smallint[], time, public.formato_funcion, public.idioma_funcion, numeric, uuid)',
          'execute'
        ) then
    raise exception 'Una funcion quedo con un EXECUTE que no corresponde';
  end if;

  if not has_function_privilege('authenticated', 'public.crear_sala(text)', 'execute') then
    raise exception 'authenticated no puede ejecutar crear_sala';
  end if;

  raise notice 'Salas, butacas y funciones: lectura publica, escritura solo por RPC.';
end;
$$;
