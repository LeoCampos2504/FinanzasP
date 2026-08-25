import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { envNames, envStatus, isDemoMode } from "@/lib/env";
import { getEnv } from "@/lib/env";
import { getDataSourceSchema, pickPropertyName, schemaPropertyList } from "@/lib/notion/schema";

const dataSources = [
  { key: "MOVIMIENTOS_DATA_SOURCE_ID", label: "Movimientos", required: [["Nombre"], ["Fecha"], ["Ámbito"], ["Tipo"], ["Subtipo"], ["Cuenta"], ["Monto"], ["Estado de pago", "Estado"], ["Origen del dinero"], ["Activo"]], optional: [["Negocio"], ["Deudor"], ["Categoría", "Categoria", "Categoría movimiento", "Categoria movimiento"], ["Descripción", "Descripcion", "Notas", "Nota"], ["Entrada cuenta"], ["Salida cuenta"], ["Movimiento neto cuenta"]] },
  { key: "DEUDORES_DATA_SOURCE_ID", label: "Deudores", required: [["Nombre"], ["Activo", "Activa"]], optional: [["Negocio"], ["Notas", "Nota", "Descripción", "Descripcion"]] },
  { key: "CUENTAS_DATA_SOURCE_ID", label: "Cuentas", required: [["Nombre"]], optional: [["Activa", "Activo"], ["Saldo esperado"], ["Saldo inicial"]] },
  { key: "CATEGORIAS_DATA_SOURCE_ID", label: "Categorías", required: [["Nombre"]], optional: [["Activa", "Activo"], ["Tipo de movimiento"]] },
  { key: "PRODUCTOS_DATA_SOURCE_ID", label: "Productos base", required: [["Nombre"]], optional: [["Negocio"], ["Activo", "Activa"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]] },
  { key: "VARIANTES_DATA_SOURCE_ID", label: "Variantes / Ítems vendibles", required: [["Nombre"], ["Precio venta individual"], ["Costo reposición unitario"], ["Stock actual"], ["Estado stock"], ["Maneja stock"]], optional: [["Producto base"], ["Negocio"], ["Variante"], ["Presentación"], ["Precio promo unitario"], ["Stock inicial"], ["Stock mínimo"], ["Activo", "Activa"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]] },
  { key: "DETALLE_PRODUCTOS_DATA_SOURCE_ID", label: "Detalle de productos", required: [["Nombre"], ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"], ["Variante / Ítem", "Variante / Item", "Variante", "Ítem vendible", "Item vendible", "Producto vendido"], ["Cantidad"], ["Modo de precio"], ["Afecta stock"], ["Sentido stock"], ["Activo"]], optional: [["Negocio"], ["Precio unitario manual"], ["Precio venta individual"], ["Precio promo unitario"], ["Costo reposición unitario"], ["Precio unitario usado"], ["Subtotal venta"], ["Subtotal costo reposición"], ["Cantidad entrada"], ["Cantidad salida"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]] },
  { key: "PROMOS_DATA_SOURCE_ID", label: "Promos", required: [["Nombre"], ["Tipo de promo", "Tipo"], ["Activa", "Activo"]], optional: [["Precio manual"], ["Precio calculado"], ["Precio final usado", "Precio final"], ["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]] },
  { key: "REGLAS_PROMO_DATA_SOURCE_ID", label: "Reglas de promo", required: [["Nombre"], ["Promo", "Promos"], ["Producto base", "Producto", "Productos base"], ["Cantidad requerida", "Cantidad", "Cantidad promo"], ["Permite elegir variante", "Elegir variante", "Variante libre", "Variante fija", "Variante", "Variante / Ítem", "Variante / Item"], ["Activo", "Activa"]], optional: [["Orden"], ["Notas", "Nota", "Descripción", "Descripcion"]] },
] as const;

export async function GET() {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const status = envStatus();
  const schemas = await Promise.all(dataSources.map(async (source) => {
    const dataSourceId = getEnv(source.key);
    const missingRequired = source.required.filter((candidates) => !dataSourceId || !pickPropertyName({ id: dataSourceId, properties: {} }, candidates));
    if (!dataSourceId || isDemoMode()) return { key: source.key, label: source.label, configured: Boolean(dataSourceId), queried: false, properties: [], missingRequired: missingRequired.map((candidates) => candidates.join(" / ")), missingOptional: source.optional.map((candidates) => candidates.join(" / ")), error: dataSourceId ? "No se consulta en modo demo." : "Falta el ID del data source." };
    try {
      const schema = await getDataSourceSchema(dataSourceId);
      return {
        key: source.key,
        label: source.label,
        configured: true,
        queried: true,
        properties: schemaPropertyList(schema),
        missingRequired: source.required.filter((candidates) => !pickPropertyName(schema, candidates)).map((candidates) => candidates.join(" / ")),
        missingOptional: source.optional.filter((candidates) => !pickPropertyName(schema, candidates)).map((candidates) => candidates.join(" / ")),
      };
    } catch (error) {
      return { key: source.key, label: source.label, configured: true, queried: false, properties: [], missingRequired: [], missingOptional: [], error: error instanceof Error ? error.message : "No se pudo consultar el schema." };
    }
  }));
  return NextResponse.json({ ok: true, data: { demoMode: isDemoMode(), variables: envNames.map((name) => ({ name, configured: status[name] })), schemas } });
}
