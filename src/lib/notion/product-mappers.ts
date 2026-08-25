import { getFirstCheckbox, getFirstNumber, getFirstSelect, getRelationId, getRichText, getTitle, hasNumberProperty } from "@/lib/notion/normalize";
import type { ProductBase, SellableVariant } from "@/lib/types";
import { normalizeStockStatus, stockStatusLabel } from "@/lib/stock";

export function isActiveNotionPage(page: any) {
  const property = page.properties?.Activo || page.properties?.Activa;
  return property ? getFirstCheckbox(page, [page.properties?.Activo ? "Activo" : "Activa"]) : true;
}

export function mapProductBase(page: any): ProductBase {
  return { id: page.id, name: getTitle(page), businessId: getRelationId(page, "Negocio"), active: isActiveNotionPage(page), order: getFirstNumber(page, ["Orden"]), notes: getRichText(page, "Notas") || getRichText(page, "Descripción") };
}

export function mapSellableVariant(page: any, productNames = new Map<string, string>()): SellableVariant {
  const currentStock = getFirstNumber(page, ["Stock actual"]);
  const minimumStock = getFirstNumber(page, ["Stock mínimo"]);
  const statusFromNotion = getFirstSelect(page, ["Estado stock"]);
  const managesStockKnown = page.properties?.["Maneja stock"]?.checkbox !== undefined;
  const managesStock = managesStockKnown ? getFirstCheckbox(page, ["Maneja stock"]) : false;
  const stockKnown = hasNumberProperty(page, ["Stock actual"]);
  const minimumStockKnown = hasNumberProperty(page, ["Stock mínimo"]);
  const stockStatus = normalizeStockStatus(statusFromNotion, { managesStock: managesStockKnown ? managesStock : undefined, currentStock: stockKnown ? currentStock : undefined, minimumStock: minimumStockKnown ? minimumStock : undefined });
  return {
    id: page.id,
    name: getTitle(page),
    productBaseId: getRelationId(page, "Producto base"),
    productBaseName: productNames.get(getRelationId(page, "Producto base")),
    variant: getFirstSelect(page, ["Variante"]) || getRichText(page, "Variante"),
    presentation: getRichText(page, "Presentación") || getFirstSelect(page, ["Presentación"]),
    salePrice: getFirstNumber(page, ["Precio venta individual"]),
    promoPrice: getFirstNumber(page, ["Precio promo unitario"]),
    replacementCost: getFirstNumber(page, ["Costo reposición unitario"]),
    managesStock,
    initialStock: getFirstNumber(page, ["Stock inicial"]),
    minimumStock,
    currentStock,
    stockStatus,
    stockStatusRaw: statusFromNotion || stockStatusLabel(stockStatus),
    active: isActiveNotionPage(page),
    stockKnown,
  };
}
