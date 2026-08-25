import "server-only";

import { createPage, queryDataSource, retrievePage, updatePage } from "@/lib/notion/client";
import { getEnv } from "@/lib/env";
import { checkbox, date, number, relation, richText, select, status, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, getDataSourceSchema, pickPropertyName, pickSelectOption, SchemaValidationError, type DataSourceSchema } from "@/lib/notion/schema";
import { getFirstNumber, getFirstTitle, getRelationId, getRelationIds, getRichText } from "@/lib/notion/normalize";
import { canAccessBusiness, getActiveBusinessId, isGlobalAdmin, type PermissionSession } from "@/lib/permissions";
import { buildVariantProperties, variantCandidates } from "@/lib/notion/product-admin";
import type { PendingReplenishment } from "@/lib/types";

export const detailApprovalCandidates = {
  costUsed: ["Costo reposición unitario usado", "Costo reposición snapshot", "Costo unitario usado", "Costo usado"],
  reportedCost: ["Costo nuevo informado", "Nuevo costo informado", "Costo informado"],
  confirmationStatus: ["Estado confirmación", "Estado de confirmación", "Confirmación", "Estado reposición"],
  notes: ["Observación reposición", "Observacion reposicion", "Observación", "Observacion", "Notas"],
  confirmedAt: ["Fecha confirmación", "Fecha de confirmación", "Confirmado el"],
  confirmedBy: ["Confirmado por", "Usuario confirmación", "Usuario confirmacion"],
  receivedBy: ["Recibido por", "Usuario recepción", "Usuario recepcion", "Realizado por", "Usuario"],
  movement: ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"],
  variant: ["Variante / Ítem", "Variante / Item", "Variante", "Ítem vendible", "Item vendible", "Producto vendido"],
  business: ["Negocio", "Negocios"],
  quantity: ["Cantidad"],
  active: ["Activo", "Activa"],
} as const;

export const movementApprovalCandidates = {
  confirmationStatus: detailApprovalCandidates.confirmationStatus,
  user: ["Realizado por", "Usuario", "Recibido por", "Confirmado por"],
  notes: ["Notas confirmación", "Notas confirmacion", "Observación reposición"],
} as const;

export class ReplenishmentApprovalError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) { super(message); this.name = "ReplenishmentApprovalError"; this.code = code; this.details = details; }
}

type DetailRecord = PendingReplenishment & { page: any; variantPage?: any; movementPage?: any };

export function mapReplenishmentDetail(page: any, variantPage?: any, movementPage?: any): DetailRecord {
  const variantId = firstRelation(page, detailApprovalCandidates.variant);
  const businessId = firstRelation(page, detailApprovalCandidates.business) || firstRelation(movementPage, detailApprovalCandidates.business);
  const statusValue = readApprovalStatus(page, detailApprovalCandidates.confirmationStatus);
  const variantName = variantPage ? getFirstTitle(variantPage, ["Nombre", "Name"]) : getFirstTitle(page, ["Nombre", "Name"]) || "Variante";
  return {
    id: String(page.id), movementId: firstRelation(page, detailApprovalCandidates.movement), variantId, variantName, businessId,
    date: readDate(movementPage || page), quantity: getFirstNumber(page, detailApprovalCandidates.quantity), currentCost: variantPage ? getFirstNumber(variantPage, variantCandidates.replacementCost) : getFirstNumber(page, detailApprovalCandidates.costUsed),
    costUsed: firstNumber(page, detailApprovalCandidates.costUsed), reportedCost: firstNumber(page, detailApprovalCandidates.reportedCost), confirmationStatus: normalizeConfirmationStatus(statusValue),
    notes: readText(page, detailApprovalCandidates.notes) || null, receivedByUserId: firstRelation(page, detailApprovalCandidates.receivedBy), confirmedByUserId: firstRelation(page, detailApprovalCandidates.confirmedBy), confirmedAt: readDateByCandidates(page, detailApprovalCandidates.confirmedAt), page, variantPage, movementPage,
  };
}

export async function listPendingReplenishments(session: PermissionSession) {
  const detailId = getEnv("DETALLE_PRODUCTOS_DATA_SOURCE_ID");
  if (!detailId) throw new ReplenishmentApprovalError("CONFIG_MISSING", "Falta configurar DETALLE_PRODUCTOS_DATA_SOURCE_ID.");
  const schema = await getDataSourceSchema(detailId);
  if (!pickPropertyName(schema, detailApprovalCandidates.confirmationStatus)) throw new SchemaValidationError(detailId, "Detalle de productos", detailApprovalCandidates.confirmationStatus, "Estado confirmación");
  const result = await queryDataSource(detailId, { page_size: 100 });
  const [variantPages, movementPages] = await Promise.all([loadVariantPages(), loadMovementPages()]);
  const variantMap = new Map(variantPages.map((page: any) => [String(page.id), page]));
  const movementMap = new Map(movementPages.map((page: any) => [String(page.id), page]));
  const warnings: string[] = [];
  const all = (result.results || []).map((page: any) => { const movementId = firstRelation(page, detailApprovalCandidates.movement); return mapReplenishmentDetail(page, variantMap.get(firstRelation(page, detailApprovalCandidates.variant)), movementMap.get(movementId)); });
  const pending = all.filter((item: DetailRecord) => item.confirmationStatus === "Pendiente").filter((item: DetailRecord) => detailBelongsToSession(item, session));
  if (!pickPropertyName(schema, detailApprovalCandidates.costUsed)) warnings.push("Falta Costo reposición unitario usado. Los históricos pueden recalcularse si cambia el costo maestro.");
  if (!pickPropertyName(schema, detailApprovalCandidates.receivedBy) || !pickPropertyName(schema, detailApprovalCandidates.confirmedBy)) warnings.push("La auditoría de reposiciones será limitada.");
  return { data: pending.map((item: DetailRecord) => { const { page: _page, variantPage: _variantPage, movementPage: _movementPage, ...publicItem } = item; return publicItem; }), warnings, schema };
}

export async function confirmReplenishment(detailId: string, session: PermissionSession, input: { costUsed: number; updateMasterCost: boolean; notes?: string }) {
  const context = await getApprovalContext(detailId, session);
  if (context.detail.confirmationStatus !== "Pendiente") throw new ReplenishmentApprovalError("REPLENISHMENT_NOT_PENDING", "La reposición ya no está pendiente de confirmación.");
  if (!(input.costUsed > 0) || !Number.isFinite(input.costUsed)) throw new ReplenishmentApprovalError("VALIDATION", "El costo usado debe ser mayor a cero.");
  const detailBuilt = buildApprovalUpdate(context.detailSchema, "Confirmado", input.costUsed, session.userId, input.notes);
  const warnings = [...detailBuilt.warnings];
  let masterWarnings: string[] = [];
  if (input.updateMasterCost) masterWarnings = await updateVariantMasterCost(context.detail.variantId, input.costUsed, session, context.detail.businessId);
  await updatePage(detailId, detailBuilt.properties);
  return { id: detailId, status: "Confirmado", costUsed: input.costUsed, updateMasterCost: input.updateMasterCost, warnings: [...warnings, ...masterWarnings] };
}

export async function rejectReplenishment(detailId: string, session: PermissionSession, notes?: string) {
  const context = await getApprovalContext(detailId, session);
  if (context.detail.confirmationStatus !== "Pendiente") throw new ReplenishmentApprovalError("REPLENISHMENT_NOT_PENDING", "La reposición ya no está pendiente de confirmación.");
  const reversal = await createReversal(context, session).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const detailBuilt = buildApprovalUpdate(context.detailSchema, "Rechazado", context.detail.costUsed || context.detail.reportedCost || context.detail.currentCost, session.userId, notes);
  await updatePage(detailId, detailBuilt.properties);
  const warnings = [...detailBuilt.warnings];
  if ("error" in reversal) warnings.push(`No se pudo crear el ajuste inverso automático: ${reversal.error}. El stock puede requerir un ajuste manual.`);
  return { id: detailId, status: "Rechazado", reversalMovementId: "movementId" in reversal ? reversal.movementId : undefined, warnings };
}

export async function createReplenishmentApprovalProperties(schema: DataSourceSchema, args: { status: "Pendiente" | "Confirmado"; costUsed: number; reportedCost?: number | null; notes?: string; receivedByUserId?: string; confirmedByUserId?: string; date?: string }) {
  return buildApprovalUpdate(schema, args.status, args.costUsed, args.confirmedByUserId, args.notes, args);
}

async function getApprovalContext(detailId: string, session: PermissionSession) {
  const detailDataSourceId = getEnv("DETALLE_PRODUCTOS_DATA_SOURCE_ID");
  if (!detailDataSourceId) throw new ReplenishmentApprovalError("CONFIG_MISSING", "Falta configurar DETALLE_PRODUCTOS_DATA_SOURCE_ID.");
  const [page, schema] = await Promise.all([retrievePage(detailId), getDataSourceSchema(detailDataSourceId)]);
  const movementId = firstRelation(page, detailApprovalCandidates.movement);
  const variantId = firstRelation(page, detailApprovalCandidates.variant);
  const movementPage = movementId ? await retrievePage(movementId).catch(() => undefined) : undefined;
  const variantPage = variantId ? await retrievePage(variantId).catch(() => undefined) : undefined;
  const detail = mapReplenishmentDetail(page, variantPage, movementPage);
  if (!detailBelongsToSession(detail, session)) throw new ReplenishmentApprovalError("BUSINESS_FORBIDDEN", "La reposición no pertenece a tu negocio.");
  if (!pickPropertyName(schema, detailApprovalCandidates.confirmationStatus)) throw new SchemaValidationError(detailDataSourceId, "Detalle de productos", detailApprovalCandidates.confirmationStatus, "Estado confirmación");
  return { page, detail, detailSchema: schema, variantPage, movementPage };
}

function buildApprovalUpdate(schema: DataSourceSchema, statusValue: "Pendiente" | "Confirmado" | "Rechazado", costUsed: number, userId?: string, notes?: string, extra?: { reportedCost?: number | null; receivedByUserId?: string; date?: string }) {
  return buildSchemaAwareProperties(schema, "Detalle de productos", {
    costUsed: { candidates: detailApprovalCandidates.costUsed, value: number(costUsed), label: "Costo reposición unitario usado" },
    reportedCost: { candidates: detailApprovalCandidates.reportedCost, value: extra?.reportedCost !== undefined && extra.reportedCost !== null ? number(extra.reportedCost) : undefined, label: "Costo nuevo informado" },
    confirmationStatus: { candidates: detailApprovalCandidates.confirmationStatus, value: confirmationStatusValue(schema, statusValue), required: true, label: "Estado confirmación" },
    notes: { candidates: detailApprovalCandidates.notes, value: notes ? richText(notes) : undefined, label: "Observación reposición" },
    confirmedAt: { candidates: detailApprovalCandidates.confirmedAt, value: statusValue === "Confirmado" || statusValue === "Rechazado" ? date(new Date().toISOString()) : undefined, label: "Fecha confirmación" },
    confirmedBy: { candidates: detailApprovalCandidates.confirmedBy, value: userId ? relation(userId) : undefined, label: "Confirmado por" },
    receivedBy: { candidates: detailApprovalCandidates.receivedBy, value: extra?.receivedByUserId ? relation(extra.receivedByUserId) : undefined, label: "Recibido por" },
  });
}

export async function updateVariantMasterCost(variantId: string, cost: number, session: PermissionSession, businessId?: string) {
  if (!variantId) throw new ReplenishmentApprovalError("VARIANT_NOT_FOUND", "La reposición no tiene variante relacionada.");
  const variantPage = await retrievePage(variantId);
  const variantBusiness = getRelationId(variantPage, "Negocio") || getRelationId(variantPage, "Negocios") || businessId;
  if (!isGlobalAdmin(session) && !canAccessBusiness(session, variantBusiness)) throw new ReplenishmentApprovalError("BUSINESS_FORBIDDEN", "La variante no pertenece a tu negocio.");
  const dataSourceId = getEnv("VARIANTES_DATA_SOURCE_ID");
  if (!dataSourceId) throw new ReplenishmentApprovalError("CONFIG_MISSING", "Falta configurar VARIANTES_DATA_SOURCE_ID.");
  const schema = await getDataSourceSchema(dataSourceId);
  if (!pickPropertyName(schema, variantCandidates.replacementCost)) throw new SchemaValidationError(dataSourceId, "Variantes / Ítems vendibles", variantCandidates.replacementCost, "Costo reposición unitario");
  const built = buildVariantProperties(schema, { replacementCost: cost }, "", false);
  await updatePage(variantId, built.properties);
  return built.warnings;
}

async function createReversal(context: { detail: DetailRecord; detailSchema: DataSourceSchema }, session: PermissionSession) {
  const movementDataSourceId = getEnv("MOVIMIENTOS_DATA_SOURCE_ID");
  const detailDataSourceId = getEnv("DETALLE_PRODUCTOS_DATA_SOURCE_ID");
  if (!movementDataSourceId || !detailDataSourceId || !context.detail.variantId) throw new Error("faltan IDs o relación de variante");
  const [movementSchema, detailSchema, originalMovement] = await Promise.all([getDataSourceSchema(movementDataSourceId), getDataSourceSchema(detailDataSourceId), context.detail.movementId ? retrievePage(context.detail.movementId).catch(() => undefined) : Promise.resolve(undefined)]);
  const cost = context.detail.costUsed || context.detail.reportedCost || context.detail.currentCost;
  const total = Math.max(0, cost * context.detail.quantity);
  const movementBuilt = buildSchemaAwareProperties(movementSchema, "Movimientos", {
    name: { candidates: ["Nombre"], value: title(`Ajuste reposición rechazada - ${context.detail.variantName}`), required: true }, date: { candidates: ["Fecha"], value: date(new Date().toISOString()), required: true }, scope: { candidates: ["Ámbito"], value: select("Negocio"), required: true }, business: { candidates: ["Negocio"], value: context.detail.businessId ? relation(context.detail.businessId) : undefined, label: "Negocio" }, type: { candidates: ["Tipo"], value: select(pickSelectOption(movementSchema, ["Tipo"], ["Ajuste", "Egreso", "Ingreso"])), required: true }, subtype: { candidates: ["Subtipo"], value: select(pickSelectOption(movementSchema, ["Subtipo"], ["Ajuste stock", "Reposición rechazada", "Otro"])), required: true }, account: { candidates: ["Cuenta"], value: relation(originalMovement ? firstRelation(originalMovement, ["Cuenta"]) : undefined), required: true }, amount: { candidates: ["Monto"], value: number(0), required: true }, paymentStatus: { candidates: ["Estado de pago", "Estado"], value: select(pickSelectOption(movementSchema, ["Estado de pago", "Estado"], ["No aplica", "Pagado"])), required: true }, moneyOrigin: { candidates: ["Origen del dinero"], value: select(pickSelectOption(movementSchema, ["Origen del dinero"], ["No aplica"])), required: true }, description: { candidates: ["Descripción", "Descripcion", "Notas", "Nota"], value: richText("Ajuste inverso automático por rechazo de reposición"), label: "Descripción" }, active: { candidates: ["Activo"], value: checkbox(true), required: true }, accountNet: { candidates: ["Movimiento neto cuenta"], value: number(0), label: "Movimiento neto cuenta" }, confirmationStatus: { candidates: movementApprovalCandidates.confirmationStatus, value: confirmationStatusValue(movementSchema, "No requiere", false), label: "Estado confirmación" }, notes: { candidates: movementApprovalCandidates.notes, value: richText(`Se compensan ${context.detail.quantity} unidades. Total de referencia ${total}.`), label: "Notas confirmación" }, user: { candidates: movementApprovalCandidates.user, value: session.userId ? relation(session.userId) : undefined, label: "Realizado por" },
  });
  const movement = await createPage(movementDataSourceId, movementBuilt.properties);
  const detailBuilt = buildSchemaAwareProperties(detailSchema, "Detalle de productos", {
    name: { candidates: ["Nombre"], value: title(`Ajuste inverso - ${context.detail.variantName} x${context.detail.quantity}`), required: true }, movement: { candidates: detailApprovalCandidates.movement, value: undefined, required: true, label: "relación movimiento" }, business: { candidates: detailApprovalCandidates.business, value: context.detail.businessId ? relation(context.detail.businessId) : undefined, label: "Negocio" }, variant: { candidates: detailApprovalCandidates.variant, value: relation(context.detail.variantId), required: true, label: "relación variante" }, quantity: { candidates: detailApprovalCandidates.quantity, value: number(context.detail.quantity), required: true }, priceMode: { candidates: ["Modo de precio"], value: select(pickSelectOption(detailSchema, ["Modo de precio"], ["Manual", "Individual"])), required: true }, manualPrice: { candidates: ["Precio unitario manual"], value: number(cost), label: "Precio unitario manual" }, affectsStock: { candidates: ["Afecta stock"], value: checkbox(true), required: true }, stockDirection: { candidates: ["Sentido stock"], value: select(pickSelectOption(detailSchema, ["Sentido stock"], ["Salida", "Entrada"])), required: true }, active: { candidates: detailApprovalCandidates.active, value: checkbox(true), required: true }, costUsed: { candidates: detailApprovalCandidates.costUsed, value: number(cost), label: "Costo reposición unitario usado" }, confirmationStatus: { candidates: detailApprovalCandidates.confirmationStatus, value: confirmationStatusValue(detailSchema, "No requiere", false), label: "Estado confirmación" }, notes: { candidates: detailApprovalCandidates.notes, value: richText("Ajuste inverso automático por rechazo de reposición"), label: "Observación reposición" },
  });
  const movementProperty = pickPropertyName(detailSchema, detailApprovalCandidates.movement);
  if (!movementProperty) throw new SchemaValidationError(detailDataSourceId, "Detalle de productos", detailApprovalCandidates.movement, "relación movimiento");
  detailBuilt.properties[movementProperty] = relation(String(movement.id));
  const detail = await createPage(detailDataSourceId, detailBuilt.properties);
  return { movementId: String(movement.id), detailId: String(detail.id) };
}

async function loadVariantPages() {
  const dataSourceId = getEnv("VARIANTES_DATA_SOURCE_ID");
  if (!dataSourceId) return [];
  const result = await queryDataSource(dataSourceId, { page_size: 100 });
  return result.results || [];
}

async function loadMovementPages() {
  const dataSourceId = getEnv("MOVIMIENTOS_DATA_SOURCE_ID");
  if (!dataSourceId) return [];
  const result = await queryDataSource(dataSourceId, { page_size: 100 });
  return result.results || [];
}

function detailBelongsToSession(detail: PendingReplenishment, session: PermissionSession) {
  if (isGlobalAdmin(session)) return true;
  const businessId = detail.businessId || getActiveBusinessId(session);
  return canAccessBusiness(session, businessId);
}

function firstRelation(page: any, names: readonly string[]) { if (!page) return ""; for (const name of names) { const ids = getRelationIds(page, name); if (ids.length) return ids[0]; } return ""; }
function firstNumber(page: any, names: readonly string[]) { for (const name of names) { const value = page.properties?.[name]?.number; if (value !== null && value !== undefined) return Number(value); } return null; }
function readText(page: any, names: readonly string[]) { for (const name of names) { const value = getRichText(page, name); if (value) return value; } return ""; }
function readDate(page: any) { return readDateByCandidates(page, ["Fecha"]); }
function readDateByCandidates(page: any, names: readonly string[]) { for (const name of names) { const value = page.properties?.[name]?.date?.start; if (value) return value; } return ""; }
function readApprovalStatus(page: any, names: readonly string[]) { for (const name of names) { const value = page.properties?.[name]?.select?.name || page.properties?.[name]?.status?.name || getRichText(page, name); if (value) return value; } return ""; }
function normalizeConfirmationStatus(value: string): PendingReplenishment["confirmationStatus"] { return value === "Pendiente" || value === "Confirmado" || value === "Rechazado" || value === "No requiere" ? value : "No requiere"; }
export function confirmationStatusValue(schema: DataSourceSchema, value: "Pendiente" | "Confirmado" | "Rechazado" | "No requiere", required = true) {
  const property = pickPropertyName(schema, detailApprovalCandidates.confirmationStatus);
  if (!property) { if (required) throw new SchemaValidationError(schema.id, "Detalle de productos", detailApprovalCandidates.confirmationStatus, "Estado confirmación"); return undefined; }
  const definition = schema.properties[property];
  const options = (((definition as any)[definition.type || ""]?.options || []) as Array<{ name?: string }>).map((option) => option.name).filter(Boolean) as string[];
  if (options.length && !options.includes(value)) throw new ReplenishmentApprovalError("CONFIRMATION_OPTION_MISSING", `La propiedad "${property}" no tiene la opción "${value}" en Notion.`);
  if (definition.type === "status") return status(value);
  if (definition.type === "rich_text") return richText(value);
  return select(value);
}
