import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoProducts } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { createPage, queryDataSource } from "@/lib/notion/client";
import { mapProductBase, isActiveNotionPage } from "@/lib/notion/product-mappers";
import { buildProductProperties, normalizeProductInput, validateProductInput } from "@/lib/notion/product-admin";
import { getDataSourceSchema } from "@/lib/notion/schema";
import { productAdminError } from "@/lib/notion/product-admin-errors";
import { resolveBusinessId } from "@/lib/notion/domain";

export async function GET(request: Request) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
  if (isDemoMode()) return NextResponse.json({ ok: true, data: includeInactive ? demoProducts : demoProducts.filter((product) => product.active !== false), meta: { demo: true } });
  const dataSourceId = getEnv("PRODUCTOS_DATA_SOURCE_ID");
  if (!dataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar PRODUCTOS_DATA_SOURCE_ID." } }, { status: 503 });
  try { const result = await queryDataSource(dataSourceId, { page_size: 100 }); const pages = includeInactive ? result.results || [] : (result.results || []).filter(isActiveNotionPage); return NextResponse.json({ ok: true, data: pages.map(mapProductBase) }); }
  catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar los productos." } }, { status: 502 }); }
}

export async function POST(request: Request) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const body = await request.json().catch(() => ({})); const input = normalizeProductInput(body); const validation = validateProductInput(input); if (validation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: validation } }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true, data: { id: `demo-product-${Date.now()}`, name: input.name, active: input.active, order: input.order || 0, notes: input.notes || "" }, meta: { demo: true, message: "Producto guardado simulado en modo demo." } });
  const dataSourceId = getEnv("PRODUCTOS_DATA_SOURCE_ID"); if (!dataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar PRODUCTOS_DATA_SOURCE_ID." } }, { status: 503 });
  try { const schema = await getDataSourceSchema(dataSourceId); const businessId = await resolveBusinessId(); const built = buildProductProperties(schema, input, businessId); const page = await createPage(dataSourceId, built.properties); return NextResponse.json({ ok: true, data: { id: page.id, name: input.name }, meta: { warnings: built.warnings } }); }
  catch (error) { return productAdminError(error, "No se pudo crear el producto base.", "Productos base"); }
}
