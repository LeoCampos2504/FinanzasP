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
