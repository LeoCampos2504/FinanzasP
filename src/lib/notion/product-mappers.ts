import { getFirstCheckbox, getFirstNumber, getFirstSelect, getFirstTitle, getRelationId, getRichText, getTitle, hasNumberProperty } from "@/lib/notion/normalize";
import type { ProductBase, SellableVariant } from "@/lib/types";
import { normalizeStockStatus, stockStatusLabel } from "@/lib/stock";

export function isActiveNotionPage(page: any) {
  const property = page.properties?.Activo || page.properties?.Activa;
  return property ? getFirstCheckbox(page, [page.properties?.Activo ? "Activo" : "Activa"]) : true;
}

export function mapProductBase(page: any): ProductBase {
  return { id: page.id, name: getFirstTitle(page, ["Nombre", "Name"]), businessId: getRelationId(page, "Negocio") || getRelationId(page, "Negocios"), active: isActiveNotionPage(page), order: getFirstNumber(page, ["Orden", "Order"]), notes: getRichText(page, "Notas") || getRichText(page, "Descripción") || getRichText(page, "Descripcion") };
}

export function mapSellableVariant(page: any, productNames = new Map<string, string>()): SellableVariant {
  const currentStock = getFirstNumber(page, ["Stock actual"]);
  const minimumStock = getFirstNumber(page, ["Stock mínimo", "Stock minimo", "Mínimo", "Minimo"]);
  const statusFromNotion = getFirstSelect(page, ["Estado stock"]);
  const managesStockKnown = page.properties?.["Maneja stock"]?.checkbox !== undefined || page.properties?.["Controla stock"]?.checkbox !== undefined;
  const managesStock = managesStockKnown ? getFirstCheckbox(page, ["Maneja stock", "Controla stock"]) : false;
  const stockKnown = hasNumberProperty(page, ["Stock actual"]);
  const minimumStockKnown = hasNumberProperty(page, ["Stock mínimo"]);
  const stockStatus = normalizeStockStatus(statusFromNotion, { managesStock: managesStockKnown ? managesStock : undefined, currentStock: stockKnown ? currentStock : undefined, minimumStock: minimumStockKnown ? minimumStock : undefined });
  return {
    id: page.id,
    name: getFirstTitle(page, ["Nombre", "Name"]),
    businessId: getRelationId(page, "Negocio") || getRelationId(page, "Negocios"),
    productBaseId: getRelationId(page, "Producto base") || getRelationId(page, "Producto") || getRelationId(page, "Productos base"),
    productBaseName: productNames.get(getRelationId(page, "Producto base") || getRelationId(page, "Producto") || getRelationId(page, "Productos base")),
    variant: getFirstSelect(page, ["Variante"]) || getRichText(page, "Variante"),
    presentation: getRichText(page, "Presentación") || getRichText(page, "Presentacion") || getRichText(page, "Formato") || getFirstSelect(page, ["Presentación", "Presentacion", "Formato"]),
    salePrice: getFirstNumber(page, ["Precio venta individual", "Precio venta", "Precio"]),
    promoPrice: getFirstNumber(page, ["Precio promo unitario", "Precio promo", "Precio promocional"]),
    replacementCost: getFirstNumber(page, ["Costo reposición unitario", "Costo reposicion unitario", "Costo reposición", "Costo reposicion", "Costo"]),
    managesStock,
    initialStock: getFirstNumber(page, ["Stock inicial", "Stock"]),
    minimumStock,
    currentStock,
    stockStatus,
    stockStatusRaw: statusFromNotion || stockStatusLabel(stockStatus),
    active: isActiveNotionPage(page),
    stockKnown,
  };
}
