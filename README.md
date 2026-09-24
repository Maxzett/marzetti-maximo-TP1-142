# Cine — Sistema de venta de entradas

Trabajo Práctico N.º 1 de Programación IV (UTN, 2026 C2). Aplicación web para vender entradas de un cine: cartelera, compra de butacas en tiempo real, candy bar, fidelización y paneles de empleado y administración.

- **Requerimientos:** [docs/requerimientos.md](docs/requerimientos.md)
- **Aplicación desplegada:** https://marzetti-maximo-tp-1-142.vercel.app

> Este README se completa en la etapa final con la arquitectura y las decisiones técnicas. Por ahora documenta el setup del proyecto.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Angular 22: componentes standalone, signals, sin zone.js |
| Backend | Supabase: auth, Postgres con RLS, realtime y storage |
| PWA | `@angular/service-worker` |
| Deploy | Vercel, build estático de la SPA |
| Paquetes | pnpm |
| Tests | Vitest |

## Desarrollo

Requiere Node 24 (24.15 o superior) y pnpm 10.

```bash
pnpm install
pnpm start          # servidor de desarrollo en http://localhost:4200
pnpm test           # tests unitarios con Vitest
pnpm build          # build de producción en dist/tp1-cine/browser
pnpm format         # formatea src/ con Prettier
```

pnpm no ejecuta los scripts de instalación de las dependencias (`pnpm.ignoredBuiltDependencies` en `package.json`). Las que los declaran traen binarios precompilados (o, en el caso de `core-js`, un simple aviso de donación) y el build funciona sin esos scripts, así que no hay motivo para correr código arbitrario al instalar.

El service worker está deshabilitado en `pnpm start` para que el caché no oculte los cambios. Para probar la PWA hay que servir el build de producción, por ejemplo con `pnpm dlx serve -s dist/tp1-cine/browser`.

## Estructura

```
src/app/
  core/      modelos, servicios, guards y cliente de Supabase
  features/  una carpeta por pantalla o flujo
  layout/    header, footer y shells
  shared/    componentes reutilizables, pipes y directivas
```

## Entradas: QR y PDF

La entrada se genera en el navegador (RF-27) con `qrcode` y `jspdf`. Las dos se importan con `import()` dinámico recién cuando hacen falta, así que quien navega el catálogo no las descarga: `jspdf` pesa unos 411 kB (113 kB comprimidos) y vive en su propio chunk.

Dos ajustes en `angular.json` mantienen el build sin avisos:

- `externalDependencies`: `jspdf` importa `canvg`, `html2canvas` y `dompurify` de forma dinámica, solo para convertir HTML o SVG a PDF, algo que no se usa. Se excluyen del bundle (unos 270 kB menos).
- `allowedCommonJsDependencies`: `qrcode` y `dijkstrajs` son CommonJS y no tienen versión ESM.

El service worker precarga todos los chunks al instalar la PWA, así que `jspdf` viaja aunque el visitante no compre.

## Supabase

La URL del proyecto y la clave pública están en `src/environments/`. Se versionan a propósito: esa clave viaja igual dentro del bundle que descarga el navegador, así que no es un secreto. Lo que protege los datos son las políticas RLS de la base, no el cliente.

La secret key (service role) saltea RLS y **nunca** va al frontend ni al repositorio.

## Deploy

Vercel despliega automáticamente cada push a `main`. La configuración está en [vercel.json](vercel.json):

- **Build:** `pnpm build`, con salida en `dist/tp1-cine/browser`.
- **Rewrite de SPA:** toda ruta que no corresponde a un archivo estático devuelve `index.html`, y el router de Angular resuelve la vista. Sin esto, abrir o recargar una URL profunda da un 404 del servidor.
- **`ngsw-worker.js` y `ngsw.json` sin caché HTTP:** si el navegador los cacheara, el service worker no detectaría las versiones nuevas de la app.
