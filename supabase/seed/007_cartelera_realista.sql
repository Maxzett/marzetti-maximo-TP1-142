-- Seed 007 — Cartelera realista: 8 en cartel, 4 en Próximamente (revisión R2, bloque 6)
--
-- Requiere 0028 y los seeds 001 a 006. Reemplaza al 006 como el seed que se vuelve a correr la
-- mañana de la defensa: deja, relativo a HOY, una cartelera como la de un cine de verdad.
--
-- Cómo funciona un cine y cómo lo copia este seed:
--
--   · Los estrenos son los jueves. Las 8 películas en cartel se estrenaron escalonadas en los
--     últimos cuatro jueves, y cada una se exhibe entre 4 y 6 semanas (de jueves a miércoles).
--     Sale de cartel sola cuando pasa su última función (en_cartelera, 0028).
--   · Las 4 de Próximamente se estrenan en los jueves que vienen: una ya en preventa, dos con la
--     preventa anunciada que todavía no abrió (para mostrar la alerta de estreno) y una sin
--     preventa, que sale a la venta el día del estreno.
--   · "Un domingo cualquiera en Boedo" y "Sombras en el altiplano" ya cumplieron su ciclo: estreno
--     de hace meses y ninguna función por delante. No aparecen ni en cartelera ni en Próximamente.
--   · La programación sale de una grilla por sala: matiné de animación (solo en castellano, el
--     público es chico), acción y ciencia ficción en 2D, 3D y 4D con copias subtituladas, terror
--     en trasnoche, y funciones de la mañana los sábados y domingos. Se programan tres semanas.
--
-- Qué no toca:
--
--   · Una función con entradas vendidas, reservas en curso o una orden pendiente no se da de baja
--     ni se mueve: es lo que la gente compró. Si choca con la grilla nueva, la grilla cede (esa
--     función de la grilla no se crea) y se informa cuántas quedaron afuera.
--   · Ningún estreno queda después de una función que siga en pie: la fecha objetivo se adelanta
--     hasta el día de la primera, igual que exige guardar_pelicula() (0025).
--
-- Es idempotente: al volver a correrlo da de baja la programación sin ventas que él mismo creó y
-- la vuelve a armar desde hoy. Las bajas son lógicas (activa = false), como la de RF-23.
--
-- La sala la elige buscar_sala_libre(), la misma función que usa programar_funciones() para
-- asignar sala (RF-21). No se llama a programar_funciones() porque registraría cientos de altas
-- en el log de actividad a nombre de nadie: el log es para lo que hace una persona (RN-12).
-- Las funciones se asignan en orden de inicio, que es lo que garantiza que si en cada momento hay
-- como mucho tantas funciones como salas, todas encuentran lugar. La constraint EXCLUDE de 0006
-- sigue siendo la red final.

create temp table plan_peliculas (
  titulo text primary key,
  estreno date not null,
  semanas integer not null,
  preventa numeric(10, 2)
) on commit drop;

create temp table grilla (
  hora time not null,
  titulo text not null,
  formato public.formato_funcion not null,
  idioma public.idioma_funcion not null,
  -- 'todos' los días, o solo el 'finde' (sábado y domingo)
  dias text not null check (dias in ('todos', 'finde'))
) on commit drop;

do $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  -- El último jueves antes de hoy (isodow 4). Si hoy es jueves, el de la semana pasada: así el
  -- plan es el mismo corriéndolo el martes, el miércoles o el jueves de la misma semana.
  v_jueves date;
  v_proximo date;
  v_faltantes text[];
begin
  v_jueves := v_hoy - coalesce(nullif((extract(isodow from v_hoy)::int - 4 + 7) % 7, 0), 7);
  v_proximo := v_jueves + 7;

  insert into plan_peliculas (titulo, estreno, semanas, preventa) values
    -- En cartel, del estreno más viejo al más nuevo
    ('Noche de marquesina',            v_jueves - 21, 6, null),
    ('Mar de cenizas',                 v_jueves - 14, 6, null),
    ('Pequeño Lucero',                 v_jueves - 14, 5, null),
    ('El faro de los que no vuelven',  v_jueves - 7,  4, null),
    ('La casa del lago seco',          v_jueves - 7,  5, null),
    ('Fuego cruzado en Barracas',      v_jueves - 7,  5, null),
    ('Protocolo Ícaro',                v_jueves,      5, null),
    ('Tres pasos atrás',               v_jueves,      4, null),
    -- Próximamente, un estreno por jueves
    ('Tres veranos',                   v_proximo + 7,  4, 3500),
    ('Cielo de papel',                 v_proximo + 14, 4, 3500),
    ('La última función',              v_proximo + 21, 4, 3200),
    ('Ecos de medianoche',             v_proximo + 28, 4, null),
    -- Ya salieron de cartel
    ('Un domingo cualquiera en Boedo', v_jueves - 70, 4, null),
    ('Sombras en el altiplano',        v_jueves - 84, 4, null);

  select array_agg(pl.titulo order by pl.titulo) into v_faltantes
    from plan_peliculas pl
   where not exists (select 1 from public.peliculas p where p.titulo = pl.titulo);

  if v_faltantes is not null then
    raise exception 'Faltan películas de los seeds 003 y 006: %', array_to_string(v_faltantes, ', ');
  end if;
end;
$$;

-- La grilla de un día. Cada bloque es una sala y sus horarios no se pisan contando los 30
-- minutos de limpieza (RN-01); es la prueba de que en ningún momento hacen falta más de 4 salas.
-- Las filas de "Pequeño Lucero" y "Cielo de papel" comparten horario: una termina su ciclo antes
-- de que se estrene la otra, y la matiné pasa de una película a la otra.
insert into grilla (hora, titulo, formato, idioma, dias) values
  -- Sala de la matiné
  ('11:45', 'Pequeño Lucero',                '2D', 'castellano',  'finde'),
  ('11:45', 'Cielo de papel',                '2D', 'castellano',  'finde'),
  ('14:00', 'Pequeño Lucero',                '2D', 'castellano',  'todos'),
  ('14:00', 'Cielo de papel',                '2D', 'castellano',  'todos'),
  ('16:10', 'Pequeño Lucero',                '3D', 'castellano',  'todos'),
  ('16:10', 'Cielo de papel',                '3D', 'castellano',  'todos'),
  ('18:20', 'Tres pasos atrás',              '2D', 'castellano',  'todos'),
  ('20:40', 'El faro de los que no vuelven', '2D', 'castellano',  'todos'),
  ('23:00', 'La casa del lago seco',         '2D', 'subtitulada', 'todos'),
  -- Sala de los tanques
  ('11:00', 'Tres veranos',                  '2D', 'castellano',  'finde'),
  ('13:30', 'Mar de cenizas',                '2D', 'castellano',  'todos'),
  ('16:20', 'Protocolo Ícaro',               '2D', 'castellano',  'todos'),
  ('19:20', 'Mar de cenizas',                '3D', 'subtitulada', 'todos'),
  ('22:10', 'Protocolo Ícaro',               '4D', 'subtitulada', 'todos'),
  -- Tercera sala
  ('11:00', 'Tres pasos atrás',              '2D', 'castellano',  'finde'),
  ('13:30', 'Noche de marquesina',           '2D', 'castellano',  'todos'),
  ('16:00', 'Fuego cruzado en Barracas',     '2D', 'castellano',  'todos'),
  ('18:40', 'La casa del lago seco',         '2D', 'subtitulada', 'todos'),
  ('21:00', 'Fuego cruzado en Barracas',     '4D', 'castellano',  'todos'),
  ('23:40', 'El faro de los que no vuelven', '2D', 'subtitulada', 'todos'),
  -- Cuarta sala
  ('13:00', 'Tres pasos atrás',              '2D', 'castellano',  'todos'),
  ('15:20', 'Protocolo Ícaro',               '2D', 'subtitulada', 'todos'),
  ('18:20', 'Tres veranos',                  '2D', 'castellano',  'todos'),
  ('20:50', 'Noche de marquesina',           '2D', 'castellano',  'todos'),
  ('23:20', 'Mar de cenizas',                '4D', 'subtitulada', 'todos');

do $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_hasta date;
  v_bajas integer;
  v_candidata record;
  v_sala uuid;
  v_creadas integer := 0;
  v_sin_sala integer := 0;
begin
  -- Tres semanas de programación publicada, hasta un miércoles: la semana de cine va de jueves
  -- a miércoles.
  select max(pl.estreno) filter (where pl.estreno <= v_hoy) + 7 + 20 into v_hasta
    from plan_peliculas pl;

  -- ── 1. Baja de la programación sin ventas ──────────────────────────────────
  -- Las que están por delante, y también las que ya pasaron pero caen antes del estreno nuevo:
  -- una película de Próximamente no puede tener funciones que ya se dieron (el estreno se
  -- adelantaría al pasado en el paso 2).
  update public.funciones f
     set activa = false
   where f.activa
     and (f.inicio > now()
          or (f.inicio at time zone 'America/Argentina/Buenos_Aires')::date < (
               select pl.estreno
                 from plan_peliculas pl
                 join public.peliculas p on p.titulo = pl.titulo
                where p.id = f.pelicula_id))
     and not exists (select 1 from public.butacas_ordenes bo where bo.funcion_id = f.id)
     and not exists (select 1 from public.holds_butacas h where h.funcion_id = f.id)
     and not exists (select 1 from public.ordenes o
                      where o.funcion_id = f.id and o.estado = 'pendiente');
  get diagnostics v_bajas = row_count;

  -- ── 2. Estrenos y preventa ─────────────────────────────────────────────────
  -- least() ignora el nulo: sin funciones en pie, la fecha objetivo queda tal cual.
  update public.peliculas p
     set fecha_estreno = least(
           pl.estreno,
           (select min((f.inicio at time zone 'America/Argentina/Buenos_Aires')::date)
              from public.funciones f
             where f.pelicula_id = p.id and f.activa)
         ),
         precio_preventa = pl.preventa
    from plan_peliculas pl
   where p.titulo = pl.titulo;

  -- ── 3. La grilla, día por día, en orden de inicio ──────────────────────────
  for v_candidata in
    select p.id as pelicula_id,
           p.duracion_minutos,
           ((d::date + g.hora) at time zone 'America/Argentina/Buenos_Aires') as inicio,
           g.formato,
           g.idioma,
           case g.formato when '3D' then 8200 when '4D' then 10900 else 6500 end as precio
      from grilla g
      join public.peliculas p on p.titulo = g.titulo
      join plan_peliculas pl on pl.titulo = g.titulo
     cross join generate_series(v_hoy::timestamp, v_hasta::timestamp, interval '1 day') as d
     where d::date >= p.fecha_estreno
       -- El ciclo cuenta desde el estreno real, que pudo adelantarse en el paso 2
       and d::date < p.fecha_estreno + pl.semanas * 7
       and (g.dias = 'todos' or extract(isodow from d) in (6, 7))
       -- Nada que empiece dentro de la próxima media hora: no daría tiempo a comprar
       and ((d::date + g.hora) at time zone 'America/Argentina/Buenos_Aires') > now() + interval '30 minutes'
     order by 3, p.duracion_minutos desc
  loop
    -- Una función vendida que quedó en pie en el mismo horario ya es esta función
    if exists (select 1 from public.funciones f
                where f.pelicula_id = v_candidata.pelicula_id
                  and f.activa
                  and f.inicio = v_candidata.inicio) then
      continue;
    end if;

    v_sala := public.buscar_sala_libre(
      tstzrange(v_candidata.inicio,
                v_candidata.inicio + make_interval(mins => v_candidata.duracion_minutos + 30),
                '[)')
    );

    if v_sala is null then
      v_sin_sala := v_sin_sala + 1;
      continue;
    end if;

    insert into public.funciones (pelicula_id, sala_id, inicio, formato, idioma, precio_base)
    values (v_candidata.pelicula_id, v_sala, v_candidata.inicio,
            v_candidata.formato, v_candidata.idioma, v_candidata.precio);

    v_creadas := v_creadas + 1;
  end loop;

  if v_creadas = 0 then
    raise exception 'El seed no programó ninguna función: ¿están cargados los seeds 001 y 003?';
  end if;

  raise notice 'Programación: % funciones sin ventas dadas de baja, % creadas hasta el %, % sin sala (chocaban con funciones vendidas).',
    v_bajas, v_creadas, to_char(v_hasta, 'DD/MM'), v_sin_sala;
end;
$$;

-- Comprobación: la cartelera quedó como se pidió. Cada condición es algo que la demo necesita
-- mostrar; si alguna falla, el editor deshace el archivo entero y la base queda como estaba.
do $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_en_cartelera integer;
  v_proximas integer;
  v_en_preventa integer;
  v_por_abrir integer;
  v_sin_preventa integer;
  v_fuera text;
begin
  select count(*) into v_en_cartelera from public.peliculas p where public.en_cartelera(p);
  if v_en_cartelera <> 8 then
    raise exception 'Se esperaban 8 películas en cartelera y hay %', v_en_cartelera;
  end if;

  select count(*) into v_proximas from public.peliculas where fecha_estreno > v_hoy;
  if v_proximas <> 4 then
    raise exception 'Se esperaban 4 películas en Próximamente y hay %', v_proximas;
  end if;

  select count(*) into v_en_preventa
    from public.peliculas p
   where p.precio_preventa is not null and v_hoy >= p.preventa_desde and v_hoy < p.fecha_estreno
     and exists (select 1 from public.funciones f
                  where f.pelicula_id = p.id and f.activa and f.inicio > now());
  if v_en_preventa < 1 then
    raise exception 'No quedó ninguna película en preventa con funciones para vender';
  end if;

  select count(*) into v_por_abrir
    from public.peliculas p
   where p.precio_preventa is not null and v_hoy < p.preventa_desde;
  if v_por_abrir < 1 then
    raise exception 'No quedó ninguna preventa por abrir para mostrar la alerta de estreno';
  end if;

  select count(*) into v_sin_preventa
    from public.peliculas p
   where p.precio_preventa is null and p.fecha_estreno > v_hoy;
  if v_sin_preventa < 1 then
    raise exception 'No quedó ninguna película de Próximamente sin preventa';
  end if;

  -- Las que salieron de cartel no pueden seguir apareciendo en ningún lado
  select string_agg(p.titulo, ', ') into v_fuera
    from public.peliculas p
   where p.titulo in ('Un domingo cualquiera en Boedo', 'Sombras en el altiplano')
     and (public.en_cartelera(p) or p.fecha_estreno > v_hoy);
  if v_fuera is not null then
    raise exception 'Siguen visibles películas que debían salir de cartel: %', v_fuera;
  end if;

  raise notice 'Cartelera: % en cartel, % próximas (% en preventa, % por abrir, % sin preventa).',
    v_en_cartelera, v_proximas, v_en_preventa, v_por_abrir, v_sin_preventa;
end;
$$;
