import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { demoPromos, demoPromoRules, demoVariants } from "@/lib/demo-data";
import { getDemoAccount } from "@/lib/demo-account-store";
import { assertDemoCashRegister, recordDemoSale } from "@/lib/demo-cash-store";
import { adjustDemoVariantStock, getDemoVariant } from "@/lib/demo-replenishment-store";
import { createProductPosSale, ProductOperationError } from "@/lib/notion/product-transactions";
import { createPromoSale, PromoOperationError } from "@/lib/notion/promo-transactions";
import { getOpenCashRegisterForSession } from "@/lib/notion/cash-register";
import { assertActiveAccount } from "@/lib/notion/account-service";
import { formatNotionError, SchemaValidationError } from "@/lib/notion/schema";
import { canSell } from "@/lib/permissions";
import { calculateProductTotal, validateStock } from "@/lib/product-calculations";
import { calculatePromoTotal, resolvePromoUnitPrice } from "@/lib/promo-calculations";
import type { Account, PaymentDetails, PosCartItem, PosPromoCartItem, PosSaleInput } from "@/lib/types";

export async function POST(request: Request) {
  let session; try { session = await requireAuth(); } catch { return response("UNAUTHORIZED", "Sesión requerida.", 401); }
  if (!canSell(session)) return response("FORBIDDEN", "No tenés permiso para vender.", 403);
  const body = await request.json().catch(() => ({}));
  const input = normalizeInput(body, session.activeBusinessId, session.userId);
  const validation = validateInput(input);
  if (validation) return response("VALIDATION", validation, 400);
  try {
    if (isDemoMode()) return demoCheckout(input, session);
    const current = await getOpenCashRegisterForSession(session);
    if (!current || current.id !== input.cashRegisterId) throw new PosError("CASH_REGISTER_NOT_OPEN", "Tenés que abrir caja antes de vender.");
    const account = await assertActiveAccount(input.accountId, input.businessId, session);
    const payment = validatePayment(input, account, current.cashRegister.cashAccountId);
    const movementIds: string[] = []; const detailIds: string[] = []; const warnings: string[] = []; let total = 0;
    if (input.items.length) {
      const result = await createProductPosSale({ ...input, promoItems: undefined, payment: movementIds.length ? undefined : payment });
      movementIds.push(result.movementId); detailIds.push(...result.detailIds); warnings.push(...result.warnings); total += result.total;
    }
    for (const promoItem of input.promoItems || []) {
      const result = await createPromoSale({ promoId: promoItem.promoId, accountId: input.accountId, date: input.date, mode: "fixed", selectedVariantsByRuleId: {}, manualComponents: [], businessId: input.businessId, cashRegisterId: input.cashRegisterId, userId: input.userId, quantity: promoItem.quantity, payment: movementIds.length ? undefined : payment, description: input.description });
      movementIds.push(String(result.movementId)); detailIds.push(...result.detailIds.map(String)); warnings.push(...result.warnings); total += result.total;
    }
    const received = payment?.received;
    if (payment?.isCash && received !== undefined && received !== null && received < total) throw new PosError("CASH_RECEIVED_INSUFFICIENT", "El monto recibido es menor al total de la venta.");
    return NextResponse.json({ ok: true, data: { movementId: movementIds.length === 1 ? movementIds[0] : undefined, movementIds, detailIds, cashRegisterId: input.cashRegisterId, total, warnings }, meta: { message: "Venta guardada correctamente." } });
  } catch (error) { return posError(error); }
}

function normalizeInput(body: any, businessId?: string, userId?: string): PosSaleInput {
  const items = Array.isArray(body.items) ? body.items.map((item: any): PosCartItem => ({ variantId: String(item?.variantId || ""), quantity: Number(item?.quantity), unitPrice: item?.unitPrice === undefined || item?.unitPrice === null || item?.unitPrice === "" ? undefined : Number(item.unitPrice) })) : [];
  const promoItems = Array.isArray(body.promoItems) ? body.promoItems.map((item: any): PosPromoCartItem => ({ promoId: String(item?.promoId || ""), quantity: Number(item?.quantity), unitPrice: Number(item?.unitPrice || 0) })) : [];
  const payment = body.payment && typeof body.payment === "object" ? { isCash: Boolean(body.payment.isCash), received: body.payment.received === undefined || body.payment.received === null || body.payment.received === "" ? null : Number(body.payment.received), change: body.payment.change === undefined || body.payment.change === null || body.payment.change === "" ? null : Number(body.payment.change), method: body.payment.method ? String(body.payment.method) : undefined } satisfies PaymentDetails : undefined;
  return { items, promoItems, accountId: String(body.accountId || ""), cashRegisterId: String(body.cashRegisterId || ""), date: String(body.date || new Date().toISOString().slice(0, 10)), description: body.description ? String(body.description) : undefined, businessId, userId, payment, expectedTotal: body.expectedTotal === undefined || body.expectedTotal === null ? undefined : Number(body.expectedTotal) };
}

function validateInput(input: PosSaleInput) {
  if (!input.cashRegisterId) return "Tenés que abrir caja antes de vender.";
  if (!input.accountId) return "Elegí la cuenta donde entra el dinero.";
  if (!input.date) return "La fecha es requerida.";
  if (!input.items.length && !input.promoItems?.length) return "Agregá al menos un producto o promo al carrito.";
  for (const item of input.items) { if (!item.variantId) return "Cada producto requiere una variante."; if (!Number.isInteger(item.quantity) || item.quantity <= 0) return "La cantidad debe ser un entero mayor a cero."; if (item.unitPrice !== undefined && (!Number.isFinite(item.unitPrice) || item.unitPrice < 0)) return "El precio manual no puede ser negativo."; }
  for (const item of input.promoItems || []) { if (!item.promoId) return "Cada promo requiere un identificador."; if (!Number.isInteger(item.quantity) || item.quantity <= 0) return "La cantidad de la promo debe ser un entero mayor a cero."; }
  return "";
}

function isCashAccount(account: Account, cashAccountId?: string) { return Boolean(cashAccountId && account.id === cashAccountId) || /efectivo/i.test(`${account.name} ${account.type || ""}`); }

function validatePayment(input: PosSaleInput, account: Account, cashAccountId?: string): PaymentDetails | undefined {
  const cash = isCashAccount(account, cashAccountId);
  if (!cash) return { isCash: false, method: account.name || account.type || "Otro" };
  if (!Number.isFinite(input.expectedTotal) || (input.expectedTotal as number) < 0) throw new PosError("VALIDATION", "No se pudo validar el total de la venta en efectivo.");
  const received = input.payment?.received;
  if (received === null || received === undefined || !Number.isFinite(received)) throw new PosError("CASH_RECEIVED_REQUIRED", "Ingresá cuánto paga el cliente.");
  if (received < (input.expectedTotal as number)) throw new PosError("CASH_RECEIVED_INSUFFICIENT", "El monto recibido es menor al total de la venta.");
  return { isCash: true, received, change: Math.round((received - (input.expectedTotal as number)) * 100) / 100, method: "Efectivo" };
}

function demoCheckout(input: PosSaleInput, session: Awaited<ReturnType<typeof requireAuth>>) {
  const caja = assertDemoCashRegister(session, input.cashRegisterId); const account = getDemoAccount(input.accountId);
  if (!account || account.active === false || (account.businessIds?.length && !account.businessIds.includes(caja.businessId || ""))) throw new PosError("BUSINESS_FORBIDDEN", "La cuenta no pertenece a tu negocio.");
  const stockDeltas = new Map<string, number>(); let total = 0; let detailCount = 0;
  for (const item of input.items) {
    const variant = getDemoVariant(item.variantId); if (!variant || variant.active === false) throw new PosError("VARIANT_NOT_FOUND", "No se encontró la variante seleccionada.");
    const stock = validateStock(item.quantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock); if (!stock.ok) throw new PosError(stock.code, `${variant.name}: ${stock.message}`);
    const unitPrice = item.unitPrice !== undefined && item.unitPrice > 0 ? item.unitPrice : variant.salePrice; if (!(unitPrice > 0)) throw new PosError("VALIDATION", `La variante ${variant.name} no tiene un precio válido.`);
    total += calculateProductTotal(item.quantity, unitPrice); detailCount += 1; if (variant.managesStock) stockDeltas.set(variant.id, (stockDeltas.get(variant.id) || 0) + item.quantity);
  }
  for (const item of input.promoItems || []) {
    const promo = demoPromos.find((candidate) => candidate.id === item.promoId && candidate.active !== false); const rules = demoPromoRules.filter((rule) => rule.promoId === item.promoId && rule.active !== false);
    if (!promo || !rules.length || rules.some((rule) => rule.allowVariantChoice || !rule.fixedVariantId)) throw new PosError("PROMO_NOT_AVAILABLE", "La promo no es fija o no está disponible para venta rápida.");
    const resolved = rules.map((rule) => { const variant = demoVariants.find((candidate) => candidate.id === rule.fixedVariantId); if (!variant) throw new PosError("VARIANT_NOT_FOUND", `No se encontró el componente de la promo ${promo.name}.`); const quantity = rule.requiredQuantity * item.quantity; const stock = validateStock(quantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock); if (!stock.ok) throw new PosError(stock.code, `${variant.name}: ${stock.message}`); if (variant.managesStock) stockDeltas.set(variant.id, (stockDeltas.get(variant.id) || 0) + quantity); return { variant, quantity, unitPrice: resolvePromoUnitPrice("fixed", variant.salePrice, variant.promoPrice).value }; });
    total += calculatePromoTotal("fixed", promo, resolved.map((part) => ({ ruleId: "", ruleName: promo.name, variantId: part.variant.id, variantName: part.variant.name, productBaseId: part.variant.productBaseId, quantity: part.quantity, unitPrice: part.unitPrice, unitPriceMode: "Sin precio" as const, replacementCost: part.variant.replacementCost, stockStatus: part.variant.stockStatus, currentStock: part.variant.currentStock, managesStock: part.variant.managesStock, stockKnown: part.variant.stockKnown })), item.quantity); detailCount += resolved.length;
  }
  const payment = validatePayment(input, account, caja.cashAccountId);
  for (const [variantId, quantity] of stockDeltas) adjustDemoVariantStock(variantId, -quantity);
  const movementId = recordDemoSale(caja.id, input.accountId, total, input.date, session.userId);
  return NextResponse.json({ ok: true, data: { movementId, movementIds: [movementId], detailIds: Array.from({ length: detailCount }, (_, index) => `demo-pos-detail-${Date.now()}-${index}`), cashRegisterId: input.cashRegisterId, total, warnings: [] }, meta: { demo: true, message: `Venta POS simulada correctamente.${payment?.isCash ? ` Vuelto: $ ${payment.change || 0}` : ""}` } });
}

function posError(error: unknown) {
  const operation = error instanceof ProductOperationError || error instanceof PromoOperationError || error instanceof PosError ? error : null; const schema = error instanceof SchemaValidationError ? error : null;
  const code = operation ? operation.code : schema ? schema.code : error instanceof Error ? error.message : "NOTION_ERROR";
  const status = code === "FORBIDDEN" || code === "BUSINESS_FORBIDDEN" ? 403 : code === "VALIDATION" || code === "CASH_RECEIVED_REQUIRED" || code === "CASH_RECEIVED_INSUFFICIENT" ? 400 : code === "STOCK_INSUFFICIENT" || code === "STOCK_UNKNOWN" || code === "ACCOUNT_INACTIVE" ? 409 : schema ? 422 : 502;
  const message = operation?.message || schema?.message || (code === "CASH_RECEIVED_REQUIRED" ? "Ingresá cuánto paga el cliente." : code === "CASH_RECEIVED_INSUFFICIENT" ? "El monto recibido es menor al total de la venta." : formatNotionError(error, "No se pudo finalizar la venta POS.", "Movimientos / Detalle de productos"));
  return response(code, message, status, operation?.details);
}

class PosError extends Error { code: string; details?: Record<string, unknown>; constructor(code: string, message: string, details?: Record<string, unknown>) { super(message); this.name = "PosError"; this.code = code; this.details = details; } }
function response(code: string, message: string, status: number, details?: Record<string, unknown>) { return NextResponse.json({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, { status }); }
