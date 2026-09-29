-- 0028 — Cartelera por funciones y programación de varios horarios (RF-01, RF-04, RF-19, RF-20)
--
-- Revisión R2, bloque 6. Dos cambios:
--
-- 1. Qué es "estar en cartelera". Hasta acá era "ya se estrenó", y una película estrenada quedaba
--    en cartelera para siempre. En un cine una película dura unas semanas y sale de cartel cuando
--    pasa su última función. Ahora la regla es esa, con una sola definición (en_cartelera), que
--    usan el top 3 de la portada y la cartelera del cliente. No hace falta ningún dato nuevo que
--    mantener: la programación ya dice hasta cuándo se exhibe.
--
-- 2. Programar varios horarios de una vez. Un mes de cartelera real son varios horarios por día,
--    cada uno con su formato, idioma y precio. crear_funciones_lote() los programa en un solo
--    envío y conserva el todo o nada de RF-22 y D-05 sobre el conjunto.
--
-- Códigos de error (SQLSTATE), con mensaje en español para mostrarse tal cual:
--   42501  quien llama no es administrador
--   22023  el parámetro no es válido

-- ── En cartelera (RF-01) ────────────────────────────────────────────────────
-- Recibe la fila de `peliculas`: PostgREST la expone como una columna calculada más, así que el
-- cliente la pide en el mismo select del catálogo (`..., en_cartelera`) sin una consulta aparte.
--
-- SECURITY INVOKER a propósito: lee `funciones`, que ya tiene lectura pública de las activas
-- (0019), así que no necesita más permisos que los de quien consulta.
--
-- `inicio > now()` y no la fecha: una película sale de cartel cuando empieza su última función,
-- no a la medianoche de ese día. La fecha del estreno es la del cine, no la del servidor (UTC).
create or replace function public.en_cartelera(p public.peliculas)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p.fecha_estreno is null
          or p.fecha_estreno <= (now() at time zone 'America/Argentina/Buenos_Aires')::date)
     and exists (
       select 1
         from public.funciones f
        where f.pelicula_id = p.id
          and f.activa
          and f.inicio > now()
     );
$$;

-- ── Top 3 de la portada (RF-04) ─────────────────────────────────────────────
-- Sigue siendo histórico (cuenta todas las entradas pagadas, R1), pero solo entre las películas
-- que están en cartelera: el podio ofrece "Comprar" y los horarios de hoy, y una película que ya
-- salió de cartel no tiene ni una cosa ni la otra. `create or replace` conserva los permisos.
create or replace function public.peliculas_mas_vendidas(p_limite int default 3)
returns table (pelicula_id uuid, entradas bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, count(bo.id)
  from public.peliculas p
  left join public.funciones f on f.pelicula_id = p.id
  left join public.butacas_ordenes bo
    on bo.funcion_id = f.id
   and exists (
     select 1 from public.ordenes o
     where o.id = bo.orden_id and o.estado = 'pagada'
   )
  where public.en_cartelera(p)
  group by p.id
  order by count(bo.id) desc, p.destacada desc, p.fecha_estreno desc nulls last, p.titulo
  limit least(greatest(p_limite, 0), 50);
$$;

-- ── Varios horarios en un envío (RF-20, RF-22, D-05) ────────────────────────
-- Cada "pasada" es un horario con su formato, idioma y precio, que se repite en los mismos días
-- del mismo período: {"hora": "18:20", "formato": "3D", "idioma": "subtitulada",
-- "precio_base": 8200}. Cada pasada la programa programar_funciones(), el mismo algoritmo de
-- siempre, así que la sala la sigue eligiendo la base (RF-21) y cada función queda en el log.
--
-- Todo o nada sobre el conjunto: si alguna pasada no tiene sala en alguna fecha, no se crea
-- ninguna función de ninguna pasada. El bloque BEGIN ... EXCEPTION abre un punto de guardado; la
-- excepción de abajo lo deshace entero, las inserciones y sus registros en el log incluidos. Las
-- variables de PL/pgSQL no son transaccionales, así que los conflictos juntados sobreviven al
-- rollback y se devuelven, igual que en programar_funciones.
--
-- Se siguen evaluando las pasadas que vienen después de una que falló, para informar todos los
-- conflictos de una vez y no de a uno por intento. Cada conflicto dice a qué pasada pertenece
-- (`pasada`, desde 0, el orden en que llegaron) para que la pantalla ofrezca los horarios
-- sugeridos en la fila correcta.
create or replace function public.crear_funciones_lote(
  p_pelicula_id uuid,
  p_desde date,
  p_hasta date,
  p_dias smallint[],
  p_pasadas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_pasada jsonb;
  v_indice integer := -1;
  v_hora time;
  v_horas time[] := '{}';
  v_resultado jsonb;
  v_creadas jsonb := '[]'::jsonb;
  v_sin_sala jsonb := '[]'::jsonb;
  -- Distingue el rollback pedido acá de cualquier otro error, que tiene que seguir de largo
  v_deshacer boolean := false;
begin
  if not public.es_admin() then
    raise exception 'Solo la administración puede programar funciones' using errcode = '42501';
  end if;

  if p_pasadas is null or jsonb_typeof(p_pasadas) <> 'array' or jsonb_array_length(p_pasadas) = 0 then
    raise exception 'Agregá al menos un horario' using errcode = '22023';
  end if;

  if jsonb_array_length(p_pasadas) > 8 then
    raise exception 'Son más de 8 horarios de una vez: programalos en dos tandas' using errcode = '22023';
  end if;

  begin
    for v_pasada in select value from jsonb_array_elements(p_pasadas) loop
      v_indice := v_indice + 1;
      v_hora := nullif(v_pasada ->> 'hora', '')::time;

      -- Dos veces la misma hora sería la misma función dos veces en dos salas: casi seguro un
      -- error de carga, y la base no tiene por qué adivinar cuál de las dos se quería.
      if v_hora = any (v_horas) then
        raise exception 'El horario de las % está dos veces', left(v_hora::text, 5)
          using errcode = '22023';
      end if;
      v_horas := v_horas || v_hora;

      v_resultado := public.programar_funciones(
        p_pelicula_id, p_desde, p_hasta, p_dias, v_hora,
        (v_pasada ->> 'formato')::public.formato_funcion,
        (v_pasada ->> 'idioma')::public.idioma_funcion,
        (v_pasada ->> 'precio_base')::numeric,
        v_actor
      );

      if (v_resultado ->> 'ok')::boolean then
        v_creadas := v_creadas || coalesce(
          (select jsonb_agg(c || jsonb_build_object('pasada', v_indice))
             from jsonb_array_elements(v_resultado -> 'creadas') c),
          '[]'::jsonb);
      else
        v_sin_sala := v_sin_sala || coalesce(
          (select jsonb_agg(c || jsonb_build_object('pasada', v_indice))
             from jsonb_array_elements(v_resultado -> 'sin_sala') c),
          '[]'::jsonb);
      end if;
    end loop;

    if jsonb_array_length(v_sin_sala) > 0 then
      v_deshacer := true;
      raise exception 'Hay fechas sin sala libre';
    end if;
  exception
    when others then
      if not v_deshacer then
        raise;
      end if;
      return jsonb_build_object('ok', false, 'sin_sala', v_sin_sala);
  end;

  return jsonb_build_object('ok', true, 'creadas', v_creadas);
end;
$$;

-- Postgres le da EXECUTE a PUBLIC a toda función nueva: se saca y se otorga lo justo.
-- en_cartelera la llaman las dos claves de la API (es parte del catálogo público);
-- crear_funciones_lote solo authenticated, y adentro verifica el rol.
revoke all on function public.en_cartelera(public.peliculas) from public, anon, authenticated;
grant execute on function public.en_cartelera(public.peliculas) to anon, authenticated;

revoke all on function public.crear_funciones_lote(uuid, date, date, smallint[], jsonb) from public, anon, authenticated;
grant execute on function public.crear_funciones_lote(uuid, date, date, smallint[], jsonb) to authenticated;

-- Comprobación: si un permiso quedó mal, la migración falla acá y no como una cartelera vacía.
do $$
begin
  if not has_function_privilege('anon', 'public.en_cartelera(public.peliculas)', 'execute') then
    raise exception 'anon no puede calcular en_cartelera: la cartelera pública quedaría vacía';
  end if;

  if has_function_privilege('anon', 'public.crear_funciones_lote(uuid, date, date, smallint[], jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.crear_funciones_lote(uuid, date, date, smallint[], jsonb)', 'execute') then
    raise exception 'Los permisos de crear_funciones_lote quedaron mal';
  end if;

  raise notice 'Cartelera por funciones y programación en lote listas.';
end;
$$;
