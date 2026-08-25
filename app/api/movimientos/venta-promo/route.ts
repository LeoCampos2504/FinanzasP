import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoPromos, demoPromoRules, demoVariants } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { createPromoSale, PartialPromoCreationError, PromoOperationError } from "@/lib/notion/promo-transactions";
import { formatNotionError, SchemaValidationError } from "@/lib/notion/schema";
import { calculatePromoTotal, resolvePromoUnitPrice } from "@/lib/promo-calculations";
import { validateStock } from "@/lib/product-calculations";
import type { ManualPromoComponentInput, PromoSaleInput, ResolvedPromoItem } from "@/lib/types";

export async function POST(request: Request) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const body = await request.json().catch(() => ({}));
  const input = normalizeInput(body);
  const validation = validateInput(input);
  if (validation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: validation } }, { status: 400 });
  if (isDemoMode()) {
    try {
      const result = resolveDemo(input);
      return NextResponse.json({ ok: true, data: { movementId: `demo-promo-movement-${Date.now()}`, detailIds: result.items.map((_, i) => `demo-promo-detail-${Date.now()}-${i}`) }, meta: { demo: true, total: result.total, message: "Venta de promo simulada en modo demo." } });
    } catch (error) { return promoErrorResponse(error); }
  }
  if (input.promoId && !getEnv("PROMOS_DATA_SOURCE_ID")) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar PROMOS_DATA_SOURCE_ID." } }, { status: 503 });
  try { return NextResponse.json({ ok: true, data: await createPromoSale(input) }); }
  catch (error) { return promoErrorResponse(error); }
}

function normalizeInput(body: any): PromoSaleInput { return { promoId: body.promoId ? String(body.promoId) : undefined, accountId: String(body.accountId || ""), date: String(body.date || ""), description: body.description ? String(body.description) : undefined, mode: body.mode === "custom" ? "custom" : "fixed", selectedVariantsByRuleId: body.selectedVariantsByRuleId && typeof body.selectedVariantsByRuleId === "object" ? body.selectedVariantsByRuleId : {}, manualComponents: Array.isArray(body.manualComponents) ? body.manualComponents.map((component: any): ManualPromoComponentInput => ({ variantId: String(component?.variantId || ""), quantity: Number(component?.quantity), unitPrice: component?.unitPrice === null || component?.unitPrice === undefined || component?.unitPrice === "" ? null : Number(component.unitPrice), priceMode: component?.priceMode === "Manual" ? "Manual" : "Promo" })) : [], manualTotal: body.manualTotal === null || body.manualTotal === undefined || body.manualTotal === "" ? null : Number(body.manualTotal) }; }
function validateInput(input: PromoSaleInput) { if (input.mode === "fixed" && !input.promoId) return "Elegí una promo para una venta fija."; if (!input.accountId) return "Elegí una cuenta."; if (!input.date) return "La fecha es requerida."; if (input.manualTotal !== null && !(Number(input.manualTotal) > 0)) return "El total manual debe ser mayor a cero."; for (const component of input.manualComponents) { if (!component.variantId) return "Cada componente manual requiere una variante."; if (!Number.isInteger(component.quantity) || component.quantity <= 0) return "La cantidad de cada componente debe ser un entero mayor a cero."; if (component.priceMode === "Manual" && !(Number(component.unitPrice) > 0)) return "El precio manual de cada componente debe ser mayor a cero."; } return ""; }

function resolveDemo(input: PromoSaleInput) {
  const promo = input.promoId ? demoPromos.find((item) => item.id === input.promoId) : undefined;
  if (input.promoId && (!promo || promo.active === false)) throw new PromoOperationError("PROMO_NOT_FOUND", "No se encontró la promo seleccionada.");
  const rules = promo ? demoPromoRules.filter((rule) => rule.promoId === input.promoId && rule.active !== false) : [];
  const items: ResolvedPromoItem[] = rules.map((rule) => {
    const variant = demoVariants.find((item) => item.id === (rule.fixedVariantId || input.selectedVariantsByRuleId[rule.id]));
    if (!variant) throw new PromoOperationError("RULE_VARIANT_REQUIRED", `Elegí una variante para la regla "${rule.name}".`);
    const stock = validateStock(rule.requiredQuantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock);
    if (!stock.ok) throw new PromoOperationError(stock.code, `${rule.name}: ${stock.message}`);
    const price = resolvePromoUnitPrice(input.mode, variant.salePrice, variant.promoPrice);
    return { ruleId: rule.id, ruleName: rule.name, productBaseId: variant.productBaseId, variantId: variant.id, variantName: variant.name, quantity: rule.requiredQuantity, unitPrice: price.value, unitPriceMode: price.detailMode, replacementCost: variant.replacementCost, stockStatus: variant.stockStatus, currentStock: variant.currentStock, managesStock: variant.managesStock, stockKnown: variant.stockKnown };
  });
  const manualItems: ResolvedPromoItem[] = input.manualComponents.map((component) => {
    const variant = demoVariants.find((item) => item.id === component.variantId);
    if (!variant) throw new PromoOperationError("VARIANT_NOT_FOUND", "No se encontró una variante de componente manual.");
    const stock = validateStock(component.quantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock);
    if (!stock.ok) throw new PromoOperationError(stock.code, `Stock insuficiente para ${variant.name}. ${stock.message}`);
    const unitPrice = component.priceMode === "Manual" ? Number(component.unitPrice) : variant.promoPrice > 0 ? variant.promoPrice : variant.salePrice;
    if (!(unitPrice > 0)) throw new PromoOperationError("VALIDATION", `La variante ${variant.name} no tiene un precio válido.`);
    return { ruleId: "", ruleName: "Componente manual", productBaseId: variant.productBaseId, variantId: variant.id, variantName: variant.name, quantity: component.quantity, unitPrice, unitPriceMode: component.priceMode, manualUnitPrice: component.priceMode === "Manual" ? unitPrice : undefined, replacementCost: variant.replacementCost, stockStatus: variant.stockStatus, currentStock: variant.currentStock, managesStock: variant.managesStock, stockKnown: variant.stockKnown };
  });
  const allItems = [...items, ...manualItems];
  if (!allItems.length) throw new PromoOperationError(input.mode === "custom" ? "CUSTOM_COMPONENTS_REQUIRED" : "FIXED_COMPONENTS_REQUIRED", "Agregá al menos un componente o configurá reglas.");
  return { items: allItems, total: calculatePromoTotal(input.mode, promo, allItems, input.manualTotal) };
}

function promoErrorResponse(error: unknown) {
  const operation = error instanceof PromoOperationError ? error : null;
  const schema = error instanceof SchemaValidationError ? error : null;
  const code = operation ? operation.code : schema ? schema.code : "NOTION_ERROR";
  const status = code === "VALIDATION" || code === "CUSTOM_COMPONENTS_REQUIRED" || code === "FIXED_COMPONENTS_REQUIRED" || code === "PROMO_NOT_FOUND" || code === "RULE_VARIANT_REQUIRED" || code === "VARIANT_NOT_FOUND" || code === "VARIANT_NOT_ALLOWED" || code === "ACCOUNT_NOT_FOUND" ? 400 : code === "STOCK_INSUFFICIENT" || code === "STOCK_UNKNOWN" || code === "ACCOUNT_INACTIVE" ? 409 : code === "CONFIG_MISSING" ? 503 : code === "NOTION_SCHEMA_MISSING_PROPERTY" ? 422 : code === "PARTIAL_PROMO_CREATION" ? 502 : 502;
  const message = operation ? operation.message : schema ? schema.message : formatNotionError(error, "No se pudo guardar la venta de la promo.", "Movimientos / Detalle de productos");
  return NextResponse.json({ ok: false, error: { code, message, details: operation ? operation.details : undefined } }, { status });
}
