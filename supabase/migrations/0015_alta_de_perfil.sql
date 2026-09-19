-- 0015 — Alta automática del perfil al registrarse (RF-38, D3-05)
--
-- Por qué un trigger y no una llamada del cliente después del signUp:
-- serían dos operaciones separadas y sin transacción común. Una pestaña cerrada
-- entre medio, un corte de red o un error de validación dejarían una cuenta en
-- auth.users sin fila en perfiles — un usuario que puede iniciar sesión y para el
-- que la app no tiene nombre, rol ni fecha de nacimiento. Con el trigger, la
-- cuenta y sus dos filas nacen dentro de la misma transacción: o están las tres,
-- o no está ninguna.
--
-- Los siete campos de RF-38 llegan en raw_user_meta_data, que es lo que el cliente
-- manda en signUp({ email, password, options: { data: { ... } } }).
--
-- SECURITY DEFINER porque corre con la identidad de quien se está registrando, que
-- todavía no tiene permiso sobre `perfiles` — y porque el dueño de las tablas no
-- está sujeto a RLS, que es lo que le permite insertar sin una política de INSERT.

create or replace function public.alta_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datos jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- Si falta un dato obligatorio se aborta el registro entero. La alternativa
  -- —crear el perfil a medias— dejaría una cuenta que la app no sabe mostrar.
  -- La pantalla de registro valida los siete campos antes de llamar a signUp, así
  -- que acá solo llega quien golpea la API por fuera de la aplicación.
  if v_datos ->> 'nombre' is null
     or v_datos ->> 'apellido' is null
     or v_datos ->> 'fecha_nacimiento' is null then
    raise exception 'Faltan datos obligatorios del registro (RF-38)';
  end if;

  insert into public.perfiles (id, email, nombre, apellido, fecha_nacimiento)
  values (
    new.id,
    new.email,
    trim(v_datos ->> 'nombre'),
    trim(v_datos ->> 'apellido'),
    (v_datos ->> 'fecha_nacimiento')::date
  );

  -- El rol NO sale de los metadatos: sale del default 'cliente' de la tabla. Si se
  -- leyera de acá, bastaría con mandar {"rol":"admin"} en el signUp para nacer
  -- administrador. Promover a alguien es un acto administrativo (ver README).

  insert into public.perfiles_sensibles (perfil_id, tipo_sangre, color_ojos, dias_vacaciones)
  values (
    new.id,
    v_datos ->> 'tipo_sangre',
    v_datos ->> 'color_ojos',
    (v_datos ->> 'dias_vacaciones')::smallint
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.alta_de_perfil();
