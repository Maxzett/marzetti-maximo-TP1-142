# Base de datos

Esquema de Postgres del sistema, en archivos SQL versionados. No se usa la CLI de
Supabase: cada archivo se pega en el **editor SQL** del proyecto, en orden. Sin
Docker ni herramientas extra, y el repo queda como plan de recuperación si hubiera
que recrear el proyecto desde cero.

## Orden de aplicación

| Archivo | Qué crea |
|---|---|
| `migrations/0001_extensiones.sql` | `btree_gist`, que habilita el `EXCLUDE` de funciones |
| `migrations/0002_enums.sql` | Tipos enumerados del dominio |
| `migrations/0003_perfiles.sql` | `perfiles` y `perfiles_sensibles` |
| `migrations/0004_catalogo.sql` | `generos`, `peliculas`, `peliculas_generos` |
| `migrations/0005_salas.sql` | `salas`, `butacas` |
| `migrations/0006_funciones.sql` | `funciones` y el no solapamiento de sala |
| `migrations/0007_candy.sql` | Categorías, productos, combos |
| `migrations/0008_ordenes.sql` | Órdenes, ítems, butacas vendidas y reservas |
| `migrations/0009_fidelizacion.sql` | Cupones, puntos, recompensas, crédito |
| `migrations/0010_social.sql` | Reseñas y alertas de estreno |
| `migrations/0011_auditoria.sql` | Log de actividad, de solo lectura |
| `migrations/0012_rls_deny_default.sql` | Verifica que ninguna tabla quedó sin RLS, y los permisos de tabla |
| `migrations/0013_helpers_rol.sql` | `es_admin()`, `es_personal()` y la protección del rol |
| `migrations/0014_rls_perfiles.sql` | Políticas de perfiles y datos sensibles |
| `migrations/0015_alta_de_perfil.sql` | Trigger de alta de perfil sobre `auth.users` |
| `migrations/0016_permisos_api.sql` | Privilegios de tabla para `authenticated` |
| `migrations/0017_rls_catalogo.sql` | Catálogo público de solo lectura, `peliculas_mas_vendidas()` y `puntajes_peliculas()` |
| `migrations/0018_resenas.sql` | Reseñas: escritura propia y `resenas_de_pelicula()` como única lectura pública |
| `seed/001_salas_y_butacas.sql` | 4 salas × 532 ubicaciones, con aserción de conteo |
| `seed/002_catalogo_base.sql` | Géneros, categorías, cupones y recompensa inicial |
| `seed/003_peliculas_demo.sql` | 12 películas inventadas (10 en cartelera, 2 próximas), con aserciones |

Si una tabla recién creada devuelve `PGRST205 Could not find the table in the
schema cache`, es el caché de PostgREST. Se refresca con:

```sql
notify pgrst, 'reload schema';
```

## Configuración del proyecto

En **Authentication → Providers → Email**, la confirmación de email queda
**desactivada** (D3-04). Con ella activa, `signUp` no devuelve sesión y el registro
se corta esperando un correo que el SMTP gratuito de Supabase limita a unos pocos
por hora.

Conviene además activar **Leaked password protection** en Authentication: es gratis
y apaga un aviso del linter de seguridad.

## Modelo de seguridad

La seguridad vive en la base (RNF-09). Los guards de Angular son ayudas de
interfaz: quien abra las DevTools habla directo con PostgREST, y ahí las únicas
reglas que corren son las políticas RLS.

- **Dos capas, no una.** Entre una petición y una fila hay un privilegio de tabla
  (`GRANT`) y después una política RLS. Los proyectos nuevos de Supabase ya no
  otorgan privilegios sobre las tablas de `public` a `anon` ni a `authenticated`,
  así que una tabla recién creada responde `42501 permission denied` a todos. Una
  política sin su `GRANT` es letra muerta: ni se evalúa. `0016` otorga el mínimo
  que la F3 necesita, y cada fase otorga lo suyo junto con sus políticas.
- **Deny by default.** Las 24 tablas tienen RLS habilitada, cada una en el mismo
  archivo —y por lo tanto en la misma transacción— que la crea: ninguna existe
  abierta ni por un instante. Tienen políticas escritas `perfiles`,
  `perfiles_sensibles` (F3), `generos`, `peliculas`, `peliculas_generos` y
  `resenas` (F4); las otras 18 no devuelven ni una fila hasta que su fase abra la
  suya. El linter va a reportarlas con `rls_enabled_no_policy`: es informativo y
  es intencional.
- **Lo público se declara, no se hereda.** El catálogo se abre con una política
  `using (true)` explícita y un `GRANT SELECT` a `anon`. Las escrituras no tienen
  ni una ni otro, así que el catálogo es de solo lectura desde la API hasta que la
  F9 abra el alta para el administrador.
- **Un agregado no necesita abrir la tabla.** El top de ventas y el promedio de
  estrellas salen de funciones `SECURITY DEFINER` con `search_path` fijado y
  `EXECUTE` otorgado a mano: devuelven la cifra, y `ordenes` y `resenas` siguen
  sin política de lectura pública. Se prefirió a una *view* porque el advisor de
  Supabase marca `security_definer_view` como error.
- **Los datos sensibles están en otra tabla.** RLS filtra filas, no columnas. Como
  el admin necesita leer nombre y apellido (RF-61) pero no puede ver tipo de
  sangre, color de ojos ni días de vacaciones (RF-38.1, RNF-11), los tres campos
  viven en `perfiles_sensibles`, que tiene una sola política —la del titular— y
  ninguna de admin.
- **El rol no se auto-asciende.** `perfiles.rol` está protegido por dos cerrojos
  independientes: el `UPDATE` de esa columna no está otorgado a `authenticated`
  (0013), y un trigger `SECURITY INVOKER` rechaza el cambio si quien ejecuta no es
  `postgres`.
- **La service role no existe en este repo.** Al frontend solo llega la publishable
  key, que es pública por diseño.

## Promover a alguien a administrador o empleado

Es un acto administrativo, no una migración: hardcodear un email en un archivo
versionado es justamente lo que no hay que hacer. La persona se registra primero
por la app —el trigger ya le creó el perfil como `cliente`— y después, desde el
editor SQL:

```sql
update public.perfiles set rol = 'admin'    where email = 'admin@ejemplo.com';
update public.perfiles set rol = 'empleado' where email = 'empleado@ejemplo.com';

select email, rol from public.perfiles where rol <> 'cliente';
```

Funciona porque el editor SQL corre como `postgres`. **El mismo `UPDATE` desde la
aplicación devuelve 403.**

## Probar que las políticas hacen lo que dicen

`pruebas/rls_perfiles.sql`. Leer la advertencia del encabezado: ejecutar las
consultas sin suplantar el rol muestra todas las filas, porque `postgres` no está
sujeto a RLS, y da la falsa impresión de que no hay seguridad.

La prueba que cierra RF-38.1: como administrador,
`select count(*) from public.perfiles_sensibles` devuelve **0**.

`pruebas/rls_catalogo.sql` sigue el mismo formato para el catálogo y las reseñas:
el anónimo lee el catálogo pero no lo escribe, no lee `resenas` directo pero sí por
la función, un cliente no puede reseñar en nombre de otro y no puede editar ni
borrar la reseña ajena. Necesita dos cuentas de cliente.
