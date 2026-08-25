import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { calculateProductTotal } from "@/lib/product-calculations";
import { createProductReplenishment, ProductOperationError } from "@/lib/notion/product-transactions";
import { formatNotionError, SchemaValidationError } from "@/lib/notion/schema";
import type { ReplenishmentInput } from "@/lib/types";
import { canReceiveStock } from "@/lib/permissions";
import { isBusinessSeller } from "@/lib/permissions";
import { createDemoReplenishment, getDemoVariant } from "@/lib/demo-replenishment-store";

const origins = ["Fondo reposición", "Ganancias", "Inversión / capital", "No aplica"] as const;
export async function POST(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  if (!canReceiveStock(session)) return forbidden();
  const body = await request.json().catch(() => ({}));
  const input = { ...normalizeInput(body), businessId: session.activeBusinessId, confirmationStatus: isBusinessSeller(session) ? "Pendiente" as const : body.confirmationStatus === "Pendiente" ? "Pendiente" as const : "Confirmado" as const, receivedByUserId: session.userId, confirmedByUserId: isBusinessSeller(session) ? undefined : session.userId, updateMasterCost: isBusinessSeller(session) ? false : body.updateMasterCost === true };
  const validation = validateInput(input);
  if (validation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: validation } }, { status: 400 });
  if (isDemoMode()) {
    const demoVariant = getDemoVariant(input.variantId);
    if (!demoVariant) return NextResponse.json({ ok: false, error: { code: "VARIANT_NOT_FOUND", message: "No se encontró la variante seleccionada." } }, { status: 404 });
    if (demoVariant.businessId && demoVariant.businessId !== input.businessId && !session.role.includes("global")) return NextResponse.json({ ok: false, error: { code: "BUSINESS_FORBIDDEN", message: "La variante seleccionada pertenece a otro negocio." } }, { status: 403 });
    const result = createDemoReplenishment(input, session.userId);
    return NextResponse.json({ ok: true, data: result, meta: { demo: true, total: calculateProductTotal(input.quantity, input.unitCost), message: input.confirmationStatus === "Pendiente" ? "Stock cargado. Quedó pendiente de confirmación del Admin." : "Reposición simulada en modo demo." } });
  }
  if (!getEnv("VARIANTES_DATA_SOURCE_ID")) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar VARIANTES_DATA_SOURCE_ID." } }, { status: 503 });
  try { const result = await createProductReplenishment(input); return NextResponse.json({ ok: true, data: result }); }
  catch (error) { const isProduct = error instanceof ProductOperationError; const isSchema = error instanceof SchemaValidationError; const code = isProduct ? error.code : isSchema ? error.code : "NOTION_ERROR"; const status = code === "BUSINESS_FORBIDDEN" ? 403 : code === "VALIDATION" || code === "VARIANT_NOT_FOUND" || code === "ACCOUNT_NOT_FOUND" ? 400 : code === "ACCOUNT_INACTIVE" ? 409 : code === "CONFIG_MISSING" ? 503 : code === "NOTION_SCHEMA_MISSING_PROPERTY" ? 422 : 502; const message = isProduct || isSchema ? error.message : formatNotionError(error, "No se pudo guardar la reposición.", "Movimientos / Detalle de productos"); return NextResponse.json({ ok: false, error: { code, message, details: isProduct ? error.details : undefined } }, { status }); }
}
function normalizeInput(body: any): ReplenishmentInput { return { variantId: String(body.variantId || ""), quantity: Number(body.quantity), accountId: String(body.accountId || ""), date: String(body.date || ""), unitCost: Number(body.unitCost), origin: body.origin as ReplenishmentInput["origin"], description: body.description ? String(body.description) : undefined, notes: body.notes ? String(body.notes) : undefined, reportedCost: body.reportedCost === undefined || body.reportedCost === null || body.reportedCost === "" ? null : Number(body.reportedCost) }; }
function validateInput(input: ReplenishmentInput) { if (!input.variantId) return "Elegí una variante."; if (!(input.quantity > 0)) return "La cantidad debe ser mayor a cero."; if (!Number.isInteger(input.quantity)) return "La cantidad debe ser un número entero."; if (!input.accountId) return "Elegí una cuenta."; if (!input.date) return "La fecha es requerida."; if (!(input.unitCost > 0)) return "El costo unitario debe ser mayor a cero."; if (input.reportedCost !== null && input.reportedCost !== undefined && (!(input.reportedCost > 0) || !Number.isFinite(input.reportedCost))) return "El costo nuevo informado debe ser mayor a cero."; if (!origins.includes(input.origin)) return "Elegí el origen del dinero."; return ""; }
function unauthorized() { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
function forbidden() { return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para recibir stock." } }, { status: 403 }); }
