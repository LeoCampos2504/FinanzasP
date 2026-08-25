import "server-only";
import { createPage, retrievePage } from "@/lib/notion/client";
import { getEnv } from "@/lib/env";
import { resolveBusinessId } from "@/lib/notion/domain";
import { checkbox, date, number, relation, richText, select, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, getDataSourceSchema, pickPropertyName, pickSelectOption, SchemaValidationError } from "@/lib/notion/schema";
import { mapSellableVariant } from "@/lib/notion/product-mappers";
import { calculateProductTotal, validateStock } from "@/lib/product-calculations";
import type { ProductSaleInput, ReplenishmentInput } from "@/lib/types";
import { AccountOperationError, assertActiveAccount } from "@/lib/notion/account-service";
import { confirmationStatusValue, detailApprovalCandidates, updateVariantMasterCost } from "@/lib/notion/replenishment-approval";
import { movementCashRegisterCandidates, movementPaymentChangeCandidates, movementPaymentMethodCandidates, movementPaymentReceivedCandidates, movementUserCandidates } from "@/lib/notion/cash-register";

export class ProductOperationError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) { super(message); this.name = "ProductOperationError"; this.code = code; this.details = details; }
}

export class PartialProductCreationError extends ProductOperationError {
  constructor(message: string, details: Record<string, unknown>) { super("PARTIAL_PRODUCT_CREATION", message, details); }
}

export async function createProductSale(input: ProductSaleInput) {
  await ensureActiveAccount(input.accountId, input.businessId);
  const variant = await getVariant(input.variantId, input.businessId);
  if (input.unitPriceMode === "manual" && !(Number(input.manualUnitPrice) > 0)) throw new ProductOperationError("VALIDATION", "El precio unitario manual debe ser mayor a cero.");
  const unitPrice = input.unitPriceMode === "manual" ? Number(input.manualUnitPrice) : variant.salePrice;
  if (!(unitPrice > 0)) throw new ProductOperationError("VALIDATION", "La variante no tiene un precio de venta individual válido.");
  const stock = validateStock(input.quantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock);
  if (!stock.ok) throw new ProductOperationError(stock.code, stock.message, { currentStock: variant.currentStock });
  return createMovementAndDetail({ kind: "sale", input, variant, unitPrice, total: calculateProductTotal(input.quantity, unitPrice) });
}

export async function createProductPosSale(input: import("@/lib/types").PosSaleInput) {
  await ensureActiveAccount(input.accountId, input.businessId);
  const resolvedItems: Array<{ item: import("@/lib/types").PosCartItem; variant: ReturnType<typeof mapSellableVariant>; unitPrice: number; total: number }> = [];
  for (const item of input.items) {
    const variant = await getVariant(item.variantId, input.businessId);
    if (item.unitPrice !== undefined && !(item.unitPrice > 0)) throw new ProductOperationError("VALIDATION", "El precio unitario manual debe ser mayor a cero.");
    const unitPrice = item.unitPrice !== undefined ? item.unitPrice : variant.salePrice;
    if (!(unitPrice > 0)) throw new ProductOperationError("VALIDATION", `La variante ${variant.name} no tiene un precio de venta individual válido.`);
    const stock = validateStock(item.quantity, variant.currentStock, Boolean(variant.stockKnown), variant.managesStock);
    if (!stock.ok) throw new ProductOperationError(stock.code, `${variant.name}: ${stock.message}`, { currentStock: variant.currentStock });
    resolvedItems.push({ item, variant, unitPrice, total: calculateProductTotal(item.quantity, unitPrice) });
  }
  return createMovementAndDetails({ kind: "pos-sale", input, items: resolvedItems, total: resolvedItems.reduce((sum, item) => sum + item.total, 0) });
}

export async function createProductReplenishment(input: ReplenishmentInput) {
  await ensureActiveAccount(input.accountId, input.businessId);
  const variant = await getVariant(input.variantId, input.businessId);
  const unitPrice = Number(input.unitCost);
  if (!(unitPrice > 0)) throw new ProductOperationError("VALIDATION", "El costo unitario debe ser mayor a cero.");
  const result = await createMovementAndDetail({ kind: "replenishment", input, variant, unitPrice, total: calculateProductTotal(input.quantity, unitPrice) });
  if (input.updateMasterCost && input.confirmationStatus === "Confirmado") {
    try {
      const masterWarnings = await updateVariantMasterCost(variant.id, unitPrice, { role: "Admin global", businessIds: input.businessId ? [input.businessId] : [], activeBusinessId: input.businessId }, input.businessId);
      return { ...result, warnings: [...result.warnings, ...masterWarnings], masterCostUpdated: true };
    } catch (error) { throw new ProductOperationError(error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "MASTER_COST_UPDATE_ERROR", error instanceof Error ? error.message : "No se pudo actualizar el costo maestro.", { movementId: result.movementId, detailId: result.detailId }); }
  }
  return result;
}

async function ensureActiveAccount(accountId: string, businessId?: string) {
  try { await assertActiveAccount(accountId, businessId); } catch (error) { if (error instanceof AccountOperationError) throw new ProductOperationError(error.code, error.message); throw error; }
}

async function getVariant(variantId: string, businessId?: string) {
  let page: any;
  try { page = await retrievePage(variantId); } catch { throw new ProductOperationError("VARIANT_NOT_FOUND", "No se encontró la variante seleccionada."); }
  const variant = mapSellableVariant(page);
  if (!variant.id || !variant.name) throw new ProductOperationError("VARIANT_NOT_FOUND", "No se encontró la variante seleccionada.");
  if (variant.active === false) throw new ProductOperationError("VARIANT_NOT_FOUND", "La variante seleccionada está inactiva.");
  if (variant.businessId && businessId && variant.businessId !== businessId) throw new ProductOperationError("BUSINESS_FORBIDDEN", "La variante seleccionada pertenece a otro negocio.");
  return variant;
}

async function createMovementAndDetail(args: { kind: "sale" | "replenishment"; input: ProductSaleInput | ReplenishmentInput; variant: ReturnType<typeof mapSellableVariant>; unitPrice: number; total: number }) {
  const movementDataSourceId = getEnv("MOVIMIENTOS_DATA_SOURCE_ID");
  const detailDataSourceId = getEnv("DETALLE_PRODUCTOS_DATA_SOURCE_ID");
  if (!movementDataSourceId) throw new ProductOperationError("CONFIG_MISSING", "Falta configurar MOVIMIENTOS_DATA_SOURCE_ID.");
  if (!detailDataSourceId) throw new ProductOperationError("CONFIG_MISSING", "Falta configurar DETALLE_PRODUCTOS_DATA_SOURCE_ID.");
  const [movementSchema, detailSchema, businessId] = await Promise.all([getDataSourceSchema(movementDataSourceId), getDataSourceSchema(detailDataSourceId), resolveBusinessId(args.input.businessId)]);
  const isSale = args.kind === "sale";
  const input = args.input;
  const description = input.description ? String(input.description) : undefined;
  const origin = isSale ? "No aplica" : (input as ReplenishmentInput).origin;
  const replenishmentInput = !isSale ? input as ReplenishmentInput : undefined;
  const confirmationStatus = isSale ? "No requiere" : replenishmentInput?.confirmationStatus || "Confirmado";
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
    confirmationStatus: { candidates: detailApprovalCandidates.confirmationStatus, value: confirmationStatusValue(movementSchema, confirmationStatus as "Pendiente" | "Confirmado" | "Rechazado" | "No requiere", false), label: "Estado confirmación" },
    user: { candidates: ["Recibido por", "Realizado por", "Usuario", "Confirmado por"], value: replenishmentInput?.receivedByUserId ? relation(replenishmentInput.receivedByUserId) : undefined, label: "Recibido por" },
    confirmedBy: { candidates: ["Confirmado por", "Usuario confirmación", "Usuario confirmacion"], value: replenishmentInput?.confirmedByUserId ? relation(replenishmentInput.confirmedByUserId) : undefined, label: "Confirmado por" },
    confirmationNotes: { candidates: ["Notas confirmación", "Notas confirmacion", "Observación reposición"], value: replenishmentInput?.notes ? richText(replenishmentInput.notes) : undefined, label: "Notas confirmación" },
    cashRegister: { candidates: movementCashRegisterCandidates, value: isSale && (input as ProductSaleInput).cashRegisterId ? relation((input as ProductSaleInput).cashRegisterId) : undefined, label: "Caja" },
    saleUser: { candidates: movementUserCandidates, value: isSale && (input as ProductSaleInput).userId ? relation((input as ProductSaleInput).userId) : undefined, label: "Realizado por" },
    paymentReceived: { candidates: movementPaymentReceivedCandidates, value: isSale && (input as ProductSaleInput).payment?.isCash && (input as ProductSaleInput).payment?.received !== undefined && (input as ProductSaleInput).payment?.received !== null ? number((input as ProductSaleInput).payment?.received as number) : undefined, label: "Monto recibido / Paga con" },
    paymentChange: { candidates: movementPaymentChangeCandidates, value: isSale && (input as ProductSaleInput).payment?.isCash && (input as ProductSaleInput).payment?.change !== undefined && (input as ProductSaleInput).payment?.change !== null ? number((input as ProductSaleInput).payment?.change as number) : undefined, label: "Vuelto" },
    paymentMethod: { candidates: movementPaymentMethodCandidates, value: isSale && (input as ProductSaleInput).payment?.method ? select(pickSelectOption(movementSchema, movementPaymentMethodCandidates, [(input as ProductSaleInput).payment?.method as string, "Efectivo"])) : undefined, label: "Método de pago" },
  });
  if (isSale && (input as ProductSaleInput).cashRegisterId && !pickPropertyName(movementSchema, movementCashRegisterCandidates)) movementBuilt.warnings.push("Movimientos no tiene relación a Caja. Las ventas se guardan, pero no quedan asociadas al turno.");
  if (isSale && (input as ProductSaleInput).payment?.isCash && !pickPropertyName(movementSchema, movementPaymentReceivedCandidates) && !pickPropertyName(movementSchema, movementPaymentChangeCandidates)) movementBuilt.warnings.push("Movimientos no tiene Monto recibido/Vuelto; el vuelto se calculó pero no quedó guardado.");
  if (!isSale && !pickPropertyName(movementSchema, detailApprovalCandidates.confirmationStatus)) movementBuilt.warnings.push("Movimientos no tiene Estado confirmación; la auditoría queda limitada.");
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
    costSnapshot: { candidates: detailApprovalCandidates.costUsed, value: number(isSale ? args.variant.replacementCost : args.unitPrice), label: "Costo reposición unitario usado" },
    reportedCost: { candidates: detailApprovalCandidates.reportedCost, value: replenishmentInput?.reportedCost !== undefined && replenishmentInput.reportedCost !== null ? number(replenishmentInput.reportedCost) : undefined, label: "Costo nuevo informado" },
    confirmationStatus: { candidates: detailApprovalCandidates.confirmationStatus, value: confirmationStatusValue(detailSchema, confirmationStatus as "Pendiente" | "Confirmado" | "Rechazado" | "No requiere", false), label: "Estado confirmación" },
    replenishmentNotes: { candidates: detailApprovalCandidates.notes, value: replenishmentInput?.notes ? richText(replenishmentInput.notes) : description ? richText(description) : undefined, label: "Observación reposición" },
    receivedBy: { candidates: detailApprovalCandidates.receivedBy, value: replenishmentInput?.receivedByUserId ? relation(replenishmentInput.receivedByUserId) : undefined, label: "Recibido por" },
  });
  if (!pickPropertyName(detailSchema, detailApprovalCandidates.confirmationStatus) && !isSale) detailBuilt.warnings.push("Falta Estado confirmación. La reposición no podrá gestionarse desde Pendientes.");
  const movement = await createPage(movementDataSourceId, movementBuilt.properties);
  const movementId = movement.id as string;
  const movementProperty = pickExistingProperty(detailSchema, ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"]);
  detailBuilt.properties[movementProperty] = relation(movementId);
  try {
    const detail = await createPage(detailDataSourceId, detailBuilt.properties);
    return { movementId, movementUrl: movement.url, detailId: detail.id, total: args.total, warnings: [...movementBuilt.warnings, ...detailBuilt.warnings] };
  } catch (error) {
    throw new PartialProductCreationError("Movimiento creado, pero falló el detalle. Revisar Notion.", { movementId, movementUrl: movement.url, cause: error instanceof Error ? error.message : String(error) });
  }
}

async function createMovementAndDetails(args: { kind: "pos-sale"; input: import("@/lib/types").PosSaleInput; items: Array<{ item: import("@/lib/types").PosCartItem; variant: ReturnType<typeof mapSellableVariant>; unitPrice: number; total: number }>; total: number }) {
  const movementDataSourceId = getEnv("MOVIMIENTOS_DATA_SOURCE_ID");
  const detailDataSourceId = getEnv("DETALLE_PRODUCTOS_DATA_SOURCE_ID");
  if (!movementDataSourceId) throw new ProductOperationError("CONFIG_MISSING", "Falta configurar MOVIMIENTOS_DATA_SOURCE_ID.");
  if (!detailDataSourceId) throw new ProductOperationError("CONFIG_MISSING", "Falta configurar DETALLE_PRODUCTOS_DATA_SOURCE_ID.");
  const [movementSchema, detailSchema, businessId] = await Promise.all([getDataSourceSchema(movementDataSourceId), getDataSourceSchema(detailDataSourceId), resolveBusinessId(args.input.businessId)]);
  const movementBuilt = buildSchemaAwareProperties(movementSchema, "Movimientos", {
    name: { candidates: ["Nombre"], value: title(`Venta POS x${args.items.length}`), required: true },
    date: { candidates: ["Fecha"], value: date(args.input.date), required: true },
    scope: { candidates: ["Ámbito"], value: select("Negocio"), required: true },
    business: { candidates: ["Negocio"], value: businessId ? relation(businessId) : undefined, required: Boolean(businessId), label: "Negocio" },
    type: { candidates: ["Tipo"], value: select("Ingreso"), required: true },
    subtype: { candidates: ["Subtipo"], value: select("Venta producto"), required: true },
    account: { candidates: ["Cuenta"], value: relation(args.input.accountId), required: true },
    amount: { candidates: ["Monto"], value: number(args.total), required: true },
    paymentStatus: { candidates: ["Estado de pago", "Estado"], value: select("Pagado"), required: true, label: "Estado de pago" },
    moneyOrigin: { candidates: ["Origen del dinero"], value: select("No aplica"), required: true },
    description: { candidates: ["Descripción", "Descripcion", "Notas", "Nota"], value: args.input.description ? richText(args.input.description) : undefined, label: "Descripción" },
    active: { candidates: ["Activo"], value: checkbox(true), required: true },
    accountEntry: { candidates: ["Entrada cuenta"], value: number(args.total), label: "Entrada cuenta" },
    accountNet: { candidates: ["Movimiento neto cuenta"], value: number(args.total), label: "Movimiento neto cuenta" },
    cashRegister: { candidates: movementCashRegisterCandidates, value: relation(args.input.cashRegisterId), label: "Caja" },
    saleUser: { candidates: movementUserCandidates, value: args.input.userId ? relation(args.input.userId) : undefined, label: "Realizado por" },
    paymentReceived: { candidates: movementPaymentReceivedCandidates, value: args.input.payment?.isCash && args.input.payment.received !== undefined && args.input.payment.received !== null ? number(args.input.payment.received) : undefined, label: "Monto recibido / Paga con" },
    paymentChange: { candidates: movementPaymentChangeCandidates, value: args.input.payment?.isCash && args.input.payment.change !== undefined && args.input.payment.change !== null ? number(args.input.payment.change) : undefined, label: "Vuelto" },
    paymentMethod: { candidates: movementPaymentMethodCandidates, value: args.input.payment?.method ? select(pickSelectOption(movementSchema, movementPaymentMethodCandidates, [args.input.payment.method, "Efectivo"])) : undefined, label: "Método de pago" },
  });
  if (!pickPropertyName(movementSchema, movementCashRegisterCandidates)) movementBuilt.warnings.push("Movimientos no tiene relación a Caja. Las ventas se guardan, pero no quedan asociadas al turno.");
  if (args.input.payment?.isCash && !pickPropertyName(movementSchema, movementPaymentReceivedCandidates) && !pickPropertyName(movementSchema, movementPaymentChangeCandidates)) movementBuilt.warnings.push("Movimientos no tiene Monto recibido/Vuelto; el vuelto se calculó pero no quedó guardado.");
  const movement = await createPage(movementDataSourceId, movementBuilt.properties);
  const movementId = movement.id as string;
  const movementProperty = pickExistingProperty(detailSchema, ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"]);
  const detailIds: string[] = [];
  const warnings = [...movementBuilt.warnings];
  try {
    for (const item of args.items) {
      const detailBuilt = buildSchemaAwareProperties(detailSchema, "Detalle de productos", {
        name: { candidates: ["Nombre"], value: title(`${item.variant.name} x${item.item.quantity}`), required: true },
        movement: { candidates: ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"], value: undefined, required: true, label: "relación movimiento" },
        business: { candidates: ["Negocio"], value: businessId ? relation(businessId) : undefined, required: Boolean(businessId), label: "Negocio" },
        variant: { candidates: ["Variante / Ítem", "Variante / Item", "Variante", "Ítem vendible", "Item vendible", "Producto vendido"], value: relation(item.variant.id), required: true, label: "relación variante" },
        quantity: { candidates: ["Cantidad"], value: number(item.item.quantity), required: true },
        priceMode: { candidates: ["Modo de precio"], value: select(item.item.unitPrice !== undefined ? "Manual" : "Individual"), required: true },
        manualPrice: { candidates: ["Precio unitario manual"], value: item.item.unitPrice !== undefined ? number(item.unitPrice) : undefined, required: item.item.unitPrice !== undefined, label: "Precio unitario manual" },
        affectsStock: { candidates: ["Afecta stock"], value: checkbox(true), required: true },
        stockDirection: { candidates: ["Sentido stock"], value: select("Salida"), required: true },
        active: { candidates: ["Activo"], value: checkbox(true), required: true },
        costSnapshot: { candidates: detailApprovalCandidates.costUsed, value: number(item.variant.replacementCost), label: "Costo reposición unitario usado" },
      });
      warnings.push(...detailBuilt.warnings);
      detailBuilt.properties[movementProperty] = relation(movementId);
      const detail = await createPage(detailDataSourceId, detailBuilt.properties);
      detailIds.push(detail.id as string);
    }
  } catch (error) {
    throw new PartialProductCreationError("Movimiento creado, pero falló uno o más detalles. Revisar Notion.", { movementId, movementUrl: movement.url, detailIds, cause: error instanceof Error ? error.message : String(error) });
  }
  return { movementId, movementUrl: movement.url, detailIds, total: args.total, warnings };
}

function pickExistingProperty(schema: Awaited<ReturnType<typeof getDataSourceSchema>>, candidates: string[]) {
  const found = candidates.find((candidate) => schema.properties[candidate]);
  if (!found) throw new SchemaValidationError(schema.id, "Detalle de productos", candidates, candidates[0]);
  return found;
}
