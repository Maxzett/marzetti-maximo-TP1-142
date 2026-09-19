-- 0001 — Extensiones
--
-- btree_gist es lo que permite mezclar un tipo escalar (sala_id, que es uuid) con
-- un rango dentro de un EXCLUDE. Sin ella, la constraint de 0006 falla con
-- "data type uuid has no default operator class for access method gist".
--
-- Va en el esquema `extensions` y no en `public` porque el linter de Supabase
-- marca `extension_in_public` como aviso de seguridad: cualquier cosa en public
-- queda expuesta a través de la API.

-- El esquema ya viene creado en todo proyecto de Supabase; la línea está por si
-- alguna vez hay que levantar la base en un Postgres limpio.
create schema if not exists extensions;

create extension if not exists btree_gist with schema extensions;
