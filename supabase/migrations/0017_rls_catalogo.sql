-- 0017 — Catálogo público y funciones de portada (RF-02, RF-04, RF-06, RF-11, RNF-09)
--
-- El catálogo lo ve cualquiera, con o sin cuenta: la compra anónima (RF-26) tiene
-- que poder mostrar la cartelera. Es lectura y nada más. No hay política de
-- INSERT, UPDATE ni DELETE, así que las tres tablas siguen cerradas a escritura
-- para todos los roles hasta que la F9 construya el panel de administración.
--
-- Igual que en 0016, hacen falta las dos capas: el GRANT y la política. La política
-- `using (true)` es deliberada y es lo que declara "esta tabla es pública": un
-- `enable row level security` sin política es lo contrario, y el linter no
-- distingue una omisión de una decisión.

grant select on public.generos to anon, authenticated;
grant select on public.peliculas to anon, authenticated;
grant select on public.peliculas_generos to anon, authenticated;

create policy generos_select_publico on public.generos
  for select to anon, authenticated
  using (true);

create policy peliculas_select_publico on public.peliculas
  for select to anon, authenticated
  using (true);

create policy peliculas_generos_select_publico on public.peliculas_generos
  for select to anon, authenticated
  using (true);

-- ── Top de ventas (RF-04) ───────────────────────────────────────────────────
--
-- Necesita contar filas de `ordenes` y `butacas_ordenes`, que ningún rol de la API
-- puede leer (y no deben poder: son las compras de todos). SECURITY DEFINER hace
-- que la función corra con los permisos de su dueño y devuelva solo el agregado:
-- qué película y cuántas entradas, sin una sola fila de orden.
--
-- `search_path = ''` por el mismo motivo que en es_admin() (0013): sin él, alguien
-- con permiso de crear esquemas podría anteponer un `ordenes` falso.
--
-- Parte de `peliculas` con LEFT JOIN y no de las ventas: hasta la F6 no hay una sola
-- orden, y la portada tiene que mostrar tres películas igual. Con 0 ventas empatan
-- todas, y el desempate (destacada, estreno más nuevo, título) hace que el
-- resultado sea siempre el mismo y no dependa del orden en que Postgres las lea.
--
-- La cartelera se mide en hora de Buenos Aires: el servidor corre en UTC y entre las
-- 21:00 y la medianoche argentina el `current_date` de Postgres ya es mañana.
-- Una película con estreno futuro (incluida la preventa) es de Próximamente y no
-- compite por el top.

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
  where p.fecha_estreno is null
     or p.fecha_estreno <= (now() at time zone 'America/Argentina/Buenos_Aires')::date
  group by p.id
  order by count(bo.id) desc, p.destacada desc, p.fecha_estreno desc nulls last, p.titulo
  limit least(greatest(p_limite, 0), 50);
$$;

-- ── Puntaje promedio (RF-11) ────────────────────────────────────────────────
--
-- Las reseñas no se leen directo (0018), así que el promedio también sale de una
-- función definer. Devuelve solo el agregado, una fila por película que tenga al
-- menos una reseña; el cliente trata la ausencia como "sin puntuar".

create or replace function public.puntajes_peliculas()
returns table (pelicula_id uuid, promedio numeric, cantidad int)
language sql
stable
security definer
set search_path = ''
as $$
  select r.pelicula_id, round(avg(r.estrellas)::numeric, 1), count(*)::int
  from public.resenas r
  group by r.pelicula_id;
$$;

-- Postgres le da EXECUTE a PUBLIC a toda función nueva. Se saca de todos lados y se
-- otorga a los dos roles de la API de forma explícita: la lista de quién puede
-- llamarla queda escrita en el archivo, no heredada de un default.
revoke all on function public.peliculas_mas_vendidas(int) from public, anon, authenticated;
revoke all on function public.puntajes_peliculas() from public, anon, authenticated;
grant execute on function public.peliculas_mas_vendidas(int) to anon, authenticated;
grant execute on function public.puntajes_peliculas() to anon, authenticated;

-- Comprobación: si falta algún privilegio o alguna política, la migración falla acá
-- en vez de descubrirse como una cartelera vacía.
do $$
declare
  v_sin_privilegio text[];
  v_politicas int;
begin
  select array_agg(t.tabla order by t.tabla) into v_sin_privilegio
  from (values ('generos'), ('peliculas'), ('peliculas_generos')) as t(tabla)
  where not has_table_privilege('anon', 'public.' || t.tabla, 'select');

  if v_sin_privilegio is not null then
    raise exception 'anon no puede leer: %', array_to_string(v_sin_privilegio, ', ');
  end if;

  select count(*) into v_politicas
  from pg_policies
  where schemaname = 'public'
    and tablename in ('generos', 'peliculas', 'peliculas_generos')
    and cmd = 'SELECT';

  if v_politicas <> 3 then
    raise exception 'Se esperaban 3 politicas de lectura del catalogo y hay %', v_politicas;
  end if;

  if not has_function_privilege('anon', 'public.peliculas_mas_vendidas(int)', 'execute')
     or not has_function_privilege('anon', 'public.puntajes_peliculas()', 'execute') then
    raise exception 'anon no puede ejecutar las funciones del catalogo';
  end if;

  raise notice 'Catalogo abierto a lectura publica.';
end;
$$;
