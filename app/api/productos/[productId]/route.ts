import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { retrievePage, updatePage } from "@/lib/notion/client";
import { mapProductBase } from "@/lib/notion/product-mappers";
import { buildProductProperties } from "@/lib/notion/product-admin";
import { getDataSourceSchema } from "@/lib/notion/schema";
import { resolveBusinessId } from "@/lib/notion/domain";
import { productAdminError } from "@/lib/notion/product-admin-errors";
import type { ProductBaseInput } from "@/lib/types";
import { canManageProducts } from "@/lib/permissions";
import { assertPageBusinessAccess } from "@/lib/notion/business-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  let session; try { session = await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (!canManageProducts(session)) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para administrar productos." } }, { status: 403 });
  const { productId } = await params; if (!productId) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Falta el ID del producto base." } }, { status: 400 });
  const body = await request.json().catch(() => ({})); const input = normalizePatch(body); const validation = validatePatch(input); if (validation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: validation } }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true, data: { id: productId, ...input }, meta: { demo: true, message: "Producto editado simulado en modo demo." } });
  const dataSourceId = getEnv("PRODUCTOS_DATA_SOURCE_ID"); if (!dataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar PRODUCTOS_DATA_SOURCE_ID." } }, { status: 503 });
  try { await assertPageBusinessAccess(productId, session); const schema = await getDataSourceSchema(dataSourceId); const businessId = input.name !== undefined ? await resolveBusinessId(session.activeBusinessId) : ""; const built = buildProductProperties(schema, input, businessId, false); const page = await updatePage(productId, built.properties); return NextResponse.json({ ok: true, data: mapProductBase(page), meta: { warnings: built.warnings } }); }
  catch (error) { return productAdminError(error, "No se pudo editar el producto base.", "Productos base"); }
}

function normalizePatch(body: any): Partial<ProductBaseInput> { const input: Partial<ProductBaseInput> = {}; if (Object.prototype.hasOwnProperty.call(body, "name")) input.name = String(body.name || "").trim(); if (Object.prototype.hasOwnProperty.call(body, "active")) input.active = Boolean(body.active); if (Object.prototype.hasOwnProperty.call(body, "order")) input.order = body.order === null || body.order === "" ? null : Number(body.order); if (Object.prototype.hasOwnProperty.call(body, "notes")) input.notes = body.notes === null ? null : String(body.notes); return input; }
function validatePatch(input: Partial<ProductBaseInput>) { if (input.name !== undefined && !input.name) return "El nombre del producto es requerido."; if (input.order !== undefined && input.order !== null && !Number.isFinite(input.order)) return "El orden debe ser un número válido."; if (!Object.keys(input).length) return "No hay cambios para guardar."; return ""; }
