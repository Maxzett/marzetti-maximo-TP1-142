# Cine Emezeta — Sistema de venta de entradas

Trabajo Práctico N.º 1 de Programación IV (UTN, 2026 C2). Aplicación web para vender entradas de un cine: cartelera pública, compra de butacas en tiempo real, candy bar, cupones, puntos, crédito, paneles de empleado y administración.

- **Aplicación:** https://marzetti-maximo-tp-1-142.vercel.app
- **Requerimientos:** [docs/requerimientos.md](docs/requerimientos.md)
- **Base de datos:** [supabase/README.md](supabase/README.md)

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Angular 22.1.6 — componentes standalone, signals, sin zone.js |
| Backend | Supabase — auth, Postgres con RLS, Realtime y Storage |
| PWA | `@angular/service-worker` |
| Deploy | Vercel — build estático de la SPA, push a `main` redespliega |
| Paquetes | pnpm 10 |
| Tests | Vitest 4 |
| Formateador | Prettier |

---

## Arquitectura

```
Navegador (Angular SPA)
    │
    ├─ PostgREST (SELECT directo con RLS)   ← catálogo, salas, funciones
    └─ RPC (funciones Postgres)             ← toda escritura y lógica crítica
         │
         └─ Supabase Realtime (Broadcast)  ← mapa de butacas en tiempo real
```

### Carpetas de la app

```
src/app/
  core/      modelos, servicios, guards, cliente de Supabase y lógica pura
  features/  una carpeta por pantalla o flujo
  layout/    header, footer y shell del panel de admin
  shared/    componentes reutilizables (botón, campo, mapa, selector, etc.)
```

### Pantallas y rutas

| Ruta | Acceso | Descripción |
|---|---|---|
| `/` | público | Cartelera: top 3, buscador y Próximamente |
| `/peliculas/:id` | público | Ficha de película con funciones y reseñas |
| `/proximamente` | público | Estrenos futuros y alertas |
| `/comprar/:funcionId` | público | Compra: mapa, datos, pago |
| `/candy` | público | Ticket de candy bar sin entrada |
| `/entrada/:codigo` | público | Entrada descargada con QR y PDF |
| `/ingresar` | solo invitados | Inicio de sesión |
| `/registrarme` | solo invitados | Registro con 7 campos |
| `/perfil` | autenticado | Saldos, compras y cancelación |
| `/mis-peliculas` | autenticado | Películas donde se validó el ingreso |
| `/empleado` | empleado o admin | Escaneo y validación del QR |
| `/admin` | admin | Reportes, películas, funciones, salas, candy, promociones, log |
| `/sistema` | público | Catálogo vivo de todos los componentes |

---

## Decisiones técnicas

### Angular 22 sin NgModules ni zone.js

Todos los componentes son **standalone** y se declaran con sus propias importaciones, sin módulos intermedios. El estado se maneja con **signals** (`signal`, `computed`, `effect`); la comunicación entre componentes, con `input()`, `output()` y `model()`. No hay `BehaviorSubject` ni `async` pipe: los cambios se propagan de forma síncrona y siempre se sabe quién leyó qué.

El router usa `withComponentInputBinding()`: los parámetros de ruta y query llegan directamente como `input()` en el componente, sin inyectar `ActivatedRoute`.

Los servicios usan el decorador `@Service()` de Angular 22 (equivalente a `@Injectable({ providedIn: 'root' })`) con dependencias por `inject()`, no por constructor. Las pantallas del panel de admin, la compra y el registro van en chunks separados con `loadComponent`: quien entra al catálogo no descarga ni una línea del panel.

### Design system propio en CSS puro

Sin Tailwind ni Angular Material. Todos los tokens (paleta, tipografía, espaciado, radios, sombras) están en `src/styles.css`, en un solo lugar. La identidad es una marquesina retro de los años 50: tema oscuro, tres tipografías de Google Fonts (Staatliches, Oswald y Archivo) y guirnalda de bombillas dibujada con gradientes. Los radios son pequeños a propósito: el retro de imprenta tiene esquina viva.

Nueve componentes base en `shared/`: `app-boton`, `app-campo`, `app-chip`, `app-tarjeta`, `app-dialogo`, `app-spinner`, `app-mensaje`, `app-campo-fecha` y `app-campo-hora`. Cada uno tiene su archivo de especificación.

Los controles propios de fecha y hora no usan `<input type="date">` ni ruedas nativas: el primero es un campo de texto con formato `DD/MM/AAAA` e inserción automática de barras; el segundo, `HH:MM` con inserción automática de dos puntos. `app-chips-opcion` reemplaza a los selectores donde las opciones son fijas (día y horario de una función), con el patrón de radiogroup de WAI-ARIA: una sola parada de Tab y las flechas mueven y eligen a la vez.

Accesibilidad: contraste AA medido con un test que lee `styles.css` del disco (`core/a11y/contraste.ts`), foco visible definido una sola vez en `:focus-visible`, salto al contenido, anuncio de cambio de ruta, bloque `@media (forced-colors: active)` para el alto contraste de Windows, y `aria-disabled` en vez de `disabled` donde el foco tiene que poder pasar.

### La seguridad vive en la base

Las políticas RLS de Postgres son la única línea de defensa real (RNF-09). Los guards de Angular son ayudas de interfaz: quien abra las DevTools habla directo con PostgREST, y ahí las únicas reglas que corren son las políticas.

- **Deny by default.** Las 28 tablas tienen RLS habilitada en la misma migración que las crea: ninguna existe abierta ni por un instante. Solo se abren con políticas explícitas y en el orden de las fases.
- **Dos capas, no una.** Entre una petición y una fila hay un `GRANT` de tabla y después una política RLS. Sin el `GRANT`, una política es letra muerta. Los proyectos nuevos de Supabase no otorgan privilegios a `anon` ni a `authenticated` por defecto: cada fase otorga solo lo que necesita.
- **Escritura solo por RPC.** Ningún rol de la API tiene `INSERT`, `UPDATE` ni `DELETE` sobre las tablas de negocio. Todo pasa por funciones `SECURITY DEFINER` con `search_path` fijado que verifican el rol por su cuenta. Con una política de `INSERT` sobre `funciones`, el admin podría mandar `sala_id` desde las DevTools y saltearse la asignación automática (RF-21). Con la RPC, el único camino a una función pasa por el algoritmo.
- **Datos sensibles en tabla aparte.** RLS filtra filas, no columnas. Como el admin necesita leer nombre y apellido pero no puede ver tipo de sangre, color de ojos ni días de vacaciones (RF-38.1, RNF-11), los tres campos viven en `perfiles_sensibles`, que tiene una sola política —la del titular— y ninguna de admin. Quedan fuera de reportes y exportaciones por construcción, no por disciplina del código.
- **El rol no se auto-asciende.** `perfiles.rol` tiene dos cerrojos independientes: el `UPDATE` de esa columna no está otorgado a `authenticated`, y un trigger `SECURITY INVOKER` rechaza el cambio si quien ejecuta no es `postgres`.
- **Helpers de rol `SECURITY DEFINER STABLE` con `search_path` fijado.** Una política sobre `perfiles` que consulte `perfiles` provoca `42P17 infinite recursion`. La solución es que `es_admin()` y `es_personal()` sean definer con `search_path = ''`: ven siempre el schema real y no pueden ser reemplazados por una tabla homónima en otro schema.

### Lógica crítica en funciones Postgres (RPC)

La lógica que no puede quedar en el cliente —porque alguien podría saltearla desde las DevTools o porque necesita ser atómica— vive en funciones Postgres:

- **`programar_funciones()`:** asigna la sala automáticamente (la libre de menor nombre), toma un advisory lock para serializar las altas simultáneas, y la constraint `EXCLUDE USING gist` de `0006` es la red final. El alta es todo o nada: si una sola fecha no tiene sala, no se crea ninguna del lote (D-05).
- **`calcular_orden()`:** el único lugar que decide un monto. Lo llaman tanto `configurar_orden` (lo que se muestra) como `confirmar_pago` (lo que se cobra), así lo que el usuario vio es lo que paga. Orden de descuentos D-06: canje y combo, subtotal, cupón, crédito, total. El precio de cada butaca lo calcula `precio_de_entrada()` con preventa y recargo VIP, y se congela en `orden_items` (RN-10).
- **`validar_tramo()`:** consume por separado el ingreso y el candy de una entrada (D-03). Los rechazos se **devuelven** en vez de lanzarse, porque el intento fallido tiene que quedar en el log de actividad; un `raise` desharía la escritura del registro.
- **`cancelar_orden()`:** borra `butacas_ordenes` (el `unique` no es parcial, una orden cancelada liberaría la butaca de otra manera), acredita `total + credito_aplicado` como crédito, anula los puntos ganados y devuelve los canjeados, todo en una sola transacción.

### No hay solapamiento de salas

La constraint `EXCLUDE USING gist (sala_id WITH =, rango WITH &&)` en `funciones` hace que la invariante RN-01 ("una sala no puede tener dos funciones al mismo tiempo") sea imposible de violar por cualquier camino: si alguien escribe una función directamente por SQL y choca con otra, el motor devuelve `23P01`. El campo `rango` es una columna que llena un trigger (`timestamptz + interval`), no una expresión del índice: `STABLE`, no `IMMUTABLE`, lo prohíbe como expresión.

### Mapa de butacas en tiempo real

El mapa usa **Supabase Realtime Broadcast** desde la base, no `postgres_changes`. `avisar_butaca()` emite `{butaca_id, estado}` a un canal por función cada vez que una butaca cambia de estado. El cliente abre el canal **antes** de pedir el estado inicial, para que ningún evento intermedio se pierda. Es best-effort: si Realtime falla la venta sigue, y el mapa se corrige al volver a consultar.

El mapa seleccionable usa foco itinerante (patrón de grilla WAI-ARIA): 532 botones serían 532 paradas de Tab. Solo uno tiene `tabindex=0` y las flechas, Inicio y Fin mueven el foco. El estado de cada butaca se comunica con símbolo además del color (RNF-10).

### Sistema de reservas temporales

El comprador anónimo se identifica con un `sesion_id` (UUID generado en `sessionStorage`). La reserva son filas en `holds_butacas` con una estampilla de vencimiento: `retener_butaca` bloquea la fila de la función con `FOR UPDATE` para serializar y respetar el tope de 8 butacas por sesión. No hay job programado (`pg_cron`): cada función que toca `funciones` barre primero las reservas vencidas. `confirmar_pago` adopta los holds, los convierte en `butacas_ordenes` y los borra, todo en una transacción. El `unique (funcion_id, butaca_id)` en `butacas_ordenes` es la red final (RN-03).

### La compra no abre ninguna tabla

`ordenes`, `orden_items`, `butacas_ordenes`, `holds_butacas` y `configuracion` tienen RLS y ni una política ni un `GRANT` para la API. Todo pasa por funciones `SECURITY DEFINER` con `EXECUTE` para `anon` (la compra es anónima, RF-26). La service role no existe en este repositorio.

### Apertura de la venta

`venta_desde()` es la única definición: la preventa abre 7 días antes del estreno; sin preventa, el día del estreno. Un trigger `BEFORE INSERT` en `holds_butacas` aplica la regla: toda compra empieza con una reserva (D-08), así cerrar ese INSERT cierra la venta anticipada sin reescribir ninguna función de compra.

### QR y PDF en el cliente

La entrada se genera en el navegador con `qrcode` y `jspdf`, con `import()` dinámico: quien navega el catálogo no los descarga. El QR contiene solo el `codigo` de la orden (20 caracteres hexadecimales, no adivinable). La validación la hace la base (`validar_tramo`), no el cliente: el QR es solo un portador del código.

### Excel desde CDN

El reporte de facturación se exporta a Excel con [SheetJS](https://sheetjs.com) (CDN, 0.20.3): el paquete `xlsx` de npm quedó congelado en la 0.18.5 con vulnerabilidades conocidas sin parche. Los montos van como números con formato de pesos, no como texto. Ningún archivo exportado lleva datos de personas, solo cifras por día (RNF-11).

### Zona horaria

El servidor corre en UTC y Argentina no usa horario de verano desde 2009 (desfase fijo `-03:00`). En la base, toda fecha de negocio se convierte con `AT TIME ZONE 'America/Argentina/Buenos_Aires'`: la medianoche que termina la cartelera, la preventa de 7 días y la ventana de validación de la entrada son de Buenos Aires. En el cliente, los formatos usan la zona explícita; hay un solo lugar que define el desfase.

### Formularios con signals

Los formularios no usan `ReactiveFormsModule`. `app-campo` expone `valor = model('')`, así `[(valor)]` es el mismo idioma que `[(ngModel)]`. Los errores los calcula cada pantalla con `computed` y se los pasa como input; `intentoHecho` actúa como semáforo para no mostrar errores antes de que el usuario toque el campo.

---

## Desarrollo

Requiere Node 24 (24.15 o superior) y pnpm 10.

```bash
pnpm install
pnpm start          # servidor de desarrollo en http://localhost:4200
pnpm test           # tests unitarios con Vitest (932 en la última versión)
pnpm build          # build de producción en dist/tp1-cine/browser
pnpm format         # formatea src/ con Prettier
pnpm format:check   # verifica el formato sin escribir
```

pnpm no ejecuta los scripts de instalación de las dependencias (`pnpm.ignoredBuiltDependencies` en `package.json`). Las que los declaran traen binarios precompilados y el build funciona sin esos scripts.

El service worker está deshabilitado en `pnpm start` para que el caché no oculte los cambios. Para probar la PWA hay que servir el build de producción:

```bash
pnpm dlx serve -s dist/tp1-cine/browser
```

### Catálogo vivo de componentes

`/sistema` muestra todos los componentes del design system en sus estados posibles: botones, campos, chips, tarjetas, diálogo, spinner, mensajes de éxito y error, selector de fecha, selector de hora, chips de opción, selector de candy, mapa de sala, gráfico de barras y el panel de cuenta. Es la pantalla para mostrar en la defensa.

---

## Tests

932 tests unitarios con Vitest. La estrategia distingue:

- **Lógica pura** (`core/`): sin servicios ni Supabase. Funciones de filtro del catálogo, cálculo de edades, formateo, agrupamiento de funciones, exportación, lectura del log, etc.
- **Componentes** (`shared/` y `features/`): `TestBed` con proveedores simulados. No se prueba que Angular renderiza; se prueba que el componente responde como corresponde al estado y a la interacción.
- **Servicios** (`core/services/`): con `supabase-js` simulado. Se prueba que las llamadas a la base tienen los parámetros correctos y que el servicio procesa bien la respuesta.

El test de contraste (`core/a11y/contraste.spec.ts`) **lee `src/styles.css` del disco** y mide cada par de colores que la interfaz usa de verdad. El nivel AA no es un comentario al lado del token.

El lector de QR va detrás de un `InjectionToken` con fábrica por defecto. Los tests lo reemplazan con `providers`, sin `vi.mock`.

Los tests SQL se corren contra Postgres en WASM (PGlite) con stubs de Supabase en el scratchpad. No cubren concurrencia real: el advisory lock y las constraints como red se razonan, no se miden.

---

## Entradas: QR y PDF

La entrada se genera en el navegador (RF-27) con `qrcode` y `jspdf`. Las dos se importan con `import()` dinámico, en su propio chunk. `jspdf` pesa unos 411 kB (113 kB comprimidos).

Dos ajustes en `angular.json` mantienen el build sin avisos:

- `externalDependencies`: `jspdf` importa `canvg`, `html2canvas` y `dompurify` de forma dinámica, solo para convertir HTML o SVG a PDF, algo que no se usa. Se excluyen del bundle (unos 270 kB menos).
- `allowedCommonJsDependencies`: `qrcode` y `dijkstrajs` son CommonJS y no tienen versión ESM. `jsqr` también está en esta lista: es CommonJS y el import desenvuelve `default`.

El service worker precarga todos los chunks, así que `jspdf` viaja aunque el visitante no compre.

---

## Reportes: PDF y Excel

El reporte de facturación del panel de administración se exporta a PDF (con `jspdf`) y a Excel (RF-58) con [SheetJS](https://sheetjs.com), también con `import()` dinámico: pesa unos 336 kB (92 kB comprimidos) y solo se descarga al tocar el botón.

SheetJS se instala desde su propio CDN y no desde el registro de npm: el paquete `xlsx` de npm quedó congelado en la 0.18.5, que tiene vulnerabilidades conocidas sin parche, y las versiones nuevas se publican solo ahí. La dependencia en `package.json` apunta al tarball de la 0.20.3, que queda fijado en `pnpm-lock.yaml`. Trae versión ESM, así que no necesita `allowedCommonJsDependencies`.

El Excel lleva los montos como números con formato de pesos, no como texto, para que se puedan sumar y graficar sin convertir nada. Ninguno de los dos archivos lleva datos de personas: solo cifras por día (RNF-11).

---

## Supabase

La URL del proyecto y la clave pública están en `src/environments/`. Se versionan a propósito: esa clave viaja igual dentro del bundle que descarga el navegador, así que no es un secreto. Lo que protege los datos son las políticas RLS de la base, no el cliente.

La secret key (service role) saltea RLS y **nunca** va al frontend ni al repositorio.

El proyecto está en la región São Paulo (plan gratuito). Se pausa tras 7 días sin actividad.

---

## Deploy

Vercel despliega automáticamente cada push a `main`. La configuración está en [vercel.json](vercel.json):

- **Build:** `pnpm build`, con salida en `dist/tp1-cine/browser`.
- **Rewrite de SPA:** toda ruta que no corresponde a un archivo estático devuelve `index.html`, y el router de Angular resuelve la vista. Sin esto, abrir o recargar una URL profunda da un 404 del servidor.
- **`ngsw-worker.js` y `ngsw.json` sin caché HTTP:** si el navegador los cacheara, el service worker no detectaría las versiones nuevas de la app.

---

## PWA

La app funciona sin conexión para las rutas ya visitadas, gracias a `@angular/service-worker`. El manifiesto declara nombre, íconos y modo de pantalla completa; los íconos llevan la identidad de Cine Emezeta. El service worker precarga todos los chunks estáticos al instalar la PWA.
