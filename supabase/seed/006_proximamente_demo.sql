-- Seed 006 — Próximamente y preventa para la demo (RF-08, RF-42, RF-49)
--
-- Requiere 0025 y los seeds 001 a 004. Las fechas de estreno del seed 003 son relativas al día
-- en que se cargó, así que con el paso de los días la demo puede quedarse sin ninguna película en
-- preventa. Este seed deja, relativo a HOY, los tres estados de Próximamente:
--
--   1. "Tres veranos" EN PREVENTA: estreno en 4 días, precio especial, funciones desde el
--      estreno. Se puede comprar ya, a precio de preventa.
--   2. "La última función" con PREVENTA QUE TODAVÍA NO ABRIÓ: estreno en 10 días, la venta abre
--      en 3. Es la que sirve para mostrar la alerta de estreno (RF-42).
--   3. "Ecos de medianoche" SIN PREVENTA: estreno lejano; la venta abre el día del estreno.
--
-- Las dos primeras las crea este seed: no se reusan películas del seed 003 porque esas ya pueden
-- tener funciones programadas desde el panel, y moverles el estreno las dejaría antes del estreno.
--
-- Es idempotente: se puede volver a correr (por ejemplo, la mañana de la defensa). Si una película
-- ya está en el estado que se busca, no se toca, y nunca se mueve el estreno de una película con
-- funciones programadas.
--
-- Usa programar_funciones() y no crear_funciones(), por lo mismo que el seed 004: el editor SQL
-- corre como postgres, sin sesión de administrador.

do $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_veranos uuid;
  v_ultima uuid;
  v_ecos uuid;
  v_hora time;
  v_resultado jsonb;
  v_programada boolean := false;
begin
  select id into v_ecos from public.peliculas where titulo = 'Ecos de medianoche';

  if v_ecos is null then
    raise exception 'Falta la película "Ecos de medianoche" del seed 003';
  end if;

  -- ── 1. En preventa, con funciones desde el estreno ─────────────────────────
  select id into v_veranos from public.peliculas where titulo = 'Tres veranos';

  if v_veranos is null then
    insert into public.peliculas (titulo, sinopsis, duracion_minutos, restriccion_edad,
                                  fecha_estreno, destacada, precio_preventa)
    values ('Tres veranos',
            'Tres hermanas vuelven a la casa de la costa donde pasaban las vacaciones de chicas, '
            'para venderla. Cada verano que recuerdan cuenta una versión distinta de lo que pasó.',
            112, 13, v_hoy + 4, false, 3500)
    returning id into v_veranos;

    insert into public.peliculas_generos (pelicula_id, genero_id)
    select v_veranos, g.id from public.generos g where g.slug = 'drama';
  end if;

  if not exists (
    select 1 from public.peliculas p
     where p.id = v_veranos and p.precio_preventa is not null
       and v_hoy >= p.preventa_desde and v_hoy < p.fecha_estreno
       and exists (select 1 from public.funciones f
                    where f.pelicula_id = p.id and f.activa and f.inicio > now())
  ) then
    -- Con funciones ya programadas no se le mueve el estreno: quedarían antes del estreno
    if exists (select 1 from public.funciones where pelicula_id = v_veranos and activa) then
      raise exception '"Tres veranos" tiene funciones y ya no está en preventa (¿pasó su estreno?). '
        'Para rearmar la demo: update public.funciones set activa = false where pelicula_id = ''%'';',
        v_veranos;
    end if;

    update public.peliculas
       set fecha_estreno = v_hoy + 4, precio_preventa = coalesce(precio_preventa, 3500)
     where id = v_veranos;

    -- Un horario que no choque con la grilla del seed 004 (15, 18 y 21 h, dos salas cada uno).
    -- Si la sala no alcanza, el todo o nada devuelve ok = false y se prueba el siguiente.
    foreach v_hora in array array['19:30', '16:30', '22:45']::time[] loop
      v_resultado := public.programar_funciones(
        v_veranos, v_hoy + 4, v_hoy + 10, array[1, 2, 3, 4, 5, 6, 7]::smallint[],
        v_hora, '2D', 'castellano', 6500
      );
      if (v_resultado ->> 'ok')::boolean then
        v_programada := true;
        exit;
      end if;
    end loop;

    if not v_programada then
      raise exception 'No hubo sala libre para las funciones de "Tres veranos": %', v_resultado -> 'sin_sala';
    end if;
  end if;

  -- ── 2. Preventa anunciada que todavía no abrió ─────────────────────────────
  select id into v_ultima from public.peliculas where titulo = 'La última función';

  if v_ultima is null then
    insert into public.peliculas (titulo, sinopsis, duracion_minutos, restriccion_edad,
                                  fecha_estreno, destacada, precio_preventa)
    values ('La última función',
            'La noche antes de que demuelan el cine de su barrio, el proyectorista junta a los '
            'últimos espectadores para pasar una película que nadie terminó de ver nunca.',
            108, 0, v_hoy + 10, false, 3200)
    returning id into v_ultima;

    insert into public.peliculas_generos (pelicula_id, genero_id)
    select v_ultima, g.id from public.generos g where g.slug in ('drama', 'comedia');
  elsif (select v_hoy >= preventa_desde or precio_preventa is null
           from public.peliculas where id = v_ultima)
        and not exists (select 1 from public.funciones where pelicula_id = v_ultima and activa) then
    update public.peliculas set fecha_estreno = v_hoy + 10, precio_preventa = 3200
     where id = v_ultima;
  end if;

  -- ── 3. Sin preventa, estreno lejano ────────────────────────────────────────
  update public.peliculas
     set fecha_estreno = v_hoy + 30, precio_preventa = null
   where id = v_ecos
     and (fecha_estreno is null or fecha_estreno <= v_hoy + 7 or precio_preventa is not null)
     and not exists (select 1 from public.funciones where pelicula_id = v_ecos and activa);
end;
$$;

-- Comprobación: los tres estados existen hoy. Cada condición mira el caso que dejaría la demo sin
-- algo que mostrar.
do $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_en_preventa int;
  v_por_abrir int;
  v_sin_preventa int;
begin
  select count(*) into v_en_preventa
    from public.peliculas p
   where p.precio_preventa is not null and v_hoy >= p.preventa_desde and v_hoy < p.fecha_estreno
     and exists (select 1 from public.funciones f
                  where f.pelicula_id = p.id and f.activa and f.inicio > now());
  if v_en_preventa < 1 then
    raise exception 'No quedó ninguna película en preventa con funciones';
  end if;

  select count(*) into v_por_abrir
    from public.peliculas p
   where p.precio_preventa is not null and v_hoy < p.preventa_desde;
  if v_por_abrir < 1 then
    raise exception 'No quedó ninguna preventa por abrir para mostrar la alerta';
  end if;

  select count(*) into v_sin_preventa
    from public.peliculas p
   where p.precio_preventa is null and p.fecha_estreno > v_hoy;
  if v_sin_preventa < 1 then
    raise exception 'No quedó ninguna película futura sin preventa';
  end if;

  raise notice 'Próximamente: % en preventa, % por abrir, % sin preventa.',
    v_en_preventa, v_por_abrir, v_sin_preventa;
end;
$$;
