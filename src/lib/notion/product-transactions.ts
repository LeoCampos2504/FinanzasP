import "server-only";
import { createPage, retrievePage } from "@/lib/notion/client";
import { getEnv } from "@/lib/env";
import { resolveBusinessId } from "@/lib/notion/domain";
import { checkbox, date, number, relation, richText, select, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, getDataSourceSchema, SchemaValidationError } from "@/lib/notion/schema";
import { mapSellableVariant } from "@/lib/notion/product-mappers";
import { calculateProductTotal, validateStock } from "@/lib/product-calculations";
import type { ProductSaleInput, ReplenishmentInput } from "@/lib/types";

export class ProductOperationError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) { super(message); this.name = "ProductOperationError"; this.code = code; this.details = details; }
}

export class PartialProductCreationError extends ProductOperationError {
  constructor(message: string, details: Record<string, unknown>) { super("PARTIAL_PRODUCT_CREATION", message, details); }
}

export async function createProductSale(input: ProductSaleInput) {
  const variant = await getVariant(input.variantId);
  if (input.unitPriceMode === "manual" && !(Number(input.manualUnitPrice) > 0)) throw new ProductOperationError("VALIDATION", "El precio unitario manual debe ser mayor a cero.");
  const unitPrice = input.unitPriceMode === "manual" ? Number(input.manualUnitPrice) : variant.salePrice;
  if (!(unitPrice > 0)) throw new ProductOperationError("VALIDATION", "La variante no tiene un precio de venta individual válido.");
  const stock = validateStock(input.quantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock);
  if (!stock.ok) throw new ProductOperationError(stock.code, stock.message, { currentStock: variant.currentStock });
  return createMovementAndDetail({ kind: "sale", input, variant, unitPrice, total: calculateProductTotal(input.quantity, unitPrice) });
}

export async function createProductReplenishment(input: ReplenishmentInput) {
  const variant = await getVariant(input.variantId);
  const unitPrice = Number(input.unitCost);
  if (!(unitPrice > 0)) throw new ProductOperationError("VALIDATION", "El costo unitario debe ser mayor a cero.");
  return createMovementAndDetail({ kind: "replenishment", input, variant, unitPrice, total: calculateProductTotal(input.quantity, unitPrice) });
}

async function getVariant(variantId: string) {
  let page: any;
  try { page = await retrievePage(variantId); } catch { throw new ProductOperationError("VARIANT_NOT_FOUND", "No se encontró la variante seleccionada."); }
  const variant = mapSellableVariant(page);
  if (!variant.id || !variant.name) throw new ProductOperationError("VARIANT_NOT_FOUND", "No se encontró la variante seleccionada.");
  if (variant.active === false) throw new ProductOperationError("VARIANT_NOT_FOUND", "La variante seleccionada está inactiva.");
  return variant;
}

async function createMovementAndDetail(args: { kind: "sale" | "replenishment"; input: ProductSaleInput | ReplenishmentInput; variant: ReturnType<typeof mapSellableVariant>; unitPrice: number; total: number }) {
  const movementDataSourceId = getEnv("MOVIMIENTOS_DATA_SOURCE_ID");
  const detailDataSourceId = getEnv("DETALLE_PRODUCTOS_DATA_SOURCE_ID");
  if (!movementDataSourceId) throw new ProductOperationError("CONFIG_MISSING", "Falta configurar MOVIMIENTOS_DATA_SOURCE_ID.");
  if (!detailDataSourceId) throw new ProductOperationError("CONFIG_MISSING", "Falta configurar DETALLE_PRODUCTOS_DATA_SOURCE_ID.");
  const [movementSchema, detailSchema, businessId] = await Promise.all([getDataSourceSchema(movementDataSourceId), getDataSourceSchema(detailDataSourceId), resolveBusinessId()]);
  const isSale = args.kind === "sale";
  const input = args.input;
  const description = input.description ? String(input.description) : undefined;
  const origin = isSale ? "No aplica" : (input as ReplenishmentInput).origin;
  const movementBuilt = buildSchemaAwareProperties(movementSchema, "Movimientos", {
    name: { candidates: ["Nombre"], value: title(`${isSale ? "Venta producto" : "Reposición"} - ${args.variant.name}`), required: true },
    date: { candidates: ["Fecha"], value: date(input.date), required: true },
    scope: { candidates: ["Ámbito"], value: select("Negocio"), required: true },
    business: { candidates: ["Negocio"], value: businessId ? relation(businessId) : undefined, required: Boolean(businessId), label: "Negocio" },
    type: { candidates: ["Tipo"], value: select(isSale ? "Ingreso" : "Egreso"), required: true },
    subtype: { candidates: ["Subtipo"], value: select(isSale ? "Venta producto" : "Reposición"), required: true },
    account: { candidates: ["Cuenta"], value: relation(input.accountId), required: true },
    amount: { candidates: ["Monto"], value: number(args.total), required: true },
    paymentStatus: { candidates: ["Estado de pago", "Estado"], value: select("Pagado"), required: true, label: "Estado de pago" },
    moneyOrigin: { candidates: ["Origen del dinero"], value: select(origin), required: true },
    description: { candidates: ["Descripción", "Descripcion", "Notas", "Nota"], value: description ? richText(description) : undefined, label: "Descripción" },
    active: { candidates: ["Activo"], value: checkbox(true), required: true },
    accountEntry: { candidates: ["Entrada cuenta"], value: isSale ? number(args.total) : undefined, label: "Entrada cuenta" },
    accountExit: { candidates: ["Salida cuenta"], value: !isSale ? number(args.total) : undefined, label: "Salida cuenta" },
    accountNet: { candidates: ["Movimiento neto cuenta"], value: number(isSale ? args.total : -args.total), label: "Movimiento neto cuenta" },
    profitUsed: { candidates: ["Ganancia usada"], value: !isSale && origin === "Ganancias" ? number(args.total) : undefined, label: "Ganancia usada" },
    reserveUsed: { candidates: ["Fondo reposición usado"], value: !isSale && origin === "Fondo reposición" ? number(args.total) : undefined, label: "Fondo reposición usado" },
    capitalUsed: { candidates: ["Inversión usada"], value: !isSale && origin === "Inversión / capital" ? number(args.total) : undefined, label: "Inversión usada" },
  });
  const detailBuilt = buildSchemaAwareProperties(detailSchema, "Detalle de productos", {
    name: { candidates: ["Nombre"], value: title(`${isSale ? args.variant.name : `Reposición ${args.variant.name}`} x${input.quantity}`), required: true },
    movement: { candidates: ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"], value: undefined, required: true, label: "relación movimiento" },
    business: { candidates: ["Negocio"], value: businessId ? relation(businessId) : undefined, required: Boolean(businessId), label: "Negocio" },
    variant: { candidates: ["Variante / Ítem", "Variante / Item", "Variante", "Ítem vendible", "Item vendible", "Producto vendido"], value: relation(args.variant.id), required: true, label: "relación variante" },
    quantity: { candidates: ["Cantidad"], value: number(input.quantity), required: true },
    priceMode: { candidates: ["Modo de precio"], value: select(isSale && (input as ProductSaleInput).unitPriceMode === "individual" ? "Individual" : "Manual"), required: true },
    manualPrice: { candidates: ["Precio unitario manual"], value: isSale && (input as ProductSaleInput).unitPriceMode === "individual" ? undefined : number(args.unitPrice), required: !(isSale && (input as ProductSaleInput).unitPriceMode === "individual"), label: "Precio unitario manual" },
    affectsStock: { candidates: ["Afecta stock"], value: checkbox(true), required: true },
    stockDirection: { candidates: ["Sentido stock"], value: select(isSale ? "Salida" : "Entrada"), required: true },
    active: { candidates: ["Activo"], value: checkbox(true), required: true },
  });
  const movement = await createPage(movementDataSourceId, movementBuilt.properties);
  const movementId = movement.id as string;
  const movementProperty = pickExistingProperty(detailSchema, ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"]);
  detailBuilt.properties[movementProperty] = relation(movementId);
  try {
    const detail = await createPage(detailDataSourceId, detailBuilt.properties);
    return { movementId, movementUrl: movement.url, detailId: detail.id, warnings: [...movementBuilt.warnings, ...detailBuilt.warnings] };
  } catch (error) {
    throw new PartialProductCreationError("Movimiento creado, pero falló el detalle. Revisar Notion.", { movementId, movementUrl: movement.url, cause: error instanceof Error ? error.message : String(error) });
  }
}

function pickExistingProperty(schema: Awaited<ReturnType<typeof getDataSourceSchema>>, candidates: string[]) {
  const found = candidates.find((candidate) => schema.properties[candidate]);
  if (!found) throw new SchemaValidationError(schema.id, "Detalle de productos", candidates, candidates[0]);
  return found;
}
