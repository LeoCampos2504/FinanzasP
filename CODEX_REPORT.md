# CODEX REPORT - Finanzas El Tigre PWA - MVP 5.1 Permisos por rol y negocio

## Resumen

Se extendió la PWA mobile-first para controlar finanzas personales y de negocio con productos, variantes, stock, venta con producto, reposición y promos. Se mantiene el MVP 1/MVP 2 y la integración con Notion usa REST API exclusivamente en backend, relaciones mediante IDs de página reales y detección dinámica del schema antes de crear páginas.

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

## Alcance MVP 3: promos

- Listado de promos activas con búsqueda y filtros por promo fija/personalizada.
- Lectura de reglas de promo y variantes permitidas desde Notion.
- Venta fija o personalizada con una regla por detalle de producto.
- Creación de un Movimiento de ingreso y múltiples Detalles de productos.
- Cada detalle usa `Afecta stock = true` y `Sentido stock = Salida`; el stock sigue siendo calculado por Notion.
- Las variantes fijas se respetan y las reglas seleccionables exigen una variante válida del producto base.
- Se bloquea stock insuficiente/no verificable cuando la variante maneja stock.
- Demo local con promo fija, promo personalizada, reglas y variantes.

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
- `/promos`: listado de promos activas y acceso a vender.
- `/cargar/venta-promo`: venta fija/personalizada, selección de variantes por regla, cuenta, fecha y total manual.

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
- `GET /api/promos`
- `GET /api/promos/[promoId]/reglas`
- `GET /api/promos/reglas/[ruleId]/variantes`
- `POST /api/movimientos/venta-promo`

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

Para MVP 2 se agregaron productos base demo, variantes con stock OK/Bajo stock/Sin unidades y respuestas simuladas para venta con producto y reposición. Para MVP 3 se agregaron promos demo, reglas con variante fija y regla seleccionable, y venta promo simulada.

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

## Detección de schema para promos

`src/lib/notion/promo-mappers.ts`, `promo-service.ts` y `promo-transactions.ts` consultan Promos, Reglas de promo, Variantes, Movimientos y Detalle de productos antes de construir payloads. Para Reglas se aceptan relaciones `Promo`/`Promos`, productos `Producto base`/`Producto`/`Productos base`, cantidad `Cantidad requerida`/`Cantidad`/`Cantidad promo` y variantes fijas `Variante fija`, `Variante / Ítem`, `Variante / Item`, `Variante`, `Ítem vendible`, `Item vendible` o `Producto vendido`.

En Detalle de productos se reutilizan los candidatos reales ya corregidos: movimiento [`Movimiento`, `Movimientos`, `Movimiento relacionado`, `Movimientos relacionados`] y variante [`Variante / Ítem`, `Variante / Item`, `Variante`, `Ítem vendible`, `Item vendible`, `Producto vendido`]. Nunca se envían ambas relaciones. Las relaciones Promo y Regla de promo son opcionales; si no existen, se omiten. Las propiedades críticas faltantes generan `NOTION_SCHEMA_MISSING_PROPERTY` antes de crear el Movimiento. Los select se eligen respetando las opciones detectadas cuando Notion las devuelve.

La creación de una venta promo crea primero el Movimiento y luego un Detalle por cada regla. Si fallan uno o más detalles, la respuesta `PARTIAL_PROMO_CREATION` devuelve el ID del Movimiento, detalles creados y detalles fallidos para revisión manual; no se intenta borrar información en Notion.

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
- `npm run build` — correcto; generó 34 rutas App Router, incluyendo endpoints y pantallas de productos, variantes, venta, reposición y promos.
- `npm run dev -- -p 3001` — correcto; servidor local levantado en `http://localhost:3001`.
- Smoke test local — `/login`, `/productos`, `/cargar/venta-producto`, `/cargar/reposicion` y manifest respondieron HTTP 200; `/api/variantes` sin sesión respondió HTTP 401.

El build deja un aviso informativo de Next indicando que su plugin ESLint no fue detectado por su integración interna; no impide el build y el comando `npm run lint` pasa correctamente.

Validación de esta corrección de filtros: `npm run typecheck` ✅, `npm run lint` ✅ y `npm run build` ✅. No se tocó `.env.local` ni se hicieron escrituras de prueba en Notion.

Validación MVP 3: `npm run typecheck` ✅, `npm run lint` ✅ y `npm run build` ✅ con 34 rutas generadas. El build compiló las nuevas rutas de promos y venta promo. Smoke local sin sesión: `/promos`, `/cargar/venta-promo`, `/config` y `/productos` respondieron HTTP 200; las rutas privadas nuevas respondieron HTTP 401, como corresponde. No fue posible completar el smoke autenticado porque el PIN configurado en el entorno local no es `1234`; no se leyó ni modificó `.env.local`.

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
- MVP 3 promos: `app/promos/page.tsx`, `app/cargar/venta-promo/page.tsx`, `app/api/promos/route.ts`, `app/api/promos/[promoId]/reglas/route.ts`, `app/api/promos/reglas/[ruleId]/variantes/route.ts`, `app/api/movimientos/venta-promo/route.ts`, `src/lib/notion/promo-mappers.ts`, `src/lib/notion/promo-service.ts`, `src/lib/notion/promo-transactions.ts`, `src/lib/promo-calculations.ts`.
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

## Pruebas manuales MVP 3

1. En Configuración, verificar que Promos y Reglas de promo aparezcan como Consultado y revisar las propiedades obligatorias/opcionales detectadas.
2. Abrir `/promos`, filtrar fija/personalizada y entrar en Vender promo.
3. Probar una promo fija con variante fija; verificar un Movimiento de ingreso y un Detalle por regla.
4. Probar una promo personalizada seleccionando variantes permitidas y, opcionalmente, un total manual.
5. Revisar en Notion que el detalle usa la relación real `Movimiento` o `Movimientos`, nunca ambas, y la relación real de variante.
6. Confirmar `Afecta stock = true`, `Sentido stock = Salida`, cantidad de cada regla y relación Promo/Regla si existen.
7. Probar variante sin stock suficiente y stock no verificable; la venta debe bloquearse antes de crear páginas.
8. Simular un fallo al crear un detalle y comprobar `PARTIAL_PROMO_CREATION`, el movement ID y el listado de detalles fallidos.

## Corrección bug venta promo personalizada

La pantalla `/cargar/venta-promo` renderizaba un formulario mínimo y no mantenía un estado completo por promo/regla. En particular, solo consultaba variantes para algunas reglas, no mostraba los componentes ni sus precios/stock, calculaba el total únicamente desde el precio de la promo y permitía que el estado de selección quedara incompleto.

Se reemplazó el flujo de UI para que:

- cargue promos activas y cuentas al abrir;
- acepte `promoId` y `promo` por query param;
- consulte siempre `GET /api/promos/[promoId]/reglas` al cambiar la promo;
- consulte `GET /api/promos/reglas/[ruleId]/variantes` para cada regla;
- muestre producto base, cantidad, variante fija o selector de variantes elegibles;
- muestre stock, estado, precio promo unitario, costo de reposición y subtotal por componente;
- calcule el total personalizado como suma de componentes;
- use el precio final de la promo fija cuando existe, mostrando también el cálculo por componentes;
- permita `Total manual` como override opcional en ambos modos;
- bloquee Guardar si faltan promo, cuenta, fecha, reglas/variantes o stock verificable suficiente.

También se amplió el mapper de variantes para aceptar relaciones de producto base `Producto base`, `Producto` y `Productos base`. El endpoint de reglas usa los candidatos `Promo`/`Promos` y el endpoint de variantes filtra por el producto base real, mantiene variantes activas y devuelve la variante fija cuando corresponde.

Archivos corregidos en esta iteración: `app/cargar/venta-promo/page.tsx`, `src/lib/notion/promo-service.ts`, `src/lib/notion/product-mappers.ts` y `CODEX_REPORT.md`.

Validación de esta iteración: `npm run typecheck` ✅, `npm run lint` ✅ y `npm run build` ✅ con 34 rutas. Smoke local sin sesión: `/promos` y `/cargar/venta-promo?promo=demo-promo-custom-free` respondieron HTTP 200; `/api/promos`, `/api/variantes` y `/api/cuentas` respondieron HTTP 401, protegiendo las rutas privadas. Las pruebas funcionales de componentes libres quedan recomendadas para ejecutar con sesión demo o contra Notion real; no se tocó `.env.local` ni se usaron datos sensibles en cliente.

## Corrección conceptual de precios y promos libres

La causa del precio vacío era que el mapper solo consideraba unas pocas propiedades y la UI mostraba `Precio calculado`, aunque una promo fija podía tener el valor en `Precio manual`. `mapPromo` ahora conserva `manualPrice`, `calculatedPrice`, `finalPrice`, `displayPrice` y `priceSource`. El fallback es: `Precio final usado`/equivalentes, luego `Precio manual`/equivalentes, luego `Precio calculado`/equivalentes y finalmente componentes; si no hay valor se muestra `Sin precio definido`. El backend usa `displayPrice` para una promo fija salvo que exista `manualTotal > 0`.

Una promo personalizada ya no depende obligatoriamente de reglas activas. Puede tener reglas, que se resuelven como guía, o funcionar como promo libre/ad hoc. En el segundo caso la UI muestra `Agregar componente`, permite seleccionar variantes activas, cantidad, modo `Promo`/`Manual`, precio unitario manual, stock, subtotal y quitar componentes. El POST acepta `promoId` opcional y `manualComponents`; crea un Detalle por regla y otro por cada componente manual. En componentes libres se omite `Regla de promo` si la propiedad existe o no, y `Promo` solo se envía si hay promo seleccionada y la propiedad existe.

La UI permite cambiar entre `Promo fija` y `Promo personalizada`, elegir una plantilla opcional en custom o `Promo personalizada libre`, calcular el total por componentes y usar `manualTotal` como override. Las validaciones bloquean cantidad inválida, precio manual inválido, falta de variante, stock insuficiente, falta de cuenta/fecha y ventas sin componentes.

Demo incluye una promo fija con precio manual, una personalizada con reglas y `Promo libre` sin reglas. Las cuentas siguen viniendo de `GET /api/cuentas`; el endpoint filtra cuentas activas con `Activo` o `Activa` y no agrega billeteras predefinidas.

Archivos adicionales modificados: `src/lib/types.ts`, `src/lib/demo-data.ts`, `src/lib/notion/promo-mappers.ts`, `src/lib/notion/promo-service.ts`, `src/lib/notion/promo-transactions.ts`, `src/lib/promo-calculations.ts`, `app/api/movimientos/venta-promo/route.ts`, `app/cargar/venta-promo/page.tsx`, `app/promos/page.tsx` y `app/api/cuentas/route.ts`.

## Mejora UX: catálogo rápido de promo personalizada libre

La UX anterior agregaba tarjetas grandes por componente. Ahora `/cargar/venta-promo` agrupa las variantes bajo productos base, permite buscar por producto/variante, expandir productos con varias variantes y usar filas compactas con botones `−`, cantidad y `+`. Los productos con una sola variante muestran el contador directamente; una variante con stock cero o stock no verificable no permite sumar y nunca se supera el stock disponible.

El estado usa `selectedQuantitiesByVariantId` y solo genera `manualComponents` para cantidades mayores a cero. Cada componente se envía con `priceMode = Promo` y el precio promo unitario, con fallback a precio de venta individual. No se muestra selector `Promo/Manual` por componente. `Total manual` solo reemplaza el monto final del Movimiento; los Detalles continúan creándose por componente con cantidad, relación de variante, `Afecta stock = true` y `Sentido stock = Salida`.

El resumen muestra componentes, cantidades, subtotales, total calculado y total final usado. El catálogo se arma con `GET /api/productos` + `GET /api/variantes`, sin agregar endpoints ni billeteras hardcodeadas. La demo contiene un producto con varias variantes, un producto con variante única, precios promo, stock bajo y una variante sin unidades.

Archivos modificados en esta iteración: `app/cargar/venta-promo/page.tsx`, `app/globals.css` y `src/lib/demo-data.ts`. Se revisó `POST /api/movimientos/venta-promo`: `priceMode` ausente mantiene fallback `Promo`, no exige precio manual por componente Promo y procesa los Detalles aunque exista `manualTotal`.

Pruebas manuales recomendadas: abrir venta promo, cambiar a promo personalizada libre, buscar producto, expandir variantes, sumar/restar sin superar stock, verificar variante única, revisar resumen y total calculado, guardar con y sin total manual y confirmar que el Movimiento usa el total manual mientras los Detalles y el descuento de stock se mantienen.

Validación UX final: `npm run typecheck` ✅, `npm run lint` ✅ y `npm run build` ✅ con 34 rutas. Smoke sin sesión: `/cargar/venta-promo?promo=demo-promo-custom-free` y `/promos` respondieron HTTP 200; `/api/productos`, `/api/variantes` y `/api/cuentas` respondieron HTTP 401 correctamente.

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

## Pendientes posteriores

- Estadísticas avanzadas.
- Modo offline.

## MVP 4.5 Cuentas y billeteras

### Resumen

Se agregó administración de Cuentas creadas por el usuario. La app ahora permite listar, crear, editar, activar y desactivar cuentas sin borrado físico, incluyendo saldo inicial, saldo esperado, caja principal, tipo, orden y notas cuando esas propiedades existen en el schema real.

### Alcance

Incluido: `/cuentas`, `/cuentas/nueva`, `/cuentas/[accountId]/editar`, `GET/POST /api/cuentas` y `PATCH /api/cuentas/[accountId]`; filtro de inactivas, resumen de saldos, schema de tipo dinámico y acceso desde Config. No incluido: Caja/POS, pago dividido, usuarios internos, vista PC completa, estadísticas avanzadas ni modo offline.

### Reglas de negocio

- Las cuentas/billeteras las crea el usuario.
- No se agregaron billeteras reales hardcodeadas para Notion.
- Los selects de ventas, egresos, reposiciones, cobros y promos consumen `GET /api/cuentas` sin `includeInactive`, por lo que solo reciben cuentas activas.
- Las cuentas inactivas solo aparecen en administración con `includeInactive=true`.
- No existe eliminación física; activar/desactivar usa la propiedad de estado detectada.

### Rutas nuevas

- `/cuentas`: resumen, listado activo/inactivo y acciones.
- `/cuentas/nueva`: alta de cuenta.
- `/cuentas/[accountId]/editar`: edición y activación/desactivación.

### API nuevas

- `GET /api/cuentas`: cuentas activas por defecto; `?includeInactive=true` para administración. Devuelve metadata de schema para el formulario.
- `POST /api/cuentas`: crea una cuenta con payload schema-aware.
- `PATCH /api/cuentas/[accountId]`: actualiza solo propiedades presentes.

### Notion

`src/lib/notion/account-admin.ts` usa candidatos para Nombre, Activa/Activo, caja principal, saldo inicial, orden, tipo, icono, color y notas. El tipo se envía como `select`, `status` o `rich_text` según la definición detectada y se valida contra las opciones reales cuando existen. No se escriben `Total entradas`, `Total salidas`, `Movimiento neto` ni `Saldo esperado`, porque son rollups/fórmulas calculadas. Los nombres opcionales ausentes se omiten con warning y Nombre produce un error claro si falta.

`src/lib/notion/account-service.ts` valida server-side que la cuenta referenciada exista y esté activa antes de ingresos, egresos, ventas, reposiciones, cobros y promos. Una cuenta inactiva devuelve `ACCOUNT_INACTIVE` con un mensaje accionable.

### Seguridad

Todas las rutas de administración requieren sesión. `NOTION_TOKEN` continúa exclusivamente en backend/server-side y nunca se envía al cliente. No se tocó `.env.local`.

### Demo mode

El modo demo conserva cuentas de ejemplo únicamente dentro del store demo, ahora con `Efectivo` y `Mercado Pago`. Alta, edición y activación/desactivación responden “Guardado simulado en modo demo.” En modo real, las cuentas provienen únicamente del data source Cuentas.

### Validaciones

Nombre requerido; saldo inicial numérico con default 0; orden numérico si se informa; tipo validado contra opciones select/status reales; edición parcial sin sobrescribir campos omitidos; no se permite borrar físicamente; cuentas inactivas no pueden usarse en operaciones server-side.

### Archivos modificados

- `src/lib/types.ts`: `Account` y `AccountInput` completos.
- `src/lib/notion/account-admin.ts`: candidatos, mapper, schema de formulario, normalización, validación y builder.
- `src/lib/notion/account-service.ts`: validación de cuenta activa en operaciones.
- `src/lib/demo-account-store.ts` y `src/lib/demo-data.ts`: demo de cuentas y mutaciones simuladas.
- `app/api/cuentas/route.ts` y `app/api/cuentas/[accountId]/route.ts`: API de administración.
- `app/cuentas/page.tsx`, `app/cuentas/nueva/page.tsx`, `app/cuentas/[accountId]/editar/page.tsx` y `src/components/account-admin-forms.tsx`: UI.
- `app/api/config/status/route.ts`, `app/config/page.tsx`: soporte de escritura y acceso desde Config.
- `app/api/dashboard/route.ts`, movimientos y transacciones: mapper activo y bloqueo de cuentas inactivas.
- `src/lib/notion/properties.ts`: constructor `status` para tipos de cuenta Notion.
- `app/globals.css`: estilos de resumen y cards de cuentas.

### Comandos ejecutados

- `npm run typecheck` — correcto.
- `npm run lint` — correcto.
- `npm run build` — correcto; generó 39 rutas App Router, incluyendo `/cuentas`, formularios y `PATCH /api/cuentas/[accountId]`.
- Smoke local sin sesión — `/cuentas`, `/cuentas/nueva`, `/config`, ingreso, egreso, venta producto, reposición y venta promo respondieron HTTP 200; `GET/POST /api/cuentas`, `PATCH /api/cuentas/[accountId]` y `/api/config/status` respondieron 401 cuando no había sesión.

### Pruebas manuales recomendadas

1. Abrir Config y verificar que Cuentas muestre soporte de escritura y propiedades detectadas.
2. Abrir `/cuentas`.
3. Crear una cuenta nueva y verificarla en Notion.
4. Editar saldo inicial.
5. Editar nombre, tipo, orden y notas.
6. Desactivar la cuenta.
7. Confirmar que no aparece en venta con producto.
8. Confirmar que no aparece en venta promo.
9. Confirmar que no aparece en egresos ni reposiciones/cobros.
10. Reactivar la cuenta y confirmar que vuelve a los selects.
11. Probar demo mode y sus mensajes simulados.
12. Confirmar que no se escriben rollups/fórmulas como Saldo esperado.

### Pendientes próximos

- Usuarios internos.
- Vista PC responsive.
- Caja/POS local.
- Estadísticas avanzadas.
- Modo offline.

No se hizo commit ni push.

## MVP 4: gestión de productos y variantes

Se agregó administración de productos base y variantes/ítems vendibles sin borrado físico. La pantalla `/productos` ahora tiene pestañas `Stock` y `Admin`; desde Admin se pueden crear y editar productos y variantes, activar/desactivar registros y acceder rápidamente a una nueva variante. Las rutas de formulario son `/productos/nuevo`, `/productos/[productId]/editar`, `/productos/variantes/nueva` y `/productos/variantes/[variantId]/editar`.

Se agregaron `POST /api/productos`, `PATCH /api/productos/[productId]`, `POST /api/variantes` y `PATCH /api/variantes/[variantId]`. Los GET de productos y variantes aceptan `includeInactive=true` para administración. En demo las altas y ediciones responden de forma simulada; contra Notion usan `getDataSourceSchema`, candidatos de propiedad y `updatePage`/`createPage` únicamente en servidor.

La escritura es schema-aware: Nombre, relaciones, precios, control de stock, stock inicial/mínimo, activo, orden y notas se escriben solo con el nombre real detectado. `Stock actual` y `Estado stock` nunca se envían desde estos formularios; el stock actual queda calculado por Notion a partir de movimientos y detalles. Si una propiedad requerida no existe se informa el data source y la propiedad; las opcionales ausentes se omiten con warning. Negocio, presentación, notas y activo son opcionales según el schema real.

Config ahora informa el soporte de escritura de Productos base y Variantes además de listar las propiedades detectadas. Los candidatos incluyen `Nombre`/`Name`, relaciones de producto base, precios alternativos, `Maneja stock`/`Controla stock`, `Stock inicial`/`Stock` y nombres con/sin tilde.

Archivos principales de MVP 4: `src/lib/notion/client.ts`, `src/lib/notion/normalize.ts`, `src/lib/notion/product-mappers.ts`, `src/lib/notion/product-admin.ts`, `src/lib/notion/product-admin-errors.ts`, `src/lib/types.ts`, `app/api/productos/route.ts`, `app/api/productos/[productId]/route.ts`, `app/api/variantes/route.ts`, `app/api/variantes/[variantId]/route.ts`, `app/config/page.tsx`, `app/api/config/status/route.ts`, `app/productos/page.tsx`, `app/productos/nuevo/page.tsx`, `app/productos/[productId]/editar/page.tsx`, `app/productos/variantes/nueva/page.tsx`, `app/productos/variantes/[variantId]/editar/page.tsx` y `src/components/product-admin-forms.tsx`.

## Validación MVP 4

- `npm run typecheck` — correcto, sin errores TypeScript.
- `npm run lint` — correcto, ESLint sin errores.
- `npm run build` — correcto; generó 36 rutas App Router, incluidas las nuevas pantallas y APIs de administración.
- Smoke local sin sesión — `/productos`, `/productos/nuevo`, `/productos/variantes/nueva` y `/config` respondieron HTTP 200; `/api/productos`, `/api/variantes` y `/api/config/status` respondieron HTTP 401.
- No se tocó `.env.local`, no se crearon secretos, no se expuso `NOTION_TOKEN`, no se hizo commit ni push.

## Pruebas manuales recomendadas MVP 4

1. En modo demo, abrir `/productos`, cambiar a Admin y crear un producto base; verificar el mensaje de simulación.
2. Editar el producto y desactivarlo; confirmar que desaparece de Stock pero sigue visible con `includeInactive` en Admin.
3. Crear una variante con stock administrado, precio de venta, costo de reposición, stock inicial y mínimo.
4. Crear una variante sin stock administrado y confirmar que los campos de stock no son obligatorios.
5. Editar precios, presentación y notas; desactivar y reactivar sin borrar páginas.
6. Contra Notion real, abrir Config y verificar que las propiedades necesarias para escritura estén detectadas con sus nombres reales.
7. Confirmar que al crear/editar no se envían `Stock actual` ni `Estado stock`; verificar que Notion los calcule mediante rollups/fórmulas.
8. Probar nombres alternativos (`Name`, `Producto`, `Controla stock`, `Costo`, sin tildes) y revisar que Config no marque faltantes si un candidato existe.

## MVP 4.1 Producto + variantes

### Resumen

Se implementó un flujo unificado en `/productos/nuevo` para crear un Producto base junto con una Variante / Ítem vendible. El usuario puede elegir producto único o producto con múltiples variantes iniciales. La estructura conceptual se mantiene separada: ventas, reposiciones, promos y stock siguen apuntando a variantes.

### Alcance

Incluido: producto único con variante automática, múltiples variantes iniciales, precios y costos por variante, stock inicial/mínimo por variante, activación, orden, notas, duplicar/quitar/colapsar cards, resultado exitoso o parcial y acceso posterior a vender/reponer cuando hay una única variante. Se conserva `/productos/variantes/nueva` para agregar variantes después y se agregó el acceso desde editar producto.

No incluido: Caja/POS, usuarios internos, vista PC completa, cuentas/billeteras avanzadas, estadísticas avanzadas ni modo offline.

### UX

En modo único, el nombre vendible se inicializa con el nombre del producto y sigue siendo editable; el formulario muestra el texto “Este producto se venderá como una única presentación.” En modo múltiple se pueden agregar, quitar, duplicar y colapsar variantes iniciales. Cada card mantiene su propio precio de venta, precio promo, costo de reposición, control de stock, stock inicial, mínimo, activo, orden y notas. El resumen indica cuántas variantes se crearán.

### API

Se agregó `POST /api/productos/crear-con-variantes`. Recibe `product`, `mode` (`single` o `multiple`) y `variants`. Consulta ambos schemas, crea primero el Producto base y luego crea cada variante con la relación `Producto base` apuntando al page ID real recién creado. Si una variante falla, continúa con las restantes y devuelve `207` con `PARTIAL_PRODUCT_WITH_VARIANTS_CREATION`, `productId`, `productUrl`, `createdVariants` y `failedVariants`. Los endpoints existentes de alta/edición individual no se eliminan.

### Notion

Se mantiene Producto base + Variante / Ítem vendible. El producto único crea automáticamente una variante única asociada por page ID. Cada variante conserva su precio de venta, precio promo, costo de reposición y parámetros de stock; el costo usado en ventas/reposiciones sigue viniendo de la variante seleccionada. La construcción usa los helpers schema-aware existentes y omite opcionales ausentes. Nunca se escriben `Stock actual` ni `Estado stock`; solo `Stock inicial` y `Stock mínimo` cuando corresponde, dejando el cálculo actual a Notion.

### Seguridad

El endpoint orquestador requiere sesión. Las llamadas a Notion y `NOTION_TOKEN` permanecen en módulos server-side; el token no se envía al cliente ni se guarda en localStorage. No se modificó `.env.local`.

### Demo mode

El endpoint orquestador simula tanto producto único como producto con múltiples variantes, generando IDs demo y devolviendo los datos necesarios para mostrar el resultado. No se escriben páginas reales en modo demo. El caso parcial queda documentado para probarlo contra Notion o mediante una falla controlada de schema/propiedad.

### Validaciones

Se centralizaron normalización y validación de producto/variante en `src/lib/notion/product-admin.ts`. Producto exige nombre. Producto único exige exactamente una variante; múltiple exige al menos una. Cada variante exige nombre, precio de venta y costo de reposición no negativos; el precio promo es opcional y no negativo. Si maneja stock, exige stock inicial y mínimo no negativos. Los errores de validación ocurren antes de crear el producto para evitar huérfanos por datos inválidos.

### Riesgos conocidos

Notion no ofrece una transacción entre data sources. Si el Producto base se crea y una o más variantes fallan, no se intenta borrar automáticamente el producto; la respuesta parcial entrega el ID/URL del producto y el detalle de variantes creadas/fallidas para revisión o creación manual.

### Archivos modificados

- `app/productos/nuevo/page.tsx`: usa el nuevo formulario unificado.
- `src/components/product-admin-forms.tsx`: agrega selector único/múltiple, cards de variantes, resultado parcial y acciones posteriores; edición de producto incluye “Agregar variante”.
- `app/api/productos/crear-con-variantes/route.ts`: orquestación server-side y respuesta parcial.
- `src/lib/notion/product-admin.ts`: normalización/validación reutilizable y builders schema-aware.
- `app/globals.css`: estilos mobile-first para elección de modo, cards y resultados.
- `app/api/productos/route.ts` y `app/api/variantes/route.ts`: reutilizan validadores centralizados.
- `CODEX_REPORT.md`: documentación MVP 4.1.

### Comandos ejecutados

- `npm run typecheck` — correcto.
- `npm run lint` — correcto.
- `npm run build` — correcto; generó 37 rutas App Router, incluida `POST /api/productos/crear-con-variantes`.
- Smoke local sin sesión — `/productos/nuevo`, `/productos`, `/productos/variantes/nueva` y `/config` respondieron HTTP 200; `POST /api/productos/crear-con-variantes`, `/api/productos` y `/api/variantes` respondieron HTTP 401.

### Pruebas manuales recomendadas

1. Abrir `/productos/nuevo`.
2. Crear producto único sin variantes reales y confirmar que se generan Producto base y Variante única relacionada.
3. Confirmar en Notion que la relación usa el page ID real y que no se envían `Stock actual` ni `Estado stock`.
4. Confirmar que la variante aparece para venta y reposición.
5. Crear producto con múltiples variantes iniciales.
6. Confirmar que cada variante conserva su propio precio, precio promo, costo y stock inicial/mínimo.
7. Probar agregar, quitar, duplicar y colapsar cards.
8. Editar una variante creada desde Admin.
9. Vender y reponer una variante creada.
10. Probar modo demo para producto único y múltiple.
11. Probar una falla de schema o propiedad en Notion y confirmar `PARTIAL_PRODUCT_WITH_VARIANTS_CREATION`, variantes creadas/fallidas y recomendación de revisión.

## MVP 5 Usuarios internos

### Resumen

Se implementó login por usuario interno con PIN individual, configuración del primer PIN, restauración por Admin, sesión firmada con identidad mínima y fallback compatible con `APP_PIN` legacy. El PIN nunca se guarda en texto plano ni se envía al cliente.

### Alcance

Incluido:

- Base Notion opcional `Usuarios` con detección dinámica de schema.
- Roles básicos `Admin` y `Usuario`.
- Alta, edición, activación/desactivación y restauración de PIN.
- Selector de usuario en `/login` cuando la base está disponible.
- Usuario actual visible en el encabezado de la app.
- Endpoint de sesión y permisos Admin para gestión.
- Usuarios demo `Admin` y `Vendedor`.

No incluido todavía: Caja/POS, auditoría completa, permisos finos por pantalla, modo offline, pago dividido, estadísticas avanzadas y vista PC completa.

### Modelo de usuarios

- Un usuario tiene nombre, rol y estado activo.
- Si no tiene hash, el primer PIN válido ingresado se hashea y queda guardado como PIN definitivo.
- Restaurar PIN borra el hash y marca PIN pendiente cuando la propiedad existe; no se genera PIN temporal.
- Se evita desactivar o degradar al único Admin activo.
- Los PIN aceptan entre 4 y 12 dígitos numéricos.
- Sin `USUARIOS_DATA_SOURCE_ID`, el login mantiene `APP_PIN` y la sesión queda como `Admin · Legacy`.
- Las cookies legacy con payload `authenticated` siguen siendo válidas y se interpretan como sesión Admin legacy.

### Rutas nuevas

- `/usuarios`: listado y acciones de administración.
- `/usuarios/nuevo`: alta sin pedir PIN.
- `/usuarios/[userId]/editar`: edición y restauración de PIN.
- `/api/auth/session`: consulta de sesión actual sin exponer secretos.
- `/api/usuarios`: listado para login y CRUD Admin.
- `/api/usuarios/[userId]`: actualización parcial Admin.
- `/api/usuarios/[userId]/reset-pin`: restauración Admin.

### API de autenticación

- `POST /api/auth/login` acepta `{ pin }` en modo legacy o `{ userId, pin }` con Usuarios.
- Primer login de usuario sin PIN devuelve `firstPinSet: true`.
- Login correcto crea cookie httpOnly HMAC con `userId`, `userName`, `role` y `authMode`.
- `GET /api/usuarios` devuelve solo usuarios activos por defecto y `hasPin`/`requiresPinSetup`; nunca devuelve `pinHash`.
- `GET /api/usuarios?includeInactive=true`, POST, PATCH y reset requieren Admin.

### Notion

Se agregó `USUARIOS_DATA_SOURCE_ID` únicamente a `.env.example`; no se modificó `.env.local`. Las propiedades mínimas detectadas son Nombre, Activo, Rol y PIN hash. Las opcionales son PIN pendiente, Orden, Notas y Último acceso. Los candidatos de nombre, rol, hash y demás campos están centralizados en `src/lib/notion/user-admin.ts` y se validan contra el schema real antes de escribir.

Si Rol es `select` o `status`, se usan las opciones existentes y se devuelve un error claro si falta `Admin` o `Usuario`. Si Rol es `rich_text`, se escribe texto. El hash se escribe como texto en la propiedad real detectada.

### Seguridad

- Hash scrypt con salt aleatorio y comparación timing-safe en `src/lib/user-pin.ts`.
- El hash solo circula en server-side; se elimina antes de responder usuarios y no aparece en UI.
- La sesión usa cookie httpOnly, `sameSite=lax`, firma HMAC y expiración de 14 días.
- Todas las rutas existentes siguen exigiendo sesión.
- La gestión de usuarios exige rol Admin.
- No se usa localStorage para PIN ni secretos.
- `NOTION_TOKEN` continúa únicamente en server-side.

### Demo mode

El modo demo incluye Admin con PIN `1234` y Vendedor sin PIN. Vendedor puede configurar su primer PIN, luego validarlo, y Admin puede restaurarlo. Alta, edición y reset se mantienen en memoria y muestran “Guardado simulado en modo demo”. El login legacy con `1234` sigue disponible si se omite el usuario.

### Validaciones

- Nombre obligatorio.
- Rol `Admin` o `Usuario`, con validación contra opciones del schema.
- PIN solo numérico, mínimo 4 y máximo 12.
- Usuario inactivo rechazado.
- PIN incorrecto rechazado con mensaje claro.
- No se permite dejar el sistema sin Admin activo cuando el caso puede detectarse.
- Errores de configuración indican `USUARIOS_DATA_SOURCE_ID` y fallback PIN global.

### Archivos modificados/creados

- `.env.example`: agrega `USUARIOS_DATA_SOURCE_ID`.
- `src/lib/env.ts`: registra la variable nueva.
- `src/lib/auth.ts`: sesión firmada con identidad, roles, modo y compatibilidad legacy.
- `src/lib/user-pin.ts`: validación, hash scrypt y verificación timing-safe.
- `src/lib/notion/user-admin.ts`: candidatos, mappers, schema-aware, CRUD, PIN y último acceso.
- `src/lib/demo-user-store.ts`: usuarios demo mutables en memoria.
- `app/api/auth/login/route.ts`, `app/api/auth/session/route.ts`: login y sesión.
- `app/api/usuarios/route.ts`, `app/api/usuarios/[userId]/route.ts`, `app/api/usuarios/[userId]/reset-pin/route.ts`: API protegida.
- `app/login/page.tsx`: selector de usuario y primer PIN.
- `src/components/app-shell.tsx`: sesión actual en encabezado.
- `src/components/user-admin-forms.tsx`, `app/usuarios/*`: administración visual.
- `app/api/config/status/route.ts`, `app/config/page.tsx`: schema Usuarios, autenticación y acceso a administración.
- `CODEX_REPORT.md`: documentación MVP 5.

### Comandos ejecutados

- `npm run typecheck` — correcto.
- `npm run lint` — correcto.
- `npm run build` — correcto; generó 43 rutas App Router. Se mantuvo el warning informativo de que el plugin de Next no está detectado en la configuración ESLint.
- `git diff --check` — correcto; Git solo informó advertencias de conversión LF/CRLF.
- Smoke demo aislado en puertos 3002/3003, sin modificar archivos: listado sin hash, login Admin, gestión Admin, alta, primer PIN de Vendedor, sesión con usuario/rol, PIN incorrecto, reset y nuevo PIN — correcto.
- Smoke con el `.env.local` existente: `/api/usuarios` informó modo legacy porque no está configurado `USUARIOS_DATA_SOURCE_ID`; no se expusieron valores ni se modificó el archivo.

### Pruebas manuales recomendadas

1. Sin `USUARIOS_DATA_SOURCE_ID`, confirmar login legacy con `APP_PIN`.
2. Configurar Usuarios en el entorno y abrir `/login`.
3. Confirmar selector de usuarios activos y que no aparece ningún hash.
4. Crear usuario desde `/usuarios` sin pedir PIN.
5. Cerrar sesión y seleccionar el usuario nuevo.
6. Ingresar PIN por primera vez y confirmar el mensaje de configuración.
7. Cerrar sesión, probar PIN incorrecto y luego PIN correcto.
8. Desde Admin, restaurar PIN y confirmar que el próximo login permite definir uno nuevo.
9. Desactivar usuario y confirmar que no puede entrar.
10. Confirmar que un Usuario recibe acceso denegado al administrar usuarios.
11. Confirmar en Notion que el hash se guarda en la propiedad candidata real y que Último acceso solo se actualiza si existe como fecha.
12. Revisar Config para Usuarios: consultado, propiedades detectadas y faltantes obligatorias/opcionales.
13. Probar demo: Admin `1234`, Vendedor primer PIN y reset simulado.
14. Repetir `npm run typecheck`, `npm run lint` y `npm run build`.

### Pendientes próximos

- Caja/POS con usuario vendedor, apertura y cierre.
- Registro opcional de Usuario en Movimientos cuando exista la propiedad real.
- Permisos finos por pantalla y auditoría.
- Vista PC responsive.
- Estadísticas avanzadas y modo offline.

## MVP 5.1 Permisos por rol y negocio

### Resumen

Se reemplazó el uso directo de `Admin/Usuario` por permisos centralizados con roles `Admin global`, `Admin negocio` y `Vendedor negocio`. La sesión ahora incluye roles normalizados, negocios asignados y `activeBusinessId`. La UI oculta accesos no permitidos y el backend vuelve a validar cada operación.

### Roles

- **Admin global**: acceso a todos los negocios, usuarios, productos, variantes, stock, cuentas, gastos, ventas, reposición, reset de PIN y configuración sensible.
- **Admin negocio**: administra usuarios, productos, variantes, stock, cuentas, gastos, ventas, reposición y movimientos únicamente dentro de su negocio activo. No puede crear ni editar Admin global.
- **Vendedor negocio**: puede vender productos/promos, consultar productos necesarios y recibir stock mediante reposición simple. No puede administrar usuarios, cuentas, productos, precios, costos maestros, gastos ni configuración.

Los roles legacy se normalizan temporalmente: `Admin` → `Admin global` y `Usuario` → `Vendedor negocio`. Config advierte cuando detecta esos valores.

### Permisos

| Capacidad | Admin global | Admin negocio | Vendedor negocio |
|---|---:|---:|---:|
| Dashboard / ventas | Sí | Sí | Sí |
| Ver movimientos | Sí | Sí, propio negocio | No listado general |
| Usuarios | Todos | Solo negocio asignado | No |
| Productos y variantes admin | Todos | Solo negocio asignado | No; lectura sí |
| Cuentas/billeteras | Todos | Solo negocio asignado | No |
| Gastos/egresos/deudores | Sí | Sí, propio negocio | No |
| Reposición simple | Sí | Sí | Sí |
| Configuración sensible | Sí | No | No |
| Cambiar negocio activo | Sí | No | No |

### Negocio asignado

`src/lib/notion/user-admin.ts` detecta relaciones candidatas `Negocio`, `Negocios`, `Negocios asignados`, `Empresa` y `Empresas`, y devuelve `businessIds` sin incluir ningún PIN hash. La sesión usa el primer negocio asignado como activo; si no existe relación se usa `DEFAULT_NEGOCIO_PAGE_ID` y Config muestra: “Usuarios no tiene relación a Negocios. Se usa negocio por defecto.”

Se agregaron `GET /api/negocios` y `POST /api/session/active-business`. Admin global puede cambiar a cualquier negocio disponible; Admin negocio y Vendedor solo pueden usar negocios asignados.

### UI

- Navegación inferior y acciones de Cargar se filtran por rol.
- Vendedor no ve Usuarios, Cuentas, Config, Deudores, egresos ni la pestaña Admin de Productos.
- Rutas administrativas muestran tarjeta “Acceso denegado” con botón de regreso.
- Formularios de usuario usan los tres roles finales y selector de negocios.
- Admin negocio queda limitado a su negocio activo; Admin global puede asignar múltiples negocios.
- AppShell muestra rol y permite cambiar negocio cuando corresponde.
- Config muestra rol actual, advertencias de relación de negocio y roles legacy.

### Backend

Se protegieron por rol los endpoints de Usuarios, reset de PIN, Productos, Variantes, creación unificada, Cuentas, Egresos, Deudores, Config, ventas, promos y reposición. Además, las actualizaciones reales de productos, variantes y cuentas verifican el negocio relacionado antes de modificar la página. El negocio activo se pasa a los builders de movimientos y detalles para preparar el filtrado multi-negocio.

### Notion

La relación de Usuarios agrega candidatos `Negocio`, `Negocios`, `Negocios asignados`, `Empresa` y `Empresas`. El campo Rol conserva compatibilidad con propiedades `select`, `status` o `rich_text`; si el schema solo tiene opciones legacy, se escriben temporalmente `Admin`/`Usuario` cuando existe correspondencia segura. No se inventan propiedades y nunca se devuelve `PIN hash`.

### Seguridad

- El frontend solo oculta accesos; cada endpoint vuelve a validar sesión, rol y negocio.
- Vendedor recibe 403 al intentar Usuarios, Cuentas, creación de productos, egresos o cambio de negocio.
- Admin negocio recibe 400/403 al intentar crear Admin global o tocar otro negocio.
- `NOTION_TOKEN` continúa server-side y `.env.local` no fue modificado.

### Demo mode

Se agregaron dos negocios demo: `El Tigre` y `Kiosco Familiar`, y tres usuarios:

- Admin global Demo, PIN `1234`, acceso a ambos negocios.
- Admin negocio Demo, negocio El Tigre, configura PIN en primer ingreso.
- Vendedor negocio Demo, negocio El Tigre, configura PIN en primer ingreso.

### Validaciones

- Normalización de roles nuevos y legacy.
- Acceso a negocio activo y rechazo de negocio no asignado.
- Admin negocio no puede crear/editar Admin global.
- Vendedor no puede administrar usuarios, cuentas, productos, variantes, gastos o configuración.
- Reposición sigue disponible para Vendedor sin habilitar edición de productos ni costos maestros.
- Usuarios sin relación de negocio usan fallback y reciben advertencia de Config.

### Archivos modificados/creados

- `src/lib/permissions.ts`: roles, permisos y acceso a negocio.
- `src/lib/auth.ts`: sesión normalizada con `businessIds` y `activeBusinessId`.
- `src/lib/notion/user-admin.ts`: relación Usuario → Negocios, roles finales y schema-aware.
- `src/lib/notion/business-service.ts`, `src/lib/notion/business-access.ts`: negocios disponibles y control de ownership.
- `src/lib/demo-data.ts`, `src/lib/demo-user-store.ts`: negocios y roles demo.
- `app/api/negocios/route.ts`, `app/api/session/active-business/route.ts`: negocio activo.
- `app/api/usuarios/*`: permisos por rol, alcance por negocio y restricciones de Admin global.
- Endpoints de productos, variantes, cuentas, movimientos, deudores y configuración: autorización backend.
- `src/components/app-shell.tsx`, `src/components/permission-gate.tsx`, `src/components/access-denied.tsx`: navegación, selector y protección visual.
- `app/cargar/page.tsx`, `app/productos/page.tsx`, `app/config/page.tsx`, `app/usuarios/*`, `app/cuentas/*`: UX por rol.
- `CODEX_REPORT.md`: documentación MVP 5.1.

### Comandos ejecutados

- `npm run typecheck` — correcto.
- `npm run lint` — correcto.
- `npm run build` — correcto; generó 45 rutas App Router. Se mantuvo el warning informativo del plugin de Next no detectado en ESLint.
- Smoke demo aislado en puerto 3004 — correcto: roles visibles sin hash, Admin global puede cambiar negocio, Admin negocio no crea Admin global, Vendedor recibe 403 en Usuarios/Cuentas/Productos admin/Egresos/cambio de negocio y 200 en lectura de Productos.
- No se modificó `.env.local`; el smoke usó variables vacías solo para el proceso demo.

### Pruebas manuales recomendadas

1. Admin global ve Usuarios, Cuentas, Productos Admin y Config.
2. Admin global cambia entre El Tigre y Kiosco Familiar.
3. Admin negocio ve usuarios únicamente de su negocio.
4. Admin negocio no puede crear Admin global ni cambiar a otro negocio.
5. Vendedor negocio no ve Usuarios, Cuentas, Productos Admin, Deudores ni Config.
6. Vendedor negocio puede vender producto y promo.
7. Vendedor negocio puede acceder a reposición simple.
8. Vendedor negocio no puede editar producto, precio ni costo maestro.
9. Probar acceso directo por URL a `/usuarios`, `/cuentas` y formularios admin como Vendedor.
10. Confirmar 403 backend para endpoints administrativos.
11. Revisar Config: rol, negocio activo, relación detectada, roles legacy y fallback.
12. Probar roles legacy `Admin`/`Usuario` y confirmar el mapeo temporal.
13. Probar los tres roles demo y el cambio de negocio.
14. Repetir typecheck, lint y build.

### Pendientes próximos

- MVP 5.2: reposiciones pendientes, confirmación Admin y snapshot de costos.
- Caja/POS local.
- Filtrado multi-negocio completo en todas las consultas y métricas.
- Vista PC responsive, estadísticas avanzadas y modo offline.

## Corrección MVP 5.1: login agrupado, usuarios por negocio y cuentas operativas

### Bugs encontrados

- Admin negocio podía recibir usuarios sin asignación de negocio y, en consecuencia, ver Admin global en `/usuarios`.
- El formulario de usuario ofrecía Admin global sin considerar la sesión actual.
- Vendedor negocio recibía 403 al consultar `/api/cuentas`, aunque necesitaba cuentas activas para ventas, promos y reposición.
- `/login` mezclaba usuarios de todos los negocios en un único selector.

### Causa

La autorización estaba concentrada en permisos generales de administración y no en operaciones de lectura. Además, la visibilidad de usuarios trataba como visibles los registros sin relaciones de negocio y el frontend no tenía un ámbito de login explícito. Las cuentas tampoco exponían sus relaciones de negocio al mapper ni se validaban contra el negocio activo antes de usarlas en una operación.

### Solución

- Se centralizaron `canSeeManagedUser`, `canCreateUserWithRole`, `canEditUser`, `canResetUserPin`, `canAssignBusinesses` y `getAllowedAssignableRoles` en `src/lib/permissions.ts`.
- Admin negocio solo ve usuarios no globales con intersección entre sus negocios asignados y los del usuario. Los registros sin asignación no se incluyen en ese listado.
- Los roles disponibles en el formulario se calculan según sesión: Admin global ve los tres; Admin negocio solo ve Admin negocio y Vendedor negocio.
- `GET /api/cuentas` distingue administración de lectura operativa: con `includeInactive=true` exige Admin global/Admin negocio; sin ese parámetro permite al Vendedor consultar solo cuentas activas y aplica el filtro de negocio cuando existe la relación.
- Ventas de producto, promos, reposición, ingresos y egresos vuelven a validar que la cuenta esté activa y pertenezca al negocio seleccionado.
- `/login` usa `GET /api/auth/login-options` y agrupa primero por Admin global o Negocio, luego por negocio y finalmente por usuario.

### Backend

- `app/api/auth/login-options/route.ts`: opciones públicas mínimas para login, sin PIN hash, token, cookie ni secretos.
- `app/api/auth/login/route.ts`: valida `loginScope`, `businessId`, rol, pertenencia, usuario activo y primer PIN; fija `activeBusinessId` validado.
- `app/api/usuarios/route.ts`, `app/api/usuarios/[userId]/route.ts` y `reset-pin/route.ts`: filtros y validación server-side para ver, crear, editar, desactivar y resetear usuarios.
- `app/api/cuentas/route.ts` y `app/api/cuentas/[accountId]/route.ts`: lectura operativa, filtrado por negocio y bloqueo de escritura para Vendedor.
- `src/lib/notion/account-admin.ts` y `src/lib/notion/account-service.ts`: detección de relación `Negocio`/`Negocios` y validación de cuenta activa/pertenencia.
- Endpoints de movimientos y `src/lib/notion/product-transactions.ts`/`promo-transactions.ts`: propagación del negocio activo y rechazo `BUSINESS_FORBIDDEN` para cuentas de otro negocio.
- `app/api/config/status/route.ts` y `app/config/page.tsx`: advertencias para relaciones faltantes en Usuarios y Cuentas.

### UI

- `app/login/page.tsx`: flujo en dos niveles Admin global / Negocio, selección automática cuando hay una sola opción y mensaje de primer PIN.
- `app/cargar/venta-producto/page.tsx`, `app/cargar/venta-promo/page.tsx` y `app/cargar/reposicion/page.tsx`: usan `GET /api/cuentas` sin `includeInactive`, muestran cuentas activas y explican qué hacer si no hay cuentas.
- `src/components/user-admin-forms.tsx`: roles y negocio asignable adaptados a la sesión.

### Seguridad

- El frontend oculta opciones, pero el backend vuelve a validar cada rol, negocio, cuenta, scope y operación.
- El endpoint público de login devuelve solo `id`, nombre, rol, `hasPin` y `requiresPinSetup`; no devuelve PIN hash ni datos de entorno.
- `NOTION_TOKEN` continúa exclusivamente en servidor.
- `.env.local` no se tocó y no se crearon secretos.

### Demo

- Se mantienen Admin global Demo con PIN `1234`, Admin negocio Demo y Vendedor negocio Demo con primer PIN.
- Se mantienen los negocios demo El Tigre y Kiosco Familiar.
- Las cuentas demo activas están asignadas a El Tigre para probar ventas y reposición con el Vendedor.

### Comandos ejecutados

- `npm run typecheck` — correcto.
- `npm run lint` — correcto.
- `npm run build` — correcto; generó 46 rutas App Router. Se mantuvo el warning informativo del plugin de Next no detectado en ESLint.
- Smoke contra el `.env.local` existente: `GET /api/auth/login-options` respondió modo `users`, no incluyó `pinHash`, `NOTION_TOKEN` ni hashes, y rechazó con 403 los scopes incompatibles global/negocio.
- Smoke demo aislado en puerto 3006, con variables vacías solo en el proceso: Admin global mostró solo Admin global; El Tigre mostró Admin negocio/Vendedor negocio; Vendedor obtuvo 2 cuentas activas, 403 en cuentas inactivas y 403 en Usuarios; Admin negocio obtuvo 403 al intentar crear Admin global.

### Pruebas manuales recomendadas

1. En demo, abrir `/login` y comprobar primero Admin global / Negocio.
2. Elegir Admin global y confirmar que solo aparece Admin global Demo.
3. Elegir Negocio → El Tigre y confirmar Admin negocio Demo/Vendedor negocio Demo, sin Admin global.
4. Probar primer PIN de Admin negocio y Vendedor negocio.
5. Como Admin global, comprobar los tres roles en `/usuarios` y crear uno de cada tipo.
6. Como Admin negocio, comprobar que no aparece Admin global y que usuarios fuera del negocio no son visibles.
7. Intentar POST/PATCH/reset de Admin global como Admin negocio y confirmar 403.
8. Como Vendedor, comprobar 403 en `/cuentas?includeInactive=true` y 200 con `/api/cuentas` solo activas.
9. Como Vendedor, comprobar cuentas activas en venta producto, venta promo y reposición; sin cuentas debe mostrarse el mensaje operativo.
10. Intentar usar una cuenta inactiva o de otro negocio en ventas/reposición y confirmar rechazo server-side.
11. Abrir Config y revisar relación Usuarios → Negocios, relación Cuentas → Negocios y advertencias de fallback.
12. Repetir typecheck, lint y build después de probar contra Notion real.

### Pendientes

- MVP 5.2: reposiciones pendientes, confirmación Admin y snapshot de costos.
- Caja/POS.
- Completar filtrado multi-negocio en métricas y consultas que aún dependan de fallback.
- Vista PC responsive.

## Corrección final MVP 5.1: listado Usuarios siempre autenticado

### Causa

`GET /api/usuarios` solo pedía sesión cuando se enviaba `includeInactive=true`. La pantalla `/usuarios` usa `includeInactive=false` inicialmente, por lo que recibía todos los usuarios sin ejecutar el filtro de alcance; así podía aparecer un Admin global relacionado al mismo negocio.

### Corrección

- El endpoint ahora exige sesión y permiso de Usuarios en todas las variantes del listado.
- Se agregó `filterManagedUsers` para centralizar el filtrado.
- Admin global ve todos los usuarios.
- Admin negocio solo ve usuarios cuyo rol normalizado no sea `Admin global` y cuya relación de negocio intersecte sus negocios asignados/activo.
- Vendedor negocio recibe 403.
- Se mantiene la misma protección en PATCH y reset de PIN, incluyendo acceso directo por URL.

### Verificación

- Se verificó el filtro tanto para demo como para Notion real.
- No se exponen PIN hash ni secretos.
- `.env.local` no fue modificado.
- No se hizo commit ni push.

## MVP 5.2: reposiciones pendientes, confirmación Admin y snapshot de costos

### Causa y alcance

La reposición podía incrementar stock sin distinguir entre recepción operativa y aprobación administrativa. Además, el costo histórico de una venta o reposición podía depender del costo maestro vigente en vez de quedar guardado en el detalle. Se implementó un flujo explícito con estados `Pendiente`, `Confirmado`, `Rechazado` y `No requiere`, validado contra el schema real de Notion.

### Flujo implementado

- Vendedor negocio: recibe stock inmediatamente, crea Movimiento/Detalle con `Sentido stock = Entrada`, estado `Pendiente`, usuario receptor, costo informado opcional y observación. No puede actualizar el costo maestro.
- Admin global/Admin negocio: consulta `/reposiciones-pendientes`, limitado al negocio cuando corresponde, y puede confirmar usando el costo actual informado o actualizar también el costo maestro.
- Confirmación: guarda el costo final usado, estado `Confirmado`, fecha, usuario confirmador y notas cuando esas propiedades existen.
- Rechazo: no elimina páginas. Primero intenta crear un movimiento y detalle inversos con `Sentido stock = Salida`; si el schema real no permite el ajuste automático, conserva el rechazo y devuelve una advertencia para ajuste manual.

### Estrategia de snapshot

Las ventas de producto y promo guardan el costo de reposición vigente al momento de la operación en `Costo reposición unitario usado`, si existe una propiedad candidata compatible. Las reposiciones guardan inicialmente el costo unitario recibido y, al confirmar, lo reemplazan por `costUsed`. El costo maestro solo cambia cuando un Admin lo solicita expresamente; los históricos mantienen su snapshot y no se recalculan por cambios posteriores.

### Schema y Config

Se centralizaron candidatos para estado, costo snapshot, costo informado, auditoría, movimiento, variante y negocio en `src/lib/notion/replenishment-approval.ts`. No se envían propiedades inventadas: `buildSchemaAwareProperties` selecciona únicamente nombres presentes en el data source. Config detecta y advierte:

- `Falta Costo reposición unitario usado. Los históricos pueden recalcularse si cambia el costo maestro.`
- `Falta Estado confirmación. No se puede gestionar reposiciones pendientes completamente.`
- `La auditoría de reposiciones será limitada.`

### Rutas y permisos

- `GET /api/reposiciones-pendientes`
- `POST /api/reposiciones-pendientes/[detailId]/confirmar`
- `POST /api/reposiciones-pendientes/[detailId]/rechazar`
- Pantalla `/reposiciones-pendientes`, visible y accesible solo para Admin global/Admin negocio.
- `/cargar/reposicion` adapta el formulario para recepción de Vendedor y confirmación directa de Admin.
- Los endpoints vuelven a validar sesión y rol; el token de Notion permanece server-side y no se exponen hashes PIN.

### Demo

El modo demo incluye una reposición pendiente, recepción por Vendedor, confirmación con actualización de costo maestro y rechazo con ajuste inverso. El estado compartido de demo se mantiene entre handlers para que el flujo completo funcione también durante pruebas locales.

### Archivos principales

- `src/lib/notion/replenishment-approval.ts`
- `src/lib/notion/product-transactions.ts`
- `src/lib/notion/promo-transactions.ts`
- `src/lib/demo-replenishment-store.ts`
- `app/api/reposiciones-pendientes/route.ts`
- `app/api/reposiciones-pendientes/[detailId]/confirmar/route.ts`
- `app/api/reposiciones-pendientes/[detailId]/rechazar/route.ts`
- `app/reposiciones-pendientes/page.tsx`
- `app/cargar/reposicion/page.tsx`
- `app/api/config/status/route.ts`, `app/config/page.tsx`
- `src/lib/types.ts`, `src/lib/permissions.ts`, `src/components/app-shell.tsx`

### Comandos y resultados

- `npm run typecheck` — correcto.
- `npm run lint` — correcto.
- `npm run build` — correcto; generó 48 rutas App Router. Se mantuvo el warning informativo de que el plugin de Next no está detectado en la configuración de ESLint.
- Smoke demo limpio en puerto aislado, con `NOTION_TOKEN` vacío solo para el proceso: login Admin/Vendedor 200; Vendedor en Pendientes 403; confirmación 200; recepción pendiente 200; rechazo 200 con `reversalMovementId`; stock demo compensado al finalizar.
- `git diff --check` sin errores de whitespace.
- No se modificó `.env.local`, no se crearon secretos, no se hizo commit ni push.

## MVP 6 Caja/POS local

### Resumen

Se implementó Caja/POS local con apertura de turno, caja activa por usuario y negocio, ventas rápidas multiítem, asociación opcional de movimientos a Caja, cierre con arqueo y listado histórico. La base `Cajas / Turnos` es opcional: el resto de la aplicación no se rompe si falta, pero Caja real muestra configuración incompleta.

### Base Notion Cajas/Turnos

Se agregó `CAJAS_DATA_SOURCE_ID` únicamente en `.env.example`. El helper server-side `src/lib/notion/cash-register.ts` detecta candidatos para Nombre, Negocio, Estado, fechas, usuarios, cuenta efectivo, montos, arqueo, diferencia, ventas, notas y Activo. No se envían propiedades inexistentes; las fórmulas/rollups no se intentan actualizar durante el cierre.

Config advierte si faltan `Estado`, `Fecha apertura`, `Fecha cierre`, `Monto inicial`, `Efectivo contado`, `Negocio` o `Abierta por/Cerrada por`. También advierte si Movimientos no tiene relación Caja y si falta `CAJAS_DATA_SOURCE_ID`.

### Apertura de caja

`POST /api/caja/abrir` valida sesión, negocio activo, cuenta activa del negocio, monto inicial no negativo y ausencia de otra caja abierta para el mismo usuario/negocio. En Notion crea la página con IDs reales de relaciones. En demo conserva el estado en memoria durante la sesión de desarrollo.

### POS

`/pos` requiere caja abierta, permite buscar variantes activas, sumar/restar cantidades, seleccionar cuenta y finalizar una venta multiítem. `POST /api/pos/venta` valida caja, cuenta, negocio, variantes y stock; crea un Movimiento y un Detalle por ítem, conserva el snapshot de costos existente y descuenta stock. El POS tiene acceso rápido a promos, pero las promos complejas siguen en su pantalla actual.

### Cierre de caja

`POST /api/caja/[cashRegisterId]/cerrar` calcula ventas totales y por cuenta, ventas en la cuenta efectivo, efectivo esperado (`inicial + ventas efectivo`), efectivo contado y diferencia (`contado - esperado`). Guarda estado Cerrada, fecha/usuario de cierre y valores editables; las propiedades fórmula/rollup se dejan intactas. La pantalla `/caja` y el resumen muestran el resultado.

### Asociación con movimientos

Las ventas POS y las ventas normales realizadas con una caja abierta agregan la relación `Caja`, si Movimientos tiene alguna de las candidatas `Caja`, `Turno caja`, `Turno de caja`, `Caja / Turno` o `Arqueo`. También agregan `Realizado por`, `Usuario` o `Vendedor` si existe. Si falta la relación, la venta no se bloquea y devuelve: `Movimientos no tiene relación a Caja. Las ventas se guardan, pero no quedan asociadas al turno.` El resumen intenta fallback por fecha, usuario, negocio y período únicamente cuando esas relaciones permiten hacerlo de forma segura; en caso contrario queda limitado y advertido como estimado.

### Permisos por rol

- Admin global puede ver, abrir, cerrar y consultar cajas de cualquier negocio activo, además de vender.
- Admin negocio puede operar y administrar cajas de su negocio, cerrar cajas de usuarios de ese negocio y vender.
- Vendedor negocio puede abrir/cerrar su propia caja, vender y consultar sus propios cierres; no puede cerrar cajas ajenas.
- Todos los endpoints validan sesión, rol, negocio, cuenta y caja en backend.

### Demo mode

El demo permite abrir caja con `Efectivo`, continuar el turno, vender una o varias variantes, descontar stock, consultar totales por cuenta, cerrar caja y verificar diferencia. El estado de cajas, ventas, stock demo y reposiciones usa un archivo temporal compartido con escrituras atómicas para que los distintos workers de Next mantengan el mismo estado durante el desarrollo.

### Seguridad

`NOTION_TOKEN` continúa exclusivamente server-side. No se exponen PIN hash ni secretos, no se guardan PIN en localStorage, no se borran páginas de Notion y `.env.local` no fue tocado.

### Limitaciones conocidas

- Sin pago dividido complejo, tickets/impresión, anulaciones o devoluciones avanzadas.
- Sin integración real de Mercado Pago ni offline/cola de sincronización.
- Sin multi-terminal complejo.
- Si falta la relación Movimientos → Caja, el resumen puede ser estimado o limitado.
- Si Notion falla después de crear el Movimiento, la API devuelve `PARTIAL_PRODUCT_CREATION`, el `movementId` y los `detailIds` creados para revisión manual.

### Archivos modificados principales

- `src/lib/types.ts`, `src/lib/env.ts`, `.env.example`.
- `src/lib/notion/cash-register.ts`, `src/lib/cash-register-errors.ts`.
- `src/lib/demo-cash-store.ts`, `src/lib/demo-replenishment-store.ts`.
- `src/lib/notion/product-transactions.ts`, `src/lib/notion/promo-transactions.ts`.
- `app/api/caja/actual/route.ts`, `app/api/caja/abrir/route.ts`, `app/api/cajas/route.ts`.
- `app/api/caja/[cashRegisterId]/cerrar/route.ts`, `app/api/caja/[cashRegisterId]/resumen/route.ts`, `app/api/pos/venta/route.ts`.
- `app/caja/page.tsx`, `app/caja/abrir/page.tsx`, `app/caja/[cashRegisterId]/cerrar/page.tsx`, `app/caja/[cashRegisterId]/resumen/page.tsx`, `app/cajas/page.tsx`, `app/pos/page.tsx`.
- `app/api/config/status/route.ts`, `src/components/app-shell.tsx`, endpoints de venta de producto/promo y `CODEX_REPORT.md`.

### Comandos ejecutados

- `npm run typecheck` — correcto.
- `npm run lint` — correcto.
- `npm run build` — correcto; generó 56 rutas App Router. Se mantuvo el warning informativo de que el plugin de Next no está detectado en la configuración de ESLint.
- Smoke demo: apertura, bloqueo de segunda apertura, venta POS, cálculo de esperado, cierre y diferencia cero — correcto.
- No se modificó `.env.local` y no se hizo commit ni push.

### Pruebas manuales recomendadas

1. Abrir Config y revisar Cajas/Turnos, propiedades detectadas y relación Movimientos → Caja.
2. Como Vendedor, abrir caja con cuenta activa y monto inicial; intentar abrir otra y confirmar el mensaje de caja ya abierta.
3. Entrar a `/pos`, agregar varias variantes, modificar cantidades, elegir cuenta y finalizar.
4. Confirmar en Notion Movimiento, Detalles, relación a Caja, usuario realizado, stock descontado y snapshot de costos.
5. Revisar `/caja`, comprobar ventas por cuenta y efectivo esperado; cerrar con arqueo exacto y con diferencia.
6. Intentar cerrar una caja de otro usuario como Vendedor y confirmar 403; probar Admin negocio dentro de su negocio y Admin global con todos.
7. Quitar temporalmente la relación Caja en Movimientos y confirmar warning, venta no bloqueada y resumen estimado/limitado.
8. Probar demo abrir/vender/cerrar y verificar que el stock vuelva a reflejar la venta.
9. Contra Notion real, validar que `CAJAS_DATA_SOURCE_ID` y todos los IDs de relaciones correspondan a páginas/data sources reales.

### Pendientes próximos

- Estadísticas avanzadas de caja.
- Offline/cola sync.
- Tickets/impresión.
- Pago dividido.

## Corrección MVP 6: Finalizar venta POS y rediseño mobile-first

### Causa del bug

El botón `Finalizar venta` de `app/pos/page.tsx` no tenía handler `onClick`. Por eso se mostraba como una acción disponible, pero no llamaba a `POST /api/pos/venta`, no modificaba el carrito y tampoco mostraba un error. La corrección conecta el botón con `finish`, bloquea la acción mientras guarda y procesa respuestas JSON válidas o inválidas.

### Correcciones funcionales

- `POST /api/pos/venta` valida sesión, rol vendedor, caja abierta y caja seleccionada, cuenta activa, fecha, cantidades, precio manual y stock.
- En demo, el store compartido por archivo temporal evita que distintos workers de Next vean cajas/ventas diferentes. Las escrituras se hacen con archivo temporal y rename atómico.
- En Notion, una venta POS multiítem crea un solo Movimiento y un Detalle por ítem, todos relacionados con el mismo Movimiento. La respuesta expone `movementId`, `movementIds`, `detailIds`, `cashRegisterId`, `total` y `warnings`.
- Los errores de caja (`no encontrada`, `cerrada`, `sin permiso`) ya no se convierten en un `502` genérico. Los errores parciales conservan `movementId` y `detailIds` en `error.details`.
- El POS no inventa propiedades: conserva la construcción schema-aware y las relaciones `Caja`/`Realizado por` se agregan solo si existen en Movimientos.

### UX POS y Caja

- En móvil, el catálogo ocupa la pantalla y el carrito aparece como barra inferior fija; al tocarla se abre un bottom sheet con cantidades, eliminación, cuenta destino, total y finalización.
- En escritorio, el catálogo usa una grilla más amplia y el carrito queda en un panel lateral sticky.
- Se agregaron búsqueda, filtros por producto base/categoría, límite visible de stock y acceso rápido a Caja, promociones y cierre.
- La pantalla `/caja` conserva la tarjeta de caja activa, monto inicial, ventas, efectivo esperado, arqueo, diferencia y acciones de abrir/cerrar/resumen.

### Archivos modificados en esta corrección

- `app/pos/page.tsx`, `app/globals.css`, `src/components/app-shell.tsx`.
- `app/api/pos/venta/route.ts`.
- `src/lib/notion/product-transactions.ts`.
- `src/lib/demo-pos-state.ts`, `src/lib/demo-cash-store.ts`, `src/lib/demo-replenishment-store.ts`.
- `CODEX_REPORT.md`.

### Comandos ejecutados y resultado

- `npm run typecheck` — correcto.
- `npm run lint` — correcto.
- `npm run build` — correcto; generó 56 rutas App Router. Se mantuvo el warning informativo de que el plugin de Next no está detectado en la configuración de ESLint.
- `git diff --check` — correcto; solo mostró advertencias informativas de conversión de finales de línea CRLF.
- Smoke demo con Browser: `POST /api/pos/venta` respondió 200, el carrito quedó en 0, se mostró `Venta POS simulada correctamente.` y el stock del detergente bajó de 9 a 8. Con viewport móvil de 390×844 se verificó la barra fija `Carrito (1)` y el bottom sheet con cuenta, cantidades y `Finalizar venta`; el viewport fue restaurado al finalizar.

### Pruebas manuales recomendadas

1. En demo, iniciar sesión como Vendedor, abrir Caja y verificar que `/pos` muestre Caja abierta.
2. Agregar dos productos, aumentar/reducir cantidades, comprobar límite de stock y seleccionar una cuenta.
3. Tocar `Finalizar venta` y verificar que se envíe `POST /api/pos/venta`, se vacíe el carrito, se muestre confirmación y se actualice stock/total de Caja.
4. Repetir en móvil: abrir la barra `Carrito (N)`, modificar cantidades desde el bottom sheet, cerrar y volver a abrir.
5. Repetir en escritorio y verificar panel lateral, búsqueda, filtros y acceso a `/caja`.
6. Contra Notion real, comprobar un Movimiento único, un Detalle por producto, relación común al Movimiento, relación a Caja si está configurada y respuesta con warnings cuando una relación opcional no existe.
7. Simular caja inexistente/cerrada y confirmar que la UI muestre un mensaje claro sin perder el estado del carrito.


### Pruebas manuales recomendadas

1. Como Vendedor, recibir stock y verificar que el stock sube, el costo maestro no cambia y aparece `Pendiente`.
2. Como Admin negocio, abrir Pendientes y confirmar solo registros de su negocio.
3. Confirmar una reposición sin actualizar maestro y otra actualizando maestro; comprobar snapshots distintos en históricos.
4. Rechazar una reposición y verificar el detalle/movimiento inverso o la advertencia de ajuste manual.
5. Como Admin global, comprobar acceso a todos los negocios; como Vendedor, comprobar 403 por UI y URL directa.
6. En Config, verificar propiedades detectadas y las tres advertencias cuando falten propiedades opcionales/auditoría.
7. Contra Notion real, revisar que los nombres usados coincidan con el schema de cada data source y que no se envíen propiedades ausentes.

### Pendientes conocidos

- Probar en Notion real con las propiedades nuevas creadas o con schemas legacy sin estado/snapshot para validar las advertencias específicas del workspace.
- Si el data source de Movimientos no tiene las propiedades mínimas necesarias para un ajuste inverso, realizar el ajuste de stock manual indicado por la advertencia de rechazo.

## Mejora MVP 6: Promos en POS, vuelto efectivo y vista PC global

### Resumen

Se amplió el alcance de la mejora anterior: el POS conserva su carrito móvil con barra inferior/bottom sheet y su carrito lateral en PC, y ahora incorpora promos fijas, pago efectivo con `Paga con`/`Vuelto` y una capa desktop general para toda la aplicación.

### Promos dentro del POS

- Se agregó `GET /api/pos/catalog`, que devuelve promos activas fijas con sus componentes, variantes, cantidades, precios y stock conocido.
- `/pos` ahora tiene filtros `Todos`, `Productos` y `Promos`.
- Las promos fijas se pueden agregar al mismo checkout que los productos normales, modificar en cantidad y eliminar.
- La validación de stock multiplica la cantidad de cada componente por la cantidad de promos del carrito y acumula componentes repetidos antes de descontar stock.
- En demo, la venta registra un Movimiento POS, genera detalles simulados por componente y descuenta el stock de las variantes.
- Contra Notion, cada promo fija se guarda con `createPromoSale`, crea un Movimiento y Detalles por componentes y conserva relaciones Promo/Regla si están disponibles. Si se combinan productos y promos en un checkout real, se generan movimientos separados por tipo de transacción, todos asociados a la misma caja.
- Las promos personalizadas con elección de variantes o total manual siguen disponibles en `/cargar/venta-promo`; no se forzó su flujo avanzado dentro del acceso rápido del POS.

### Pago efectivo y vuelto

- Si la cuenta coincide con la cuenta efectivo de la caja o su nombre/tipo contiene `Efectivo`, el POS muestra `Paga con` y `Vuelto`.
- El vuelto se calcula como `Paga con - Total`, se redondea a dos decimales y el botón queda bloqueado si el importe recibido es insuficiente.
- Para Mercado Pago, Transferencia, Débito u otra cuenta no efectivo no se muestra el bloque de vuelto.
- El backend vuelve a validar la cuenta y el importe recibido; no confía solamente en el estado visual del cliente.
- En Movimientos se usan, si existen, las candidatas `Monto recibido`, `Paga con`, `Pagó con`, `Pago con`, `Recibido`, `Vuelto`, `Cambio`, `Dar vuelto`, `Método de pago`, `Metodo de pago` y `Medio de pago`.
- Si faltan esas propiedades, la venta no se bloquea y se devuelve el warning: `Movimientos no tiene Monto recibido/Vuelto; el vuelto se calculó pero no quedó guardado.`

### Vista PC global

La vista PC ya no depende solamente del POS. Desde 1024px se agregó una capa general en `AppShell` con sidebar persistente, navegación por permisos, header superior, contenido ancho y cards/grillas adaptables. En móvil se conserva la navegación inferior y el ancho compacto existente.

Se adaptaron globalmente estas pantallas mediante `AppShell` y CSS responsive:

- `/`, `/cargar`, `/movimientos`, `/productos`, `/promos`;
- `/caja`, `/cajas`, `/pos`, `/reposiciones-pendientes`;
- `/usuarios`, `/cuentas`, `/deudores`, `/config`;
- formularios principales y páginas de detalle.

El dashboard usa más columnas, Cargar usa grilla de acciones, filtros y listas aprovechan el ancho disponible, y productos/promos/cajas/pendientes/cuentas/deudores/usuarios se benefician del layout amplio sin alterar las reglas de permisos. El carrito POS no se rehízo: solo se extendió para incluir promos y pago efectivo.

### Seguridad y compatibilidad

- `NOTION_TOKEN` continúa exclusivamente server-side.
- No se exponen hashes PIN, secretos ni datos sensibles en cliente.
- No se guardan PIN ni secretos en localStorage.
- No se borran páginas de Notion.
- No se tocó `.env.local`, no se hizo commit y no se hizo push.
- Se conservaron las restricciones de MVP 5.1/5.2 y la validación server-side de MVP 6.

### Archivos modificados principales

- `app/pos/page.tsx`, `app/api/pos/venta/route.ts`, `app/api/pos/catalog/route.ts`.
- `src/lib/types.ts`, `src/lib/promo-calculations.ts`, `src/lib/notion/promo-service.ts`.
- `src/lib/notion/product-transactions.ts`, `src/lib/notion/promo-transactions.ts`, `src/lib/notion/cash-register.ts`.
- `app/api/config/status/route.ts`, `src/components/app-shell.tsx`, `app/globals.css`.
- `CODEX_REPORT.md`.

### Comandos ejecutados y resultados

- `npm run typecheck` — correcto.
- `npm run lint` — correcto.
- `npm run build` — correcto; generó 57 rutas App Router. Se mantuvo el warning informativo del plugin de Next no detectado en ESLint.
- `git diff --check` — correcto; solo mostró advertencias informativas de conversión de finales de línea CRLF.

### Pruebas realizadas

- Demo: promo fija `Pack limpieza` visible dentro de POS, agregada al carrito y finalizada con efectivo.
- Demo: `Paga con $6.000` sobre total `$5.000` mostró vuelto `$1.000` y descontó el componente de stock.
- Demo: Mercado Pago no mostró `Paga con`/`Vuelto` y finalizó correctamente.
- Demo: importe efectivo insuficiente dejó `Finalizar venta` bloqueado.
- PC: viewport 1280×900 mostró sidebar global y dashboard ancho; el menú respetó el rol Vendedor.
- Build de producción: se recorrieron `/`, `/cargar`, `/movimientos`, `/productos`, `/promos`, `/caja`, `/cajas`, `/pos`, `/reposiciones-pendientes`, `/cuentas`, `/deudores` y `/config` en viewport 1280×900; todas mostraron sidebar y no presentaron errores de runtime.
- Mobile: se mantuvo el flujo de carrito bottom sheet existente.

### Pruebas manuales recomendadas

1. Contra Notion real, revisar una promo fija con varias reglas y verificar un Movimiento, Detalles por componentes, relaciones Promo/Regla, caja y usuario.
2. Vender dos unidades de una promo y confirmar que el stock de cada componente se descuente dos veces.
3. Probar efectivo con importe exacto, importe superior e importe insuficiente.
4. Probar Mercado Pago/Transferencia/Débito y confirmar que no aparezca el vuelto.
5. Revisar Config y comprobar las propiedades de pago detectadas y sus warnings si faltan.
6. Abrir en navegador de PC las pantallas de dashboard, cargar, movimientos, productos, promos, caja, POS, pendientes, usuarios, cuentas, deudores y configuración.
7. Repetir una navegación móvil y confirmar que no se rompan bottom nav, cards ni bottom sheet.
8. Probar Admin global, Admin negocio y Vendedor para confirmar que el sidebar conserva los permisos existentes.

### Pendientes

- Integrar promos personalizadas complejas en el mismo carrito POS; por ahora conservan su flujo avanzado.
- Pago dividido, tickets/impresión, devoluciones y operación offline continúan fuera de este alcance.
- Validar contra el schema real de Movimientos las opciones disponibles para `Método de pago` si la propiedad existe como select/status.
