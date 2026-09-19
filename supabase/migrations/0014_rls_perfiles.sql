-- 0014 — Políticas de perfiles y datos sensibles (RF-38.1, RNF-09, RNF-11)
--
-- En todas las políticas se escribe `(select auth.uid())` y no `auth.uid()` a
-- secas. Con el subselect, Postgres evalúa la función una sola vez por consulta;
-- sin él, la evalúa una vez por fila. Es el aviso `auth_rls_initplan` del advisor
-- de rendimiento de Supabase.

-- ── perfiles ────────────────────────────────────────────────────────────────

-- El titular ve su perfil.
create policy perfiles_select_propio on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()));

-- El administrador ve todos: los necesita para resolver los nombres del log de
-- actividad (RF-61) y para listar usuarios en su panel (F9). Ve nombre, apellido
-- y rol — nunca los datos sensibles, que están en la otra tabla.
create policy perfiles_select_admin on public.perfiles
  for select to authenticated
  using (public.es_admin());

-- El titular edita su fila. Las columnas que puede tocar las limita el GRANT de
-- 0013: nombre, apellido y fecha de nacimiento. El rol no está en esa lista.
-- WITH CHECK repite la condición para que no pueda reasignar la fila a otro id.
create policy perfiles_update_propio on public.perfiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No hay política de INSERT ni de DELETE, para ningún rol. El alta la hace el
-- trigger de 0015 y la baja la arrastra el borrado de la cuenta en auth.users.

-- ── perfiles_sensibles ──────────────────────────────────────────────────────
--
-- UNA sola política, y esa ausencia de las demás ES el requerimiento. No existe
-- política de admin ni de empleado: tipo de sangre, color de ojos y días de
-- vacaciones no los lee nadie más que su titular (RF-38.1, RNF-11, D-04).
-- La prueba de que funciona es que el admin, autenticado y con todos los permisos
-- del panel, recibe una lista vacía al consultar esta tabla.

create policy sensibles_solo_titular on public.perfiles_sensibles
  for all to authenticated
  using (perfil_id = (select auth.uid()))
  with check (perfil_id = (select auth.uid()));
