import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoVariants } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { createPage, queryDataSource } from "@/lib/notion/client";
import { isActiveNotionPage, mapProductBase, mapSellableVariant } from "@/lib/notion/product-mappers";
import { buildVariantProperties, normalizeVariantInput, validateVariantInput } from "@/lib/notion/product-admin";
import { getDataSourceSchema } from "@/lib/notion/schema";
import { productAdminError } from "@/lib/notion/product-admin-errors";
import { resolveBusinessId } from "@/lib/notion/domain";
import { canManageProducts } from "@/lib/permissions";

export async function GET(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  const params = new URL(request.url).searchParams; const search = (params.get("search") || "").trim().toLowerCase(); const requestedStatus = params.get("stockStatus"); const stockStatus = requestedStatus === "low" || requestedStatus === "empty" ? requestedStatus : params.get("lowStock") === "true" ? "low" : "all"; const productBaseId = params.get("productBaseId") || ""; const includeInactive = params.get("includeInactive") === "true";
  if (includeInactive && !canManageProducts(session)) return forbidden();
  if (isDemoMode()) return NextResponse.json({ ok: true, data: filterVariants(demoVariants, { search, stockStatus, productBaseId, includeInactive }), meta: { demo: true } });
  const dataSourceId = getEnv("VARIANTES_DATA_SOURCE_ID"); if (!dataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar VARIANTES_DATA_SOURCE_ID." } }, { status: 503 });
  try { const [variantResult, productResult] = await Promise.all([queryDataSource(dataSourceId, { page_size: 100 }), getEnv("PRODUCTOS_DATA_SOURCE_ID") ? queryDataSource(getEnv("PRODUCTOS_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] })]); const productNames = new Map<string, string>((productResult.results || []).filter(isActiveNotionPage).map((page: any) => { const product = mapProductBase(page); return [product.id, product.name] as [string, string]; })); const variants = (variantResult.results || []).filter((page: any) => includeInactive || isActiveNotionPage(page)).map((page: any) => mapSellableVariant(page, productNames)); return NextResponse.json({ ok: true, data: filterVariants(variants, { search, stockStatus, productBaseId, includeInactive }) }); }
  catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar las variantes." } }, { status: 502 }); }
}

export async function POST(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  if (!canManageProducts(session)) return forbidden();
  const body = await request.json().catch(() => ({})); const input = normalizeVariantInput(body); const validation = validateVariantInput(input); if (validation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: validation } }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true, data: { id: `demo-variant-${Date.now()}`, ...input, currentStock: input.initialStock || 0, stockStatus: "ok", stockStatusRaw: "OK", stockKnown: input.managesStock }, meta: { demo: true, message: "Variante guardada simulada en modo demo." } });
  const dataSourceId = getEnv("VARIANTES_DATA_SOURCE_ID"); if (!dataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar VARIANTES_DATA_SOURCE_ID." } }, { status: 503 });
  try { const schema = await getDataSourceSchema(dataSourceId); const businessId = await resolveBusinessId(session.activeBusinessId); const built = buildVariantProperties(schema, input, businessId); const page = await createPage(dataSourceId, built.properties); return NextResponse.json({ ok: true, data: { id: page.id, name: input.name }, meta: { warnings: built.warnings } }); }
  catch (error) { return productAdminError(error, "No se pudo crear la variante.", "Variantes / Ítems vendibles"); }
}

function filterVariants(variants: any[], filters: { search: string; stockStatus: string; productBaseId: string; includeInactive: boolean }) { return variants.filter((variant) => { const haystack = `${variant.name} ${variant.variant || ""} ${variant.presentation || ""} ${variant.productBaseName || ""}`.toLowerCase(); return (!filters.search || haystack.includes(filters.search)) && (!filters.productBaseId || variant.productBaseId === filters.productBaseId) && (filters.includeInactive || variant.active !== false) && (filters.stockStatus === "all" || variant.stockStatus === filters.stockStatus); }); }
function unauthorized() { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
function forbidden() { return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para administrar productos." } }, { status: 403 }); }
