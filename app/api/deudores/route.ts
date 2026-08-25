import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoDebtors } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { createPage, queryDataSource } from "@/lib/notion/client";
import { getCheckbox, getFormulaNumber, getNumber, getSelect, getTitle } from "@/lib/notion/normalize";
import { resolveBusinessId } from "@/lib/notion/domain";
import { checkbox, relation, richText, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, formatNotionError, getDataSourceSchema } from "@/lib/notion/schema";

export async function GET() {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (isDemoMode() || !getEnv("DEUDORES_DATA_SOURCE_ID")) return NextResponse.json({ ok: true, data: demoDebtors });
  try {
    const result = await queryDataSource(getEnv("DEUDORES_DATA_SOURCE_ID"), { page_size: 100 });
    const debtors = (result.results || []).filter((p: any) => !p.properties?.Activo || getCheckbox(p, "Activo")).map((p: any) => ({ id: p.id, name: getTitle(p), balance: getFormulaNumber(p, "Saldo pendiente") || Math.max(0, getNumber(p, "Total deuda") - getNumber(p, "Total cobrado")), status: getSelect(p, "Estado deuda") || "Pendiente" }));
    return NextResponse.json({ ok: true, data: debtors });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar los deudores." } }, { status: 502 }); }
}

export async function POST(request: Request) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "El nombre es requerido." } }, { status: 400 });
  if (isDemoMode() || !getEnv("DEUDORES_DATA_SOURCE_ID")) return NextResponse.json({ ok: true, data: { id: `demo-${Date.now()}`, name, balance: 0, status: "Sin deuda" }, meta: { demo: true } });
  try {
    const dataSourceId = getEnv("DEUDORES_DATA_SOURCE_ID");
    const schema = await getDataSourceSchema(dataSourceId);
    const businessId = await resolveBusinessId();
    const built = buildSchemaAwareProperties(schema, "Deudores", {
      name: { candidates: ["Nombre"], value: title(name), required: true },
      business: { candidates: ["Negocio"], value: businessId ? relation(businessId) : undefined, required: Boolean(businessId), label: "Negocio" },
      active: { candidates: ["Activo", "Activa"], value: checkbox(true), required: true, label: "Activo" },
      notes: { candidates: ["Notas", "Nota", "Descripción", "Descripcion"], value: body.notes ? richText(String(body.notes)) : undefined, label: "Notas" },
    });
    const page = await createPage(dataSourceId, built.properties);
    return NextResponse.json({ ok: true, data: { id: page.id, name, balance: 0, status: "Sin deuda" }, meta: built.warnings.length ? { warnings: built.warnings } : undefined });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "NOTION_ERROR", message: formatNotionError(error, "No se pudo crear el deudor.", "Deudores") } }, { status: error instanceof Error && "code" in error && String((error as Error & { code?: string }).code) === "NOTION_SCHEMA_MISSING_PROPERTY" ? 422 : 502 }); }
}
