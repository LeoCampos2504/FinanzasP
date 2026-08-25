# CODEX REPORT - Finanzas El Tigre PWA - MVP 2 Stock

## Resumen

Se extendió la PWA mobile-first para controlar finanzas personales y de negocio con productos, variantes, stock, venta con producto y reposición. Se mantiene el MVP 1 y la integración con Notion usa REST API exclusivamente en backend, relaciones mediante IDs de página reales y detección dinámica del schema antes de crear páginas.

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

## Alcance MVP 2

- Listado de productos base y variantes/ítems vendibles.
- Stock actual, stock mínimo, estado OK/Bajo stock/Sin unidades y filtros.
- Venta con producto: crea Movimiento y Detalle de productos con `Sentido stock = Salida`.
- Reposición: crea Movimiento de egreso y Detalle de productos con `Sentido stock = Entrada`.
- Bloqueo de ventas con stock insuficiente o stock no verificable cuando la variante maneja stock.
- Dashboard con los primeros productos bajo stock.
- Configuración con schemas de Productos base, Variantes y Detalle de productos.
- No se implementaron promos ni reglas de promo.

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
- `/cargar`: acciones MVP 1 más acceso a Productos y stock; promos siguen marcadas como Próximamente.
- `/cargar/ingreso`: ingreso general, venta simple y cobro de deuda.
- `/cargar/egreso`: gasto, retiro personal, préstamo y otro, con cuenta, categoría, ámbito y origen.
- `/deudores`: listado, alta de deudor y acción Cobrar.
- `/config`: estado de variables, prueba de conexión, información PWA y seguridad.
- `/productos`: productos base, variantes, búsqueda, filtros de stock y acciones Vender/Reponer.
- `/cargar/venta-producto`: venta por variante, cantidad, precio individual/manual, cuenta y fecha.
- `/cargar/reposicion`: reposición por variante, costo unitario, cuenta, origen y fecha.

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
- `GET /api/productos`
- `GET /api/variantes?search=&lowStock=true&productBaseId=`
- `POST /api/movimientos/venta-producto`
- `POST /api/movimientos/reposicion`

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

Para MVP 2 se agregaron productos base demo, variantes con stock OK/Bajo stock/Sin unidades y respuestas simuladas para venta con producto y reposición.

## Notion: Movimiento + Detalle de productos

La venta y la reposición consultan la variante por su page ID, obtienen sus precios y stock, consultan los schemas reales de Movimientos y Detalle de productos, y recién después construyen los payloads schema-aware. Primero se crea el Movimiento y luego el Detalle relacionado por la relación de movimiento detectada y `Variante / Ítem` detectada, siempre con page IDs reales.

Corrección posterior contra el schema real: la relación de movimiento puede llamarse `Movimiento`, `Movimientos`, `Movimiento relacionado` o `Movimientos relacionados`; la relación de variante puede llamarse `Variante / Ítem`, `Variante / Item`, `Variante`, `Ítem vendible`, `Item vendible` o `Producto vendido`. El builder elige únicamente el primer nombre existente. En el caso probado, el payload final usa `Movimientos` y `Variante`:

```json
{
  "Movimientos": { "relation": [{ "id": "MOVEMENT_PAGE_ID" }] },
  "Variante": { "relation": [{ "id": "VARIANT_PAGE_ID" }] }
}
```

La app no recalcula ni escribe `Stock actual`: crea el Detalle con `Afecta stock = true` y `Sentido stock = Salida` o `Entrada`, dejando que las fórmulas/rollups de Notion actualicen el stock.

## Validaciones MVP 2

- Variante, cuenta y fecha obligatorias.
- Cantidad entera mayor a cero.
- Precio manual y costo unitario mayores a cero.
- Origen obligatorio para reposición.
- Stock insuficiente bloqueado cuando la variante maneja stock.
- Stock no verificable bloqueado para evitar ventas inseguras.
- Propiedades críticas faltantes en schema generan error claro.
- Propiedades opcionales de detalle se omiten con warning.

## Riesgos conocidos

Notion no tiene transacciones entre bases. Si el Movimiento se crea pero falla la creación del Detalle, la API responde `PARTIAL_PRODUCT_CREATION`, devuelve el `movementId` y un mensaje visible: “Movimiento creado, pero falló el detalle. Revisar Notion.” El movimiento no se elimina automáticamente; debe revisarse manualmente.

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
- `npm run build` — correcto; generó 30 rutas App Router, incluyendo endpoints de productos, variantes, venta y reposición.
- `npm run dev -- -p 3001` — correcto; servidor local levantado en `http://localhost:3001`.
- Smoke test local — `/login`, `/productos`, `/cargar/venta-producto`, `/cargar/reposicion` y manifest respondieron HTTP 200; `/api/variantes` sin sesión respondió HTTP 401.

El build deja un aviso informativo de Next indicando que su plugin ESLint no fue detectado por su integración interna; no impide el build y el comando `npm run lint` pasa correctamente.

Validación de esta corrección de filtros: `npm run typecheck` ✅, `npm run lint` ✅ y `npm run build` ✅ con 30 rutas generadas. No se tocó `.env.local` ni se hicieron escrituras de prueba en Notion.

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
- Backend Notion: `src/lib/notion/client.ts`, `normalize.ts`, `properties.ts`, `domain.ts`, `mappers.ts`, `schema.ts`, `product-mappers.ts`, `product-transactions.ts`.
- Cálculos y dominio: `src/lib/product-calculations.ts`, `src/lib/stock.ts`, `src/lib/auth.ts`, `src/lib/env.ts`, `src/lib/types.ts`, `src/lib/demo-data.ts`, `src/lib/format.ts`.
- Componentes: `src/components/app-shell.tsx`, `movement-row.tsx`, `product-picker.tsx`, `stat-card.tsx`, `pwa-register.tsx`.
- MVP 2 UI/API: `app/productos/page.tsx`, `app/cargar/venta-producto/page.tsx`, `app/cargar/reposicion/page.tsx`, `app/api/productos/route.ts`, `app/api/variantes/route.ts`, `app/api/movimientos/venta-producto/route.ts`, `app/api/movimientos/reposicion/route.ts`.
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

## Pruebas manuales recomendadas

1. Abrir Configuración y verificar que Productos, Variantes y Detalle de productos aparezcan como “Consultado”.
2. Revisar propiedades críticas detectadas y warnings opcionales.
3. Abrir `/productos` y buscar una variante.
4. Filtrar Bajo stock y Sin unidades.
5. Crear una venta con producto.
6. Revisar en Notion que se creó Movimiento de ingreso.
7. Revisar Detalle de productos con `Sentido stock = Salida`.
8. Confirmar que Stock actual bajó mediante el rollup/fórmula de Notion.
9. Crear una reposición.
10. Revisar Movimiento `Tipo = Egreso`, `Subtipo = Reposición`.
11. Revisar Detalle con `Sentido stock = Entrada`.
12. Confirmar que Stock actual subió.
13. Probar stock insuficiente y verificar el bloqueo.
14. Simular un fallo de Detalle y verificar que se muestre el movement ID.

## Corrección específica de schema

La causa del error fue que la app exigía únicamente `Movimiento`, mientras que el data source real exponía `Movimientos`. Config ahora considera cubierta la relación si detecta cualquiera de los candidatos definidos y muestra la propiedad real detectada, sin marcar “Movimiento” como faltante. Venta y reposición comparten el mismo builder, por lo que ambos usan la corrección.

## Corrección de filtros de stock

La causa del bug era comparar etiquetas visibles exactas (`Bajo stock`, `Sin unidades`) mientras Notion puede devolver fórmulas/string con emojis, mayúsculas o variantes como `Sin unidad` y `Sin stock`.

Se agregó `src/lib/stock.ts` con la función pura `normalizeStockStatus`, que devuelve `ok`, `low`, `empty`, `not_managed` o `unknown`. El mapper conserva el valor original en `stockStatusRaw` y usa esta prioridad:

- `Maneja stock = false` → `not_managed`.
- `Maneja stock = true` y stock actual `<= 0` → `empty`.
- `Maneja stock = true` y stock actual `<= Stock mínimo` → `low`.
- `Maneja stock = true` y stock actual mayor al mínimo → `ok`.
- Si faltan números confiables, se normaliza el texto de `Estado stock`.

`GET /api/variantes` acepta `stockStatus=low` y `stockStatus=empty`; `lowStock=true` se mantiene como alias compatible de `stockStatus=low`. `/productos` usa esos filtros y también valida localmente el estado normalizado. El Dashboard incluye únicamente `low` y `empty`, nunca `not_managed`.

## Pendientes MVP 3

- Promo fija
- Promo personalizada
- Reglas de promo
- Estadísticas avanzadas
- Modo offline

No se hizo commit ni push.
