import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { envNames, envStatus, getEnv, isDemoMode } from "@/lib/env";
import { getDataSourceSchema, pickPropertyName, schemaPropertyList, type DataSourceSchema } from "@/lib/notion/schema";
import { queryDataSource } from "@/lib/notion/client";
import { canViewConfig, isGlobalAdmin } from "@/lib/permissions";

const dataSources = [
  { key: "MOVIMIENTOS_DATA_SOURCE_ID", label: "Movimientos", required: [["Nombre"], ["Fecha"], ["Ámbito"], ["Tipo"], ["Subtipo"], ["Cuenta"], ["Monto"], ["Estado de pago", "Estado"], ["Origen del dinero"], ["Activo"]], optional: [["Negocio"], ["Deudor"], ["Categoría", "Categoria", "Categoría movimiento", "Categoria movimiento"], ["Descripción", "Descripcion", "Notas", "Nota"], ["Entrada cuenta"], ["Salida cuenta"], ["Movimiento neto cuenta"], ["Caja", "Turno caja", "Turno de caja", "Caja / Turno", "Arqueo"], ["Realizado por", "Usuario", "Vendedor"], ["Monto recibido", "Paga con", "Pagó con", "Pago con", "Recibido"], ["Vuelto", "Cambio", "Dar vuelto"], ["Método de pago", "Metodo de pago", "Medio de pago"]], writeRequired: [] },
  { key: "DEUDORES_DATA_SOURCE_ID", label: "Deudores", required: [["Nombre"], ["Activo", "Activa"]], optional: [["Negocio"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [["Nombre"], ["Activo", "Activa"]] },
  { key: "CUENTAS_DATA_SOURCE_ID", label: "Cuentas", required: [["Nombre"]], optional: [["Negocio", "Negocios"], ["Activa", "Activo", "Habilitada", "Habilitado"], ["Es caja principal", "Caja principal", "Principal", "Cuenta principal"], ["Saldo inicial", "Saldo inicial cuenta", "Inicial"], ["Orden", "Order"], ["Tipo de cuenta", "Tipo", "Clase", "Categoría cuenta", "Categoria cuenta"], ["Notas", "Nota", "Descripción", "Descripcion"], ["Color"], ["Icono", "Ícono", "Icon"], ["Total entradas"], ["Total salidas"], ["Movimiento neto"], ["Saldo esperado"]], writeRequired: [["Nombre"]] },
  { key: "CAJAS_DATA_SOURCE_ID", label: "Cajas / Turnos", required: [["Nombre", "Turno", "Caja", "Name"], ["Negocio", "Negocios", "Empresa"], ["Estado caja", "Estado de caja", "Estado"], ["Fecha apertura", "Abierta el", "Inicio", "Fecha inicio"], ["Monto inicial", "Efectivo inicial", "Saldo inicial caja"]], optional: [["Fecha cierre", "Cerrada el", "Fin", "Fecha fin"], ["Abierta por", "Usuario apertura", "Usuario"], ["Cerrada por", "Usuario cierre"], ["Cuenta efectivo", "Cuenta principal", "Cuenta"], ["Efectivo esperado", "Esperado efectivo"], ["Efectivo contado", "Contado", "Conteo efectivo"], ["Diferencia", "Diferencia caja"], ["Total ventas", "Ventas turno"], ["Notas", "Observación", "Observaciones"], ["Activo", "Activa"]], writeRequired: [] },
  { key: "CATEGORIAS_DATA_SOURCE_ID", label: "Categorías", required: [["Nombre"]], optional: [["Activa", "Activo"], ["Tipo de movimiento"]], writeRequired: [] },
  { key: "PRODUCTOS_DATA_SOURCE_ID", label: "Productos base", required: [["Nombre"]], optional: [["Negocio"], ["Activo", "Activa"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [["Nombre"]] },
  { key: "VARIANTES_DATA_SOURCE_ID", label: "Variantes / Ítems vendibles", required: [["Nombre"], ["Producto base", "Producto", "Productos base"], ["Precio venta individual", "Precio venta", "Precio"], ["Costo reposición unitario", "Costo reposicion unitario", "Costo reposición", "Costo reposicion", "Costo"], ["Maneja stock", "Controla stock"]], optional: [["Negocio"], ["Variante"], ["Presentación", "Presentacion", "Formato"], ["Precio promo unitario", "Precio promo", "Precio promocional"], ["Stock actual"], ["Estado stock"], ["Stock inicial", "Stock"], ["Stock mínimo", "Stock minimo", "Mínimo", "Minimo"], ["Activo", "Activa"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [["Nombre"], ["Producto base", "Producto", "Productos base"], ["Precio venta individual", "Precio venta", "Precio"], ["Costo reposición unitario", "Costo reposicion unitario", "Costo reposición", "Costo reposicion", "Costo"], ["Maneja stock", "Controla stock"]] },
  { key: "DETALLE_PRODUCTOS_DATA_SOURCE_ID", label: "Detalle de productos", required: [["Nombre"], ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"], ["Variante / Ítem", "Variante / Item", "Variante", "Ítem vendible", "Item vendible", "Producto vendido"], ["Cantidad"], ["Modo de precio"], ["Afecta stock"], ["Sentido stock"], ["Activo"]], optional: [["Negocio"], ["Precio unitario manual"], ["Precio venta individual"], ["Precio promo unitario"], ["Costo reposición unitario usado", "Costo reposición snapshot", "Costo unitario usado", "Costo usado"], ["Costo nuevo informado", "Nuevo costo informado", "Costo informado"], ["Estado confirmación", "Estado de confirmación", "Confirmación", "Estado reposición"], ["Observación reposición", "Observacion reposicion", "Observación", "Observacion", "Notas"], ["Fecha confirmación", "Fecha de confirmación", "Confirmado el"], ["Confirmado por", "Usuario confirmación", "Usuario confirmacion"], ["Recibido por", "Usuario recepción", "Usuario recepcion", "Realizado por", "Usuario"], ["Precio unitario usado"], ["Subtotal venta"], ["Subtotal costo reposición"], ["Cantidad entrada"], ["Cantidad salida"], ["Orden"]], writeRequired: [] },
  { key: "PROMOS_DATA_SOURCE_ID", label: "Promos", required: [["Nombre"], ["Tipo de promo", "Tipo"], ["Activa", "Activo"]], optional: [["Precio manual"], ["Precio calculado"], ["Precio final usado", "Precio final"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [] },
  { key: "REGLAS_PROMO_DATA_SOURCE_ID", label: "Reglas de promo", required: [["Nombre"], ["Promo", "Promos"], ["Producto base", "Producto", "Productos base"], ["Cantidad requerida", "Cantidad", "Cantidad promo"], ["Permite elegir variante", "Elegir variante", "Variante libre", "Variante fija", "Variante", "Variante / Ítem", "Variante / Item"], ["Activo", "Activa"]], optional: [["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [] },
  { key: "USUARIOS_DATA_SOURCE_ID", label: "Usuarios", required: [["Nombre", "Name"], ["Activo", "Activa", "Habilitado", "Habilitada"], ["Rol", "Role", "Tipo de usuario", "Permiso", "Permisos"], ["PIN hash", "Pin hash", "Hash PIN", "Hash", "Clave hash", "Password hash"]], optional: [["PIN pendiente", "Requiere configurar PIN", "Debe configurar PIN", "Reset PIN", "Restablecer PIN"], ["Orden", "Order"], ["Notas", "Nota", "Descripción", "Descripcion"], ["Último acceso", "Ultimo acceso", "Last login", "Último ingreso", "Ultimo ingreso"], ["Negocio", "Negocios", "Negocios asignados", "Empresa", "Empresas"]], writeRequired: [["Nombre", "Name"], ["Activo", "Activa", "Habilitado", "Habilitada"], ["Rol", "Role", "Tipo de usuario", "Permiso", "Permisos"], ["PIN hash", "Pin hash", "Hash PIN", "Hash", "Clave hash", "Password hash"]] },
] as const;

export async function GET() {
  let session; try { session = await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (!canViewConfig(session)) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para ver esta sección." } }, { status: 403 });
  const status = envStatus();
  const schemas = await Promise.all(dataSources.map(async (source) => {
    const dataSourceId = getEnv(source.key);
    if (!dataSourceId || isDemoMode()) {
      return { key: source.key, label: source.label, configured: Boolean(dataSourceId), queried: false, properties: [], missingRequired: source.required.map((candidates) => candidates.join(" / ")), missingOptional: source.optional.map((candidates) => candidates.join(" / ")), writeRequired: source.writeRequired.map((candidates) => candidates.join(" / ")), writeSupported: false, error: dataSourceId ? "No se consulta en modo demo." : source.key === "CAJAS_DATA_SOURCE_ID" ? "CAJAS_DATA_SOURCE_ID no está configurado." : "Falta el ID del data source." };
    }
    try {
      const schema = await getDataSourceSchema(dataSourceId);
      const missingRequired = source.required.filter((candidates) => !pickPropertyName(schema, candidates)).map((candidates) => candidates.join(" / "));
      const missingOptional = source.optional.filter((candidates) => !pickPropertyName(schema, candidates)).map((candidates) => candidates.join(" / "));
      const missingWriteRequired = source.writeRequired.filter((candidates) => !pickPropertyName(schema, candidates)).map((candidates) => candidates.join(" / "));
      const legacyRoles = source.key === "USUARIOS_DATA_SOURCE_ID" ? await detectLegacyRoles(dataSourceId, schema) : false;
      const warnings = source.key === "DETALLE_PRODUCTOS_DATA_SOURCE_ID" ? buildDetailWarnings(schema) : source.key === "MOVIMIENTOS_DATA_SOURCE_ID" ? buildMovementWarnings(schema) : source.key === "CAJAS_DATA_SOURCE_ID" ? buildCashRegisterWarnings(schema) : [];
      return { key: source.key, label: source.label, configured: true, queried: true, properties: schemaPropertyList(schema), missingRequired, missingOptional, writeRequired: missingWriteRequired, writeSupported: missingWriteRequired.length === 0, legacyRoles, warnings, businessRelation: ["USUARIOS_DATA_SOURCE_ID", "CUENTAS_DATA_SOURCE_ID"].includes(source.key) ? Boolean(pickPropertyName(schema, ["Negocio", "Negocios", "Negocios asignados", "Empresa", "Empresas"])) : undefined };
    } catch (error) {
      return { key: source.key, label: source.label, configured: true, queried: false, properties: [], missingRequired: [], missingOptional: [], writeRequired: [], writeSupported: false, error: error instanceof Error ? error.message : "No se pudo consultar el schema." };
    }
  }));
  const warnings = [
    !getEnv("USUARIOS_DATA_SOURCE_ID") || schemas.find((schema) => schema.key === "USUARIOS_DATA_SOURCE_ID")?.businessRelation === false ? "Usuarios no tiene relación a Negocios. Se usa negocio por defecto." : "",
    schemas.find((schema) => schema.key === "CUENTAS_DATA_SOURCE_ID")?.businessRelation === false ? "Cuentas no tiene relación a Negocios. No se puede aislar cuentas por negocio todavía." : "",
  ].filter(Boolean);
  return NextResponse.json({ ok: true, data: { demoMode: isDemoMode(), authMode: isGlobalAdmin(session) ? "Admin global" : "Admin negocio", variables: isGlobalAdmin(session) ? envNames.map((name) => ({ name, configured: status[name] })) : [], schemas, businessWarning: warnings.join(" ") } });
}

function buildDetailWarnings(schema: DataSourceSchema) {
  const warnings: string[] = [];
  if (!pickPropertyName(schema, ["Costo reposición unitario usado", "Costo reposición snapshot", "Costo unitario usado", "Costo usado"])) warnings.push("Falta Costo reposición unitario usado. Los históricos pueden recalcularse si cambia el costo maestro.");
  if (!pickPropertyName(schema, ["Estado confirmación", "Estado de confirmación", "Confirmación", "Estado reposición"])) warnings.push("Falta Estado confirmación. No se puede gestionar reposiciones pendientes completamente.");
  if (!pickPropertyName(schema, ["Recibido por", "Usuario recepción", "Usuario recepcion", "Realizado por", "Usuario"]) || !pickPropertyName(schema, ["Confirmado por", "Usuario confirmación", "Usuario confirmacion"])) warnings.push("La auditoría de reposiciones será limitada.");
  return warnings;
}

function buildMovementWarnings(schema: DataSourceSchema) {
  const warnings: string[] = [];
  if (!pickPropertyName(schema, ["Caja", "Turno caja", "Turno de caja", "Caja / Turno", "Arqueo"])) warnings.push("Movimientos no tiene relación a Caja. Las ventas se guardan, pero no quedan asociadas al turno.");
  if (!pickPropertyName(schema, ["Monto recibido", "Paga con", "Pagó con", "Pago con", "Recibido"]) && !pickPropertyName(schema, ["Vuelto", "Cambio", "Dar vuelto"])) warnings.push("Movimientos no tiene Monto recibido/Vuelto; el vuelto se calcula pero no queda guardado.");
  return warnings;
}

function buildCashRegisterWarnings(schema: DataSourceSchema) {
  const warnings: string[] = [];
  if (!pickPropertyName(schema, ["Estado caja", "Estado de caja", "Estado"])) warnings.push("Falta Estado. No se puede controlar completamente el ciclo de la caja.");
  if (!pickPropertyName(schema, ["Fecha apertura", "Abierta el", "Inicio", "Fecha inicio"])) warnings.push("Falta Fecha apertura. La auditoría del turno será limitada.");
  if (!pickPropertyName(schema, ["Fecha cierre", "Cerrada el", "Fin", "Fecha fin"])) warnings.push("Falta Fecha cierre. La auditoría del turno será limitada.");
  if (!pickPropertyName(schema, ["Monto inicial", "Efectivo inicial", "Saldo inicial caja"])) warnings.push("Falta Monto inicial. No se puede calcular el efectivo esperado correctamente.");
  if (!pickPropertyName(schema, ["Efectivo contado", "Contado", "Conteo efectivo"])) warnings.push("Falta Efectivo contado. No se podrá guardar el arqueo final.");
  if (!pickPropertyName(schema, ["Negocio", "Negocios", "Empresa"])) warnings.push("Falta Negocio. No se puede aislar la caja por negocio de forma segura.");
  if (!pickPropertyName(schema, ["Abierta por", "Usuario apertura", "Usuario"]) || !pickPropertyName(schema, ["Cerrada por", "Usuario cierre"])) warnings.push("Falta Abierta por/Cerrada por. La auditoría de usuarios será limitada.");
  return warnings;
}

async function detectLegacyRoles(dataSourceId: string, schema: DataSourceSchema) {
  const roleName = pickPropertyName(schema, ["Rol", "Role", "Tipo de usuario", "Permiso", "Permisos"]);
  if (!roleName) return false;
  const definition = schema.properties[roleName]; const options = (((definition as any)[definition.type || ""]?.options || []) as Array<{ name?: string }>).map((option) => option.name);
  if (options.some((option) => option === "Admin" || option === "Usuario")) return true;
  const result = await queryDataSource(dataSourceId, { page_size: 100 });
  return (result.results || []).some((page: any) => { const property = page.properties?.[roleName]; return [property?.select?.name, property?.status?.name, property?.rich_text?.map((item: any) => item.plain_text).join("")].some((value) => value === "Admin" || value === "Usuario"); });
}
