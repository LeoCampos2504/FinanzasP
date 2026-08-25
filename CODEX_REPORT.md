# CODEX REPORT - Finanzas El Tigre PWA - MVP 4.5 Cuentas y billeteras

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

### Pendientes próximos

- Cuentas/billeteras avanzadas creadas por usuario.
- Usuarios internos.
- Vista PC responsive.
- Caja/POS local.
- Estadísticas avanzadas.
- Modo offline.
