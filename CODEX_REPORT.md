# CODEX REPORT - Finanzas El Tigre PWA

## Resumen

Se construyó desde cero una PWA mobile-first para controlar finanzas personales y de negocio, con login por PIN, dashboard, cuentas, movimientos, ingresos, egresos, cobros de deuda, deudores, configuración y modo demo. La integración con Notion usa REST API exclusivamente en el backend, relaciones mediante IDs de página reales y detección dinámica de propiedades del schema real antes de crear páginas.

## Corrección de errores de schema Notion

La causa de los errores reales era que los payloads de creación tenían nombres de propiedades hardcodeados: ingreso enviaba `Estado` además de `Estado de pago`, egreso siempre enviaba `Categoría` aunque no existiera en el data source y deudores siempre enviaba `Notas`. Notion valida los nombres contra el schema exacto del data source y rechazaba esos payloads.

La corrección implementada en `src/lib/notion/schema.ts` incluye:

- `getDataSourceSchema(dataSourceId)`, con consulta al endpoint real y cache de 60 segundos.
- `hasProperty(schema, propertyName)` y `pickPropertyName(schema, candidates)`.
- `buildSchemaAwareProperties(...)`, que separa propiedades obligatorias de opcionales.
- Propiedades opcionales ausentes se omiten y generan una advertencia en `meta.warnings`.
- Propiedades obligatorias ausentes devuelven un error `NOTION_SCHEMA_MISSING_PROPERTY` con el nombre de la base y los candidatos faltantes.
- `Estado de pago` usa candidatos [`Estado de pago`, `Estado`] para adaptarse solo si el schema real tiene uno de ellos.
- `Categoría` usa candidatos [`Categoría`, `Categoria`, `Categoría movimiento`, `Categoria movimiento`] y solo se envía cuando el usuario eligió una categoría y existe una variante en el schema.
- `Descripción` usa candidatos [`Descripción`, `Descripcion`, `Notas`, `Nota`].
- `Notas` de Deudores usa [`Notas`, `Nota`, `Descripción`, `Descripcion`] y se omite si no hay coincidencia.
- `Activo` de Deudores usa [`Activo`, `Activa`].

La pantalla Configuración consulta y muestra las propiedades detectadas de Movimientos, Deudores, Cuentas y Categorías, junto con advertencias de obligatorias y opcionales ausentes. Los mensajes de rechazo de Notion se traducen a mensajes accionables que indican revisar `Config > Propiedades detectadas`.

## Stack

- Next.js 15 con App Router
- React 19 y TypeScript estricto
- Tailwind CSS 4 + CSS propio para la UI móvil
- API Route Handlers de Next.js
- Fetch directo a Notion REST API
- PWA con manifest, service worker e ícono SVG
- Cookie de sesión httpOnly firmada con HMAC

## Pantallas

- `/login`: acceso por PIN; en modo demo acepta `1234`.
- `/`: resumen con saldos, dona, resumen semanal, movimientos recientes y deudores pendientes.
- `/movimientos`: listado, filtros Hoy/Semana/Mes/Todos y pestaña de análisis preparada.
- `/cargar`: acciones MVP 1 y opciones de MVP 2 deshabilitadas.
- `/cargar/ingreso`: ingreso general, venta simple y cobro de deuda.
- `/cargar/egreso`: gasto, retiro personal, préstamo y otro, con cuenta, categoría, ámbito y origen.
- `/deudores`: listado, alta de deudor y acción Cobrar.
- `/config`: estado de variables, prueba de conexión, información PWA y seguridad.

## API routes

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/config/status`
- `POST /api/config/test-notion`
- `GET /api/dashboard`
- `GET /api/cuentas`
- `GET /api/categorias`
- `GET|POST /api/deudores`
- `GET /api/movimientos`
- `POST /api/movimientos/ingreso`
- `POST /api/movimientos/egreso`
- `POST /api/movimientos/cobro-deuda`

Todas las rutas privadas validan la cookie de sesión y responden con `{ ok, data }` o `{ ok: false, error }`.

## Variables de entorno

Ver `.env.example`. Incluye `NOTION_TOKEN`, `NOTION_VERSION`, los IDs de data sources de Notion, negocio por defecto, `APP_PIN` y `APP_SECRET`. No se creó ni modificó ningún archivo de secretos durante esta corrección y no se incluyeron valores sensibles en el código.

## Seguridad

- `NOTION_TOKEN` se lee únicamente desde módulos server-side y route handlers.
- `src/lib/env.ts`, `src/lib/auth.ts` y `src/lib/notion/client.ts` están protegidos para uso servidor.
- El token nunca se envía al navegador ni se guarda en localStorage.
- La sesión usa cookie `httpOnly`, `sameSite=lax`, `secure` en producción y firma HMAC.
- La pantalla Configuración muestra solo si cada variable está configurada, nunca su valor.

## Modo demo

Cuando faltan `NOTION_TOKEN` o `MOVIMIENTOS_DATA_SOURCE_ID`, la app usa datos demo locales y muestra el banner “Modo demo: faltan variables de Notion”. Las altas de movimientos y deudores se simulan con una respuesta exitosa informativa para permitir probar la UI sin configuración real.

## PWA

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/icon.svg`
- Registro seguro del service worker en `src/components/pwa-register.tsx`
- Metadata de manifest, theme color y Apple web app en `app/layout.tsx`

## Comandos ejecutados

- `npm install` — correcto; instaló dependencias. npm reportó 3 vulnerabilidades high del árbol instalado y advertencias de scripts pendientes de aprobación para dependencias nativas.
- `npm run typecheck` — correcto, `tsc --noEmit` sin errores.
- `npm run lint` — correcto, ESLint sin errores.
- `npm run build` — correcto; generó las 23 rutas App Router, incluyendo 13 endpoints API y las pantallas PWA.
- `npm run dev` — correcto; servidor local levantado en `http://localhost:3000`.
- Smoke test demo — login con PIN `1234`, dashboard demo y manifest respondieron correctamente; manifest HTTP 200.

El build deja un aviso informativo de Next indicando que su plugin ESLint no fue detectado por su integración interna; no impide el build y el comando `npm run lint` pasa correctamente.

## Validación específica recomendada contra Notion real

1. Abrir Configuración y verificar que Movimientos y Deudores estén “Consultado”.
2. Revisar que las propiedades obligatorias no aparezcan en “Faltan obligatorias”.
3. Crear un ingreso general sin descripción y confirmar que se usa la propiedad real `Estado de pago` o su fallback detectado.
4. Crear una venta simple sin producto y confirmar el guardado.
5. Crear un cobro de deuda con deudor seleccionado y confirmar la relación por page ID.
6. Crear un egreso sin categoría y confirmar que no se envía ninguna propiedad de categoría.
7. Crear un egreso con categoría solo si Config detectó una variante compatible.
8. Crear un deudor sin notas y luego con notas; si el schema no tiene notas, el guardado no debe fallar y Config debe mostrarla como opcional ausente.
9. Si falta una obligatoria, verificar que la UI indique la propiedad y la base exactas, sin mostrar el token.

## Archivos modificados/creados

- Configuración: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `.env.example`.
- App Router: `app/layout.tsx`, `app/globals.css`, `app/page.tsx` y las páginas de login, movimientos, carga, egresos, deudores y configuración.
- API: `app/api/**` para auth, configuración, dashboard, cuentas, categorías, deudores y movimientos.
- Backend Notion: `src/lib/notion/client.ts`, `normalize.ts`, `properties.ts`, `domain.ts`, `mappers.ts`.
- Seguridad y dominio: `src/lib/auth.ts`, `src/lib/env.ts`, `src/lib/types.ts`, `src/lib/demo-data.ts`, `src/lib/format.ts`.
- Componentes: `src/components/app-shell.tsx`, `movement-row.tsx`, `stat-card.tsx`, `pwa-register.tsx`.
- PWA: `public/manifest.webmanifest`, `public/sw.js`, `public/icon.svg`.

## Cómo probar manualmente

1. Copiar `.env.example` a `.env.local`.
2. Completar `NOTION_TOKEN` y los IDs de data sources.
3. Configurar `APP_PIN` y `APP_SECRET`.
4. Ejecutar `npm run dev`.
5. Abrir la app en el navegador.
6. Probar ingreso general y venta simple.
7. Probar cobro de deuda desde `/deudores`.
8. Probar egreso con cuenta, origen y categoría opcional.
9. Revisar las páginas creadas en Notion.

Sin variables, usar PIN `1234` para probar el modo demo.

## Pendientes MVP 2

- Venta con producto
- Descuento automático de stock
- Reposición con detalle de productos
- Promo fija
- Promo personalizada

No se hizo commit ni push.
