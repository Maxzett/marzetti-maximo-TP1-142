-- 0018 — Reseñas: escritura propia y lectura pública por función (RF-09, RF-10, RNF-09)
--
-- Las reseñas las ve cualquiera, incluso quien no tiene cuenta (RF-10: son visibles
-- antes de iniciar la compra), pero la tabla NO se abre a lectura pública. Mostrar
-- "Ana G." exige leer `perfiles`, y `perfiles` es privado (0014). Abrir `resenas`
-- con `using (true)` obligaría a que el cliente cruce las dos tablas, y nadie salvo
-- el administrador puede leer la segunda. La salida es una función SECURITY DEFINER
-- que hace el cruce y devuelve solo lo que se muestra: estrellas, comentario, fecha
-- y un nombre abreviado. No devuelve el mail, ni el apellido entero, ni el id del
-- perfil de otra persona.
--
-- Se descartó una view: por defecto corre con los permisos de su dueño, y el advisor
-- de Supabase la marca como `security_definer_view` (nivel ERROR). Una función con
-- search_path fijado y EXECUTE explícito es la misma idea, pero visible y acotada.

-- ── Escritura: solo lo propio ───────────────────────────────────────────────
--
-- Los privilegios van por columna, con el mismo criterio que 0013. Un cliente puede
-- elegir a qué película opina y qué escribe; no puede fijar `creado_at` ni mover una
-- reseña existente a otra película, porque `pelicula_id` no está en el UPDATE.
--
-- Nada para `anon`: opinar exige cuenta.

grant select on public.resenas to authenticated;
grant insert (pelicula_id, perfil_id, estrellas, comentario) on public.resenas to authenticated;
grant update (estrellas, comentario) on public.resenas to authenticated;
grant delete on public.resenas to authenticated;

-- El SELECT es solo de la fila propia: alcanza para que la pantalla sepa si ya
-- reseñó y precargue el formulario. Las de los demás llegan por la función de abajo.
create policy resenas_select_propia on public.resenas
  for select to authenticated
  using (perfil_id = (select auth.uid()));

-- WITH CHECK es lo que impide reseñar en nombre de otro: el `perfil_id` que llega en
-- el INSERT tiene que ser el del token, no el que mande el cliente.
create policy resenas_insert_propia on public.resenas
  for insert to authenticated
  with check (perfil_id = (select auth.uid()));

create policy resenas_update_propia on public.resenas
  for update to authenticated
  using (perfil_id = (select auth.uid()))
  with check (perfil_id = (select auth.uid()));

create policy resenas_delete_propia on public.resenas
  for delete to authenticated
  using (perfil_id = (select auth.uid()));

-- ── Lectura pública de las reseñas de una película (RF-10) ──────────────────

create or replace function public.resenas_de_pelicula(p_pelicula_id uuid)
returns table (
  id uuid,
  estrellas smallint,
  comentario text,
  creado_at timestamptz,
  autor text,
  es_propia boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.estrellas,
    r.comentario,
    r.creado_at,
    -- Nombre y la inicial del apellido: alcanza para que una reseña tenga autor sin
    -- publicar el nombre completo de nadie.
    concat_ws(' ', p.nombre, left(p.apellido, 1) || '.'),
    -- auth.uid() es NULL para el anónimo, y `x = NULL` es NULL, no false.
    coalesce(r.perfil_id = (select auth.uid()), false)
  from public.resenas r
  join public.perfiles p on p.id = r.perfil_id
  where r.pelicula_id = p_pelicula_id
  order by r.creado_at desc;
$$;

revoke all on function public.resenas_de_pelicula(uuid) from public, anon, authenticated;
grant execute on function public.resenas_de_pelicula(uuid) to anon, authenticated;

-- Comprobación: la tabla no puede quedar legible para anon, y la función sí.
do $$
begin
  if has_table_privilege('anon', 'public.resenas', 'select') then
    raise exception 'anon puede leer resenas directamente: la lectura publica es solo por la funcion';
  end if;

  if not has_function_privilege('anon', 'public.resenas_de_pelicula(uuid)', 'execute') then
    raise exception 'anon no puede ejecutar resenas_de_pelicula';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'resenas') <> 4 then
    raise exception 'resenas deberia tener 4 politicas (select, insert, update, delete propias)';
  end if;

  raise notice 'Resenas: escritura propia y lectura publica por funcion.';
end;
$$;
