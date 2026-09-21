-- Seed 004 — Funciones de demostración (RF-19 a RF-21)
--
-- Requiere 0019 y los seeds 001 y 003. Programa los próximos 14 días con seis películas
-- de la cartelera, dos por horario (15:00, 18:00 y 21:00), todos los días. Es lo que
-- necesita la F6 para tener qué comprar, y lo que permite dejar la demo lista de nuevo
-- si hay que recrear el proyecto.
--
-- Llama a programar_funciones() y no a crear_funciones(): el editor SQL corre como
-- `postgres`, sin sesión de nadie, y crear_funciones() exige ser administrador. Es
-- justamente para esto que el algoritmo está separado de la puerta de entrada.
--
-- Las fechas son relativas al día de carga. Dos películas por horario en cuatro salas
-- dejan margen aunque una función larga se derrame sobre el horario siguiente, así que
-- el todo o nada no debería rechazar nada: si lo hace, el seed falla y lo dice.
--
-- No es idempotente: volver a correrlo choca contra sus propias funciones y, por el
-- todo o nada, no agrega ninguna. Para reiniciar la demo, dar de baja las funciones
-- primero (update public.funciones set activa = false where inicio > now();).

do $$
declare
  v_pelicula record;
  v_resultado jsonb;
  v_hora time;
  v_creadas integer := 0;
  -- Un horario por cada par de películas: la primera y la segunda a las 15:00, etc.
  v_horas time[] := array['15:00', '15:00', '18:00', '18:00', '21:00', '21:00']::time[];
  -- Mañana y no hoy: un horario de hoy ya podría haber pasado según la hora de carga.
  v_desde date := (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1;
begin
  for v_pelicula in
    select p.id, p.titulo, row_number() over (order by p.titulo) as n
    from public.peliculas p
    where p.fecha_estreno is null
       or p.fecha_estreno <= (now() at time zone 'America/Argentina/Buenos_Aires')::date
    order by p.titulo
    limit 6
  loop
    v_hora := v_horas[v_pelicula.n::integer];

    v_resultado := public.programar_funciones(
      v_pelicula.id,
      v_desde,
      v_desde + 13,
      array[1, 2, 3, 4, 5, 6, 7]::smallint[],
      v_hora,
      '2D',
      'castellano',
      6500
    );

    if not (v_resultado ->> 'ok')::boolean then
      raise exception 'No se pudo programar "%": %', v_pelicula.titulo, v_resultado -> 'sin_sala';
    end if;

    v_creadas := v_creadas + jsonb_array_length(v_resultado -> 'creadas');
  end loop;

  -- Cero funciones no es "salió bien": es que no había películas en cartelera.
  if v_creadas = 0 then
    raise exception 'El seed no creó ninguna función: ¿está cargado el seed 003?';
  end if;

  raise notice 'Funciones de demo creadas: %.', v_creadas;
end;
$$;
