import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoVariants } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { calculateProductTotal, validateStock } from "@/lib/product-calculations";
import { createProductSale, ProductOperationError } from "@/lib/notion/product-transactions";
import { formatNotionError, SchemaValidationError } from "@/lib/notion/schema";
import type { ProductSaleInput } from "@/lib/types";
import { canSell } from "@/lib/permissions";

export async function POST(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  if (!canSell(session)) return forbidden("No tenés permiso para vender.");
  const body = await request.json().catch(() => ({}));
  const input = { ...normalizeInput(body), businessId: session.activeBusinessId };
  const validation = validateInput(input);
  if (validation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: validation } }, { status: 400 });
  if (isDemoMode()) {
    const variant = demoVariants.find((item) => item.id === input.variantId);
    if (!variant) return NextResponse.json({ ok: false, error: { code: "VARIANT_NOT_FOUND", message: "No se encontró la variante seleccionada." } }, { status: 404 });
    const stock = validateStock(input.quantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock);
    if (!stock.ok) return NextResponse.json({ ok: false, error: { code: stock.code, message: stock.message } }, { status: 409 });
    const unitPrice = input.unitPriceMode === "manual" ? Number(input.manualUnitPrice) : variant.salePrice;
    return NextResponse.json({ ok: true, data: { movementId: `demo-movement-${Date.now()}`, detailId: `demo-detail-${Date.now()}` }, meta: { demo: true, total: calculateProductTotal(input.quantity, unitPrice), message: "Venta simulada en modo demo." } });
  }
  if (!getEnv("VARIANTES_DATA_SOURCE_ID")) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar VARIANTES_DATA_SOURCE_ID." } }, { status: 503 });
  try { const result = await createProductSale(input); return NextResponse.json({ ok: true, data: result }); }
  catch (error) { return productErrorResponse(error); }
}

function normalizeInput(body: any): ProductSaleInput { return { variantId: String(body.variantId || ""), quantity: Number(body.quantity), accountId: String(body.accountId || ""), date: String(body.date || ""), description: body.description ? String(body.description) : undefined, unitPriceMode: body.unitPriceMode === "manual" ? "manual" : "individual", manualUnitPrice: body.manualUnitPrice === null || body.manualUnitPrice === undefined || body.manualUnitPrice === "" ? null : Number(body.manualUnitPrice) }; }
function validateInput(input: ProductSaleInput) { if (!input.variantId) return "Elegí una variante."; if (!(input.quantity > 0)) return "La cantidad debe ser mayor a cero."; if (!Number.isInteger(input.quantity)) return "La cantidad debe ser un número entero."; if (!input.accountId) return "Elegí una cuenta."; if (!input.date) return "La fecha es requerida."; if (input.unitPriceMode === "manual" && !(Number(input.manualUnitPrice) > 0)) return "El precio unitario manual debe ser mayor a cero."; return ""; }
function productErrorResponse(error: unknown) { const isProduct = error instanceof ProductOperationError; const isSchema = error instanceof SchemaValidationError; const code = isProduct ? error.code : isSchema ? error.code : "NOTION_ERROR"; const status = code === "BUSINESS_FORBIDDEN" ? 403 : code === "VALIDATION" || code === "VARIANT_NOT_FOUND" || code === "ACCOUNT_NOT_FOUND" ? 400 : code === "STOCK_INSUFFICIENT" || code === "STOCK_UNKNOWN" || code === "ACCOUNT_INACTIVE" ? 409 : code === "CONFIG_MISSING" ? 503 : code === "NOTION_SCHEMA_MISSING_PROPERTY" ? 422 : 502; const message = isProduct || isSchema ? error.message : formatNotionError(error, "No se pudo guardar la venta con producto.", "Movimientos / Detalle de productos"); return NextResponse.json({ ok: false, error: { code, message, details: isProduct ? error.details : undefined } }, { status }); }
function unauthorized() { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
function forbidden(message: string) { return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message } }, { status: 403 }); }
