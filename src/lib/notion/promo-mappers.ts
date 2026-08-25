import { getFirstCheckbox, getFirstNumber, getFirstSelect, getRelationId, getRichText, getTitle } from "@/lib/notion/normalize";
import { isActiveNotionPage } from "@/lib/notion/product-mappers";
import type { ProductBase, Promo, PromoRule } from "@/lib/types";

export const promoRelationCandidates = ["Promo", "Promos"] as const;
export const ruleProductCandidates = ["Producto base", "Producto", "Productos base"] as const;
export const ruleFixedVariantCandidates = ["Variante fija", "Variante / Ítem", "Variante / Item", "Variante", "Ítem vendible", "Item vendible", "Producto vendido"] as const;

export function mapPromo(page: any): Promo {
  const manualPrice = getFirstNumber(page, ["Precio manual", "Precio promo final", "Precio", "Monto"]);
  const calculatedPrice = getFirstNumber(page, ["Precio calculado", "Precio calculado total", "Total calculado"]);
  const finalPrice = getFirstNumber(page, ["Precio final usado", "Precio final", "Precio usado", "Total promo"]);
  const displayPrice = finalPrice > 0 ? finalPrice : manualPrice > 0 ? manualPrice : calculatedPrice > 0 ? calculatedPrice : 0;
  const priceSource = finalPrice > 0 ? "final" : manualPrice > 0 ? "manual" : calculatedPrice > 0 ? "calculated" : "none";
  return {
    id: page.id,
    name: getTitle(page),
    type: getFirstSelect(page, ["Tipo de promo", "Tipo"]),
    manualPrice,
    calculatedPrice,
    finalPrice,
    displayPrice,
    priceSource,
    active: isActiveNotionPage(page),
    order: getFirstNumber(page, ["Orden"]),
    notes: getRichText(page, "Notas") || getRichText(page, "Descripción"),
  };
}

export function mapPromoRule(page: any, productNames = new Map<string, string>()): PromoRule {
  const fixedVariantId = getRelationId(page, ruleFixedVariantCandidates[0]) || getRelationId(page, "Variante") || getRelationId(page, "Variante / Ítem") || getRelationId(page, "Variante / Item");
  const allowProperty = ["Permite elegir variante", "Elegir variante", "Variante libre"].find((name) => page.properties?.[name]?.checkbox !== undefined);
  const allowVariantChoice = allowProperty ? getFirstCheckbox(page, [allowProperty]) : !fixedVariantId;
  const productBaseId = getRelationId(page, ruleProductCandidates[0]) || getRelationId(page, "Producto") || getRelationId(page, "Productos base");
  return {
    id: page.id,
    name: getTitle(page),
    promoId: getRelationId(page, "Promo") || getRelationId(page, "Promos"),
    productBaseId,
    productBaseName: productNames.get(productBaseId),
    requiredQuantity: Math.max(1, Math.round(getFirstNumber(page, ["Cantidad requerida", "Cantidad", "Cantidad promo"]))),
    allowVariantChoice,
    fixedVariantId: fixedVariantId || undefined,
    active: isActiveNotionPage(page),
    order: getFirstNumber(page, ["Orden"]),
  };
}

export function productNameMap(products: ProductBase[]) {
  return new Map(products.map((product) => [product.id, product.name] as [string, string]));
}
