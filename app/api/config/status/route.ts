import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { envNames, envStatus, getEnv, isDemoMode } from "@/lib/env";
import { getDataSourceSchema, pickPropertyName, schemaPropertyList } from "@/lib/notion/schema";

const dataSources = [
  { key: "MOVIMIENTOS_DATA_SOURCE_ID", label: "Movimientos", required: [["Nombre"], ["Fecha"], ["Ámbito"], ["Tipo"], ["Subtipo"], ["Cuenta"], ["Monto"], ["Estado de pago", "Estado"], ["Origen del dinero"], ["Activo"]], optional: [["Negocio"], ["Deudor"], ["Categoría", "Categoria", "Categoría movimiento", "Categoria movimiento"], ["Descripción", "Descripcion", "Notas", "Nota"], ["Entrada cuenta"], ["Salida cuenta"], ["Movimiento neto cuenta"]], writeRequired: [] },
  { key: "DEUDORES_DATA_SOURCE_ID", label: "Deudores", required: [["Nombre"], ["Activo", "Activa"]], optional: [["Negocio"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [["Nombre"], ["Activo", "Activa"]] },
  { key: "CUENTAS_DATA_SOURCE_ID", label: "Cuentas", required: [["Nombre"]], optional: [["Activa", "Activo"], ["Saldo esperado"], ["Saldo inicial"]], writeRequired: [] },
  { key: "CATEGORIAS_DATA_SOURCE_ID", label: "Categorías", required: [["Nombre"]], optional: [["Activa", "Activo"], ["Tipo de movimiento"]], writeRequired: [] },
  { key: "PRODUCTOS_DATA_SOURCE_ID", label: "Productos base", required: [["Nombre"]], optional: [["Negocio"], ["Activo", "Activa"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [["Nombre"]] },
  { key: "VARIANTES_DATA_SOURCE_ID", label: "Variantes / Ítems vendibles", required: [["Nombre"], ["Producto base", "Producto", "Productos base"], ["Precio venta individual", "Precio venta", "Precio"], ["Costo reposición unitario", "Costo reposicion unitario", "Costo reposición", "Costo reposicion", "Costo"], ["Maneja stock", "Controla stock"]], optional: [["Negocio"], ["Variante"], ["Presentación", "Presentacion", "Formato"], ["Precio promo unitario", "Precio promo", "Precio promocional"], ["Stock actual"], ["Estado stock"], ["Stock inicial", "Stock"], ["Stock mínimo", "Stock minimo", "Mínimo", "Minimo"], ["Activo", "Activa"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [["Nombre"], ["Producto base", "Producto", "Productos base"], ["Precio venta individual", "Precio venta", "Precio"], ["Costo reposición unitario", "Costo reposicion unitario", "Costo reposición", "Costo reposicion", "Costo"], ["Maneja stock", "Controla stock"]] },
  { key: "DETALLE_PRODUCTOS_DATA_SOURCE_ID", label: "Detalle de productos", required: [["Nombre"], ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"], ["Variante / Ítem", "Variante / Item", "Variante", "Ítem vendible", "Item vendible", "Producto vendido"], ["Cantidad"], ["Modo de precio"], ["Afecta stock"], ["Sentido stock"], ["Activo"]], optional: [["Negocio"], ["Precio unitario manual"], ["Precio venta individual"], ["Precio promo unitario"], ["Costo reposición unitario"], ["Precio unitario usado"], ["Subtotal venta"], ["Subtotal costo reposición"], ["Cantidad entrada"], ["Cantidad salida"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [] },
  { key: "PROMOS_DATA_SOURCE_ID", label: "Promos", required: [["Nombre"], ["Tipo de promo", "Tipo"], ["Activa", "Activo"]], optional: [["Precio manual"], ["Precio calculado"], ["Precio final usado", "Precio final"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [] },
  { key: "REGLAS_PROMO_DATA_SOURCE_ID", label: "Reglas de promo", required: [["Nombre"], ["Promo", "Promos"], ["Producto base", "Producto", "Productos base"], ["Cantidad requerida", "Cantidad", "Cantidad promo"], ["Permite elegir variante", "Elegir variante", "Variante libre", "Variante fija", "Variante", "Variante / Ítem", "Variante / Item"], ["Activo", "Activa"]], optional: [["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]], writeRequired: [] },
] as const;

export async function GET() {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const status = envStatus();
  const schemas = await Promise.all(dataSources.map(async (source) => {
    const dataSourceId = getEnv(source.key);
    if (!dataSourceId || isDemoMode()) {
      return { key: source.key, label: source.label, configured: Boolean(dataSourceId), queried: false, properties: [], missingRequired: source.required.map((candidates) => candidates.join(" / ")), missingOptional: source.optional.map((candidates) => candidates.join(" / ")), writeRequired: source.writeRequired.map((candidates) => candidates.join(" / ")), writeSupported: false, error: dataSourceId ? "No se consulta en modo demo." : "Falta el ID del data source." };
    }
    try {
      const schema = await getDataSourceSchema(dataSourceId);
      const missingRequired = source.required.filter((candidates) => !pickPropertyName(schema, candidates)).map((candidates) => candidates.join(" / "));
      const missingOptional = source.optional.filter((candidates) => !pickPropertyName(schema, candidates)).map((candidates) => candidates.join(" / "));
      const missingWriteRequired = source.writeRequired.filter((candidates) => !pickPropertyName(schema, candidates)).map((candidates) => candidates.join(" / "));
      return { key: source.key, label: source.label, configured: true, queried: true, properties: schemaPropertyList(schema), missingRequired, missingOptional, writeRequired: missingWriteRequired, writeSupported: missingWriteRequired.length === 0 };
    } catch (error) {
      return { key: source.key, label: source.label, configured: true, queried: false, properties: [], missingRequired: [], missingOptional: [], writeRequired: [], writeSupported: false, error: error instanceof Error ? error.message : "No se pudo consultar el schema." };
    }
  }));
  return NextResponse.json({ ok: true, data: { demoMode: isDemoMode(), variables: envNames.map((name) => ({ name, configured: status[name] })), schemas } });
}
