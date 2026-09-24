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
| `migrations/0019_salas_funciones.sql` | Salas, butacas y funciones: lectura pública, escritura solo por RPC (`crear_funciones`, `modificar_funcion`, `dar_de_baja_funcion`, `crear_sala`, `actualizar_sala`), asignación automática de sala y `generar_butacas_sala()` |
| `migrations/0020_compra.sql` | Compra: reservas de 10 minutos, orden pendiente y pago simulado. Tabla `configuracion` (recargo VIP, tope de butacas) y seis RPC públicas (`estado_butacas`, `retener_butaca`, `liberar_butaca`, `crear_orden`, `confirmar_pago`, `obtener_orden`) más tres internas |
| `migrations/0021_estado_butacas_con_vencimiento.sql` | `estado_butacas()` devuelve cuándo vence cada reserva propia, para que el temporizador sobreviva a recargar la página |
| `seed/001_salas_y_butacas.sql` | 4 salas × 532 ubicaciones, con aserción de conteo. **Requiere 0019**: llama a `generar_butacas_sala()` |
| `seed/002_catalogo_base.sql` | Géneros, categorías, cupones y recompensa inicial |
| `seed/003_peliculas_demo.sql` | 12 películas inventadas (10 en cartelera, 2 próximas), con aserciones |
| `seed/004_funciones_demo.sql` | Funciones de los próximos 14 días (6 películas × 3 horarios), programadas con el mismo algoritmo que usa la app. Requiere 0019 y los seeds 001 y 003 |

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

Además, la compra en tiempo real (RF-25) usa **Realtime Broadcast** desde las funciones
de la base. En **Project Settings → Realtime** tiene que estar activada la opción **Allow
public access**: las funciones emiten con `private = false`, a canales públicos, y con esa
opción apagada los eventos no llegan al navegador y el mapa deja de actualizarse en vivo
(la compra sigue funcionando, solo que sin verse entre pestañas).

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
  `resenas` (F4), `salas`, `butacas` y `funciones` (F5); las otras 15 no devuelven
  ni una fila hasta que su fase abra la suya. El linter va a reportarlas con
  `rls_enabled_no_policy`: es informativo y es intencional.
- **Escribir solo por RPC.** `salas`, `butacas` y `funciones` se leen con una
  política pública, pero ningún rol de la API tiene `INSERT`, `UPDATE` ni `DELETE`
  sobre ellas: se escribe llamando a una función que verifica el rol adentro
  (`es_admin()`, error `42501`). Con una política de `INSERT` sobre `funciones`, el
  administrador podría mandar `sala_id` desde las DevTools y saltearse la asignación
  automática (RF-21); con la RPC, el único camino a una función pasa por el algoritmo.
- **Cinco funciones `SECURITY DEFINER` con `EXECUTE` para `authenticated`.**
  `crear_funciones`, `modificar_funcion`, `dar_de_baja_funcion`, `crear_sala` y
  `actualizar_sala` son las únicas puertas de escritura de la F5, y el linter de
  Supabase las va a marcar como advertencia (`authenticated_security_definer_function_executable`).
  Es intencional: cada una verifica `es_admin()` como primer paso y lanza `42501` si
  quien llama no lo es, y ninguna hace nada que el rol no pueda hacer ya desde la
  interfaz de administración. Las cinco internas (`programar_funciones`,
  `buscar_sala_libre`, `horarios_libres_cercanos`, `registrar_actividad` y
  `generar_butacas_sala`) no tienen `EXECUTE` para ningún rol de la API.
- **La asignación de sala tiene tres capas.** La función `programar_funciones()`
  elige la sala determinísticamente (la libre de menor nombre) y toma un advisory
  lock para que dos altas simultáneas se ejecuten una detrás de otra; la constraint
  `EXCLUDE` de `0006` es la red final que garantiza la invariante aunque alguien
  escriba por otro camino (`23P01`); y el alta es **todo o nada**: si una sola fecha
  del lote no tiene sala no se crea ninguna y se devuelven horarios cercanos libres
  (D-05). El algoritmo no tiene `GRANT` para la API: la puerta de entrada es
  `crear_funciones()`, y el seed 004 usa el algoritmo directo porque corre sin sesión.
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
- **La compra no abre ninguna tabla.** `ordenes`, `orden_items`, `butacas_ordenes`,
  `holds_butacas` y `configuracion` tienen RLS y ni una política ni un `GRANT` para la API. Todo
  pasa por funciones `SECURITY DEFINER` con `search_path` fijado que validan por su cuenta la
  función, la butaca, la edad, la sesión y el estado. Son las únicas con `EXECUTE` para `anon`
  (la compra es anónima, RF-26): el linter las va a marcar, es intencional. Las tres internas
  (`avisar_butaca`, `limpiar_vencidos`, `precio_de_entrada`) no tienen `EXECUTE` para nadie de la API.
- **Una butaca, una venta la garantiza el motor.** `unique (funcion_id, butaca_id)` en `butacas_ordenes`
  (RN-03) y en `holds_butacas` (D-08). Las funciones de compra bloquean la fila de la función con
  `FOR UPDATE` para serializar las reservas y respetar el tope, pero el `unique` es la red final.
- **El comprador anónimo se identifica con `sesion_id`.** Es un valor al azar que genera el
  navegador; la base retiene las butacas a su nombre y solo quien lo conoce puede pagar esa orden.
  La entrada se ve con el `codigo` de la orden, que no se puede adivinar (`obtener_orden`).
- **El precio lo calcula la base, no el cliente.** `precio_de_entrada()` aplica la preventa y el
  recargo VIP en el momento de `crear_orden`, y se congela en `orden_items` (RN-10). El cliente solo
  muestra lo que la base ya resolvió.
- **Nada corre en segundo plano.** No hay `pg_cron`: cada función que toca una función de cine
  barre primero las reservas vencidas (`limpiar_vencidos`) y pasa a `expirada` las órdenes
  pendientes que superaron su ventana. Una orden vencida en una función que nadie vuelve a tocar
  queda `pendiente` hasta que alguien la toque; no ocupa butacas, porque las reservas se borran.
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

`pruebas/compra.sql` cubre la F6 y necesita reemplazar dos ids de función (el encabezado explica
cómo buscarlos): las tablas de la compra no se leen desde la API, otra sesión no reserva una
butaca ya reservada, el precio suma el recargo VIP, un menor de 18 (declarado) es rechazado y sin
declarar fecha también, no se paga la orden de otra sesión, y una butaca ya vendida no se puede
reservar de nuevo. La misma batería se corrió más completa (49 comprobaciones, con la edad en el
borde del cumpleaños, la reserva vencida, la preventa y el vencimiento propio de `0021`) contra
Postgres en WASM; **no cubre concurrencia real**.

`pruebas/salas_funciones.sql` cubre la F5, con una cuenta admin y una cliente: ni el
admin inserta una función a mano (RF-21), la **quinta** función simultánea es rechazada
y no crea ninguna del lote (todo o nada), el borde de RN-01 (entra a `fin + 30 min`, no
a `fin + 29`), la baja libera la sala, una función con entradas vendidas no se da de
baja ni se mueve pero sí cambia de precio, y el log recibe una fila por operación sin
que nadie pueda leerlo ni editarlo.
