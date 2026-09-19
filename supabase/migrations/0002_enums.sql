-- 0002 — Tipos enumerados
--
-- Un enum documenta el dominio en la propia base: un valor fuera de la lista no
-- entra ni por la API ni por el editor SQL. Se usa donde la lista es cerrada y
-- estable; donde no lo es, se prefiere text + CHECK (ver perfiles_sensibles),
-- porque en Postgres un label de enum no se borra ni se renombra.

create type public.rol_usuario as enum ('cliente', 'empleado', 'admin');

-- RF-13/14/15: los tres tipos de ubicación de la sala.
create type public.tipo_ubicacion as enum ('estandar', 'silla_ruedas', 'vip');

-- RF-19: formato de proyección e idioma de la función.
create type public.formato_funcion as enum ('2D', '3D', '4D', '5D');
create type public.idioma_funcion as enum ('castellano', 'subtitulada');

-- Estados de una orden. `expirada` es terminal: es donde cae una orden pendiente
-- que superó la ventana de reserva de 10 minutos (D-08).
create type public.estado_orden as enum ('pendiente', 'pagada', 'cancelada', 'expirada');

-- Un ítem de orden es una entrada, un producto del candy o un combo (RF-34, RF-36).
create type public.tipo_item as enum ('entrada', 'producto', 'combo');

create type public.tipo_cupon as enum ('bienvenida', 'por_edad', 'general');
create type public.tipo_descuento as enum ('porcentaje', 'monto');

-- Una recompensa se canjea por una entrada gratis o por un producto (RF-46).
create type public.tipo_recompensa as enum ('entrada', 'producto');
