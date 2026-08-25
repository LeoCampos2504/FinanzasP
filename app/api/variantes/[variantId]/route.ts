import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoVariants } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { updatePage } from "@/lib/notion/client";
import { mapSellableVariant } from "@/lib/notion/product-mappers";
import { buildVariantProperties } from "@/lib/notion/product-admin";
import { getDataSourceSchema } from "@/lib/notion/schema";
import { resolveBusinessId } from "@/lib/notion/domain";
import { productAdminError } from "@/lib/notion/product-admin-errors";
import type { VariantInput } from "@/lib/types";
import { canManageProducts } from "@/lib/permissions";
import { assertPageBusinessAccess } from "@/lib/notion/business-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ variantId: string }> }) {
  let session; try { session = await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (!canManageProducts(session)) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para administrar productos." } }, { status: 403 });
  const { variantId } = await params; if (!variantId) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Falta el ID de la variante." } }, { status: 400 });
  const body = await request.json().catch(() => ({})); const input = normalizePatch(body); const validation = validatePatch(input); if (validation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: validation } }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true, data: { id: variantId, ...input }, meta: { demo: true, message: "Variante editada simulada en modo demo." } });
  const dataSourceId = getEnv("VARIANTES_DATA_SOURCE_ID"); if (!dataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar VARIANTES_DATA_SOURCE_ID." } }, { status: 503 });
  try { await assertPageBusinessAccess(variantId, session); const schema = await getDataSourceSchema(dataSourceId); const businessId = input.productBaseId || input.name !== undefined ? await resolveBusinessId(session.activeBusinessId) : ""; const built = buildVariantProperties(schema, input, businessId, false); const page = await updatePage(variantId, built.properties); return NextResponse.json({ ok: true, data: mapSellableVariant(page), meta: { warnings: built.warnings } }); }
  catch (error) { return productAdminError(error, "No se pudo editar la variante.", "Variantes / Ítems vendibles"); }
}

function normalizePatch(body: any): Partial<VariantInput> { const input: Partial<VariantInput> = {}; if (Object.prototype.hasOwnProperty.call(body, "productBaseId")) input.productBaseId = String(body.productBaseId || ""); if (Object.prototype.hasOwnProperty.call(body, "name")) input.name = String(body.name || "").trim(); if (Object.prototype.hasOwnProperty.call(body, "variant")) input.variant = body.variant === null ? null : String(body.variant); if (Object.prototype.hasOwnProperty.call(body, "presentation")) input.presentation = body.presentation === null ? null : String(body.presentation); for (const key of ["salePrice", "promoPrice", "replacementCost", "initialStock", "minimumStock", "order"] as const) if (Object.prototype.hasOwnProperty.call(body, key)) (input as any)[key] = body[key] === null || body[key] === "" ? null : Number(body[key]); if (Object.prototype.hasOwnProperty.call(body, "managesStock")) input.managesStock = Boolean(body.managesStock); if (Object.prototype.hasOwnProperty.call(body, "active")) input.active = Boolean(body.active); if (Object.prototype.hasOwnProperty.call(body, "notes")) input.notes = body.notes === null ? null : String(body.notes); return input; }
function validatePatch(input: Partial<VariantInput>) { if (input.name !== undefined && !input.name) return "El nombre de la variante es requerido."; if (input.salePrice !== undefined && !(input.salePrice !== null && input.salePrice >= 0)) return "Precio venta debe ser mayor o igual a 0."; if (input.replacementCost !== undefined && !(input.replacementCost !== null && input.replacementCost >= 0)) return "Costo de reposición debe ser mayor o igual a 0."; if (input.promoPrice !== undefined && input.promoPrice !== null && input.promoPrice < 0) return "Precio promo debe ser mayor o igual a 0."; for (const key of ["initialStock", "minimumStock", "order"] as const) if (input[key] !== undefined && input[key] !== null && (input[key] as number) < 0) return `${key} debe ser mayor o igual a 0.`; if (!Object.keys(input).length) return "No hay cambios para guardar."; return ""; }
