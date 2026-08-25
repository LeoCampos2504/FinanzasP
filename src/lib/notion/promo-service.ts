import "server-only";
import { getEnv } from "@/lib/env";
import { queryDataSource, retrievePage } from "@/lib/notion/client";
import { getRelationId, getTitle } from "@/lib/notion/normalize";
import { isActiveNotionPage, mapProductBase, mapSellableVariant } from "@/lib/notion/product-mappers";
import { mapPromo, mapPromoRule, productNameMap, promoRelationCandidates, ruleProductCandidates } from "@/lib/notion/promo-mappers";
import { calculatePromoTotal, resolvePromoUnitPrice } from "@/lib/promo-calculations";
import { validateStock } from "@/lib/product-calculations";
import type { ManualPromoComponentInput, ProductBase, Promo, PromoRule, PromoSaleInput, ResolvedPromoItem, SellableVariant } from "@/lib/types";

export class PromoOperationError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) { super(message); this.name = "PromoOperationError"; this.code = code; this.details = details; }
}

export type PromoContext = { promo: Promo; rules: PromoRule[]; products: ProductBase[] };

export async function loadPromo(promoId: string): Promise<Promo> {
  try {
    const page = await retrievePage(promoId);
    const promo = mapPromo(page);
    if (!promo.id || !promo.name) throw new Error("PROMO_NOT_FOUND");
    return promo;
  } catch { throw new PromoOperationError("PROMO_NOT_FOUND", "No se encontró la promo seleccionada."); }
}

export async function loadPromoContext(promoId: string): Promise<PromoContext> {
  const rulesId = getEnv("REGLAS_PROMO_DATA_SOURCE_ID");
  if (!rulesId) return { promo: await loadPromo(promoId), rules: [], products: [] };
  const [promo, rulesResult, productsResult] = await Promise.all([
    loadPromo(promoId),
    queryDataSource(rulesId, { page_size: 100 }),
    getEnv("PRODUCTOS_DATA_SOURCE_ID") ? queryDataSource(getEnv("PRODUCTOS_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] }),
  ]);
  const products = (productsResult.results || []).filter(isActiveNotionPage).map(mapProductBase);
  const productNames = productNameMap(products);
  const rules = (rulesResult.results || [])
    .filter((page: any) => isActiveNotionPage(page) && promoRelationCandidates.some((name) => getRelationId(page, name) === promoId))
    .map((page: any) => mapPromoRule(page, productNames))
    .sort((a: PromoRule, b: PromoRule) => (a.order || 0) - (b.order || 0));
  await Promise.all(rules.filter((rule: PromoRule) => rule.fixedVariantId).map(async (rule: PromoRule) => {
    try { rule.fixedVariantName = getTitle(await retrievePage(rule.fixedVariantId as string)); } catch { /* La resolución de la venta volverá a validar la variante. */ }
  }));
  return { promo, rules, products };
}

export async function listPromoRuleVariants(rule: PromoRule) {
  const variantsId = getEnv("VARIANTES_DATA_SOURCE_ID");
  if (!variantsId) throw new PromoOperationError("CONFIG_MISSING", "Falta configurar VARIANTES_DATA_SOURCE_ID.");
  const [result, productsResult] = await Promise.all([
    queryDataSource(variantsId, { page_size: 100 }),
    getEnv("PRODUCTOS_DATA_SOURCE_ID") ? queryDataSource(getEnv("PRODUCTOS_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] }),
  ]);
  const products = (productsResult.results || []).filter(isActiveNotionPage).map(mapProductBase);
  const names = productNameMap(products);
  return (result.results || []).filter(isActiveNotionPage).map((page: any) => mapSellableVariant(page, names)).filter((variant: SellableVariant) => !rule.productBaseId || variant.productBaseId === rule.productBaseId);
}

export async function getPromoRule(ruleId: string) {
  try { return mapPromoRule(await retrievePage(ruleId)); }
  catch { throw new PromoOperationError("RULE_NOT_FOUND", "No se encontró la regla de promo seleccionada."); }
}

export async function resolvePromoSale(input: PromoSaleInput, context?: PromoContext) {
  if (!context && !input.promoId) throw new PromoOperationError("PROMO_NOT_FOUND", "La venta basada en reglas requiere una promo seleccionada.");
  const loaded = context || await loadPromoContext(input.promoId as string);
  if (loaded.promo.active === false) throw new PromoOperationError("PROMO_INACTIVE", "La promo seleccionada está inactiva.");
  const activeRules = loaded.rules.filter((rule) => rule.active !== false);
  if (!activeRules.length) throw new PromoOperationError("PROMO_WITHOUT_RULES", "La promo no tiene reglas activas configuradas.");
  const items: ResolvedPromoItem[] = [];
  for (const rule of activeRules) {
    if (!rule.allowVariantChoice && !rule.fixedVariantId) throw new PromoOperationError("RULE_VARIANT_REQUIRED", `La regla "${rule.name}" requiere una variante fija configurada.`);
    const variantId = rule.fixedVariantId || input.selectedVariantsByRuleId[rule.id];
    if (!variantId) throw new PromoOperationError("RULE_VARIANT_REQUIRED", `Elegí una variante para la regla "${rule.name}".`);
    let page: any;
    try { page = await retrievePage(variantId); } catch { throw new PromoOperationError("VARIANT_NOT_FOUND", `No se encontró la variante para la regla "${rule.name}".`); }
    const variant = mapSellableVariant(page, productNameMap(loaded.products));
    if (!variant.id || !variant.name || variant.active === false) throw new PromoOperationError("VARIANT_NOT_FOUND", `La variante elegida para "${rule.name}" no está disponible.`);
    if (rule.productBaseId && variant.productBaseId && rule.productBaseId !== variant.productBaseId) throw new PromoOperationError("VARIANT_NOT_ALLOWED", `La variante elegida no pertenece al producto de la regla "${rule.name}".`);
    const stock = validateStock(rule.requiredQuantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock);
    if (!stock.ok) throw new PromoOperationError(stock.code, `${rule.name}: ${stock.message}`, { currentStock: variant.currentStock });
    const price = resolvePromoUnitPrice(input.mode, variant.salePrice, variant.promoPrice);
    items.push({ ruleId: rule.id, ruleName: rule.name, productBaseId: variant.productBaseId, variantId: variant.id, variantName: variant.name, quantity: rule.requiredQuantity, unitPrice: price.value, unitPriceMode: price.detailMode, replacementCost: variant.replacementCost, stockStatus: variant.stockStatus, currentStock: variant.currentStock, managesStock: variant.managesStock, stockKnown: variant.stockKnown });
  }
  const total = calculatePromoTotal(input.mode, loaded.promo, items, input.manualTotal);
  if (!(total > 0)) throw new PromoOperationError("VALIDATION", "La promo no tiene un precio final válido. Indicá un total manual mayor a cero o configurá sus precios.");
  return { ...loaded, items, total };
}

export async function resolveManualPromoComponents(components: ManualPromoComponentInput[]) {
  const items: ResolvedPromoItem[] = [];
  for (const component of components) {
    if (!component.variantId) throw new PromoOperationError("VALIDATION", "Cada componente manual requiere una variante.");
    if (!Number.isInteger(component.quantity) || component.quantity <= 0) throw new PromoOperationError("VALIDATION", "La cantidad de cada componente debe ser un entero mayor a cero.");
    let page: any;
    try { page = await retrievePage(component.variantId); } catch { throw new PromoOperationError("VARIANT_NOT_FOUND", "No se encontró una variante de componente manual."); }
    const variant = mapSellableVariant(page);
    if (!variant.id || !variant.name || variant.active === false) throw new PromoOperationError("VARIANT_NOT_FOUND", `La variante ${component.variantId} no está disponible.`);
    const stock = validateStock(component.quantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock);
    if (!stock.ok) throw new PromoOperationError(stock.code, `Stock insuficiente para ${variant.name}. ${stock.message}`, { currentStock: variant.currentStock });
    const manualUnitPrice = Number(component.unitPrice);
    const unitPrice = component.priceMode === "Manual" ? manualUnitPrice : variant.promoPrice > 0 ? variant.promoPrice : variant.salePrice;
    if (!(unitPrice > 0)) throw new PromoOperationError("VALIDATION", `La variante ${variant.name} no tiene un precio válido para el componente.`);
    items.push({ ruleId: "", ruleName: "Componente manual", variantId: variant.id, variantName: variant.name, quantity: component.quantity, unitPrice, unitPriceMode: component.priceMode, manualUnitPrice: component.priceMode === "Manual" ? unitPrice : undefined, productBaseId: variant.productBaseId, replacementCost: variant.replacementCost, stockStatus: variant.stockStatus, currentStock: variant.currentStock, managesStock: variant.managesStock, stockKnown: variant.stockKnown });
  }
  return items;
}

export function getRuleProductId(page: any) {
  return ruleProductCandidates.map((name) => getRelationId(page, name)).find(Boolean) || "";
}
