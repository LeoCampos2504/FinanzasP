import "server-only";

import { createPage, queryDataSource, retrievePage, updatePage } from "@/lib/notion/client";
import { getEnv } from "@/lib/env";
import { assertActiveAccount } from "@/lib/notion/account-service";
import { checkbox, date, number, relation, richText, select, status, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, getDataSourceSchema, pickPropertyName, SchemaValidationError, type DataSourceSchema } from "@/lib/notion/schema";
import { getFirstNumber, getFirstTitle, getRelationIds, getRichText } from "@/lib/notion/normalize";
import { canAccessBusiness, getActiveBusinessId, isBusinessSeller, isGlobalAdmin, type PermissionSession } from "@/lib/permissions";
import type { CashRegisterSession, CashRegisterStatus, CashRegisterSummary, CloseCashRegisterInput, OpenCashRegisterInput } from "@/lib/types";

export const cashRegisterCandidates = {
  name: ["Nombre", "Turno", "Caja", "Name"],
  business: ["Negocio", "Negocios", "Empresa"],
  status: ["Estado caja", "Estado de caja", "Estado"],
  openedAt: ["Fecha apertura", "Abierta el", "Inicio", "Fecha inicio"],
  closedAt: ["Fecha cierre", "Cerrada el", "Fin", "Fecha fin"],
  openedBy: ["Abierta por", "Usuario apertura", "Usuario"],
  closedBy: ["Cerrada por", "Usuario cierre"],
  cashAccount: ["Cuenta efectivo", "Cuenta principal", "Cuenta"],
  initialCash: ["Monto inicial", "Efectivo inicial", "Saldo inicial caja"],
  expectedCash: ["Efectivo esperado", "Esperado efectivo"],
  cashCounted: ["Efectivo contado", "Contado", "Conteo efectivo"],
  difference: ["Diferencia", "Diferencia caja"],
  totalSales: ["Total ventas", "Ventas turno"],
  notes: ["Notas", "Observación", "Observaciones"],
  active: ["Activo", "Activa"],
} as const;

export const movementCashRegisterCandidates = ["Caja", "Turno caja", "Turno de caja", "Caja / Turno", "Arqueo"] as const;
export const movementUserCandidates = ["Realizado por", "Usuario", "Vendedor"] as const;
export const movementPaymentReceivedCandidates = ["Monto recibido", "Paga con", "Pagó con", "Pago con", "Recibido"] as const;
export const movementPaymentChangeCandidates = ["Vuelto", "Cambio", "Dar vuelto"] as const;
export const movementPaymentMethodCandidates = ["Método de pago", "Metodo de pago", "Medio de pago"] as const;

export class CashRegisterError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) { super(message); this.name = "CashRegisterError"; this.code = code; this.details = details; }
}

export async function getCashRegisterSchema() {
  const dataSourceId = getEnv("CAJAS_DATA_SOURCE_ID");
  if (!dataSourceId) throw new CashRegisterError("CONFIG_MISSING", "CAJAS_DATA_SOURCE_ID no está configurado.");
  return getDataSourceSchema(dataSourceId);
}

export function mapCashRegisterPage(page: any, _schema?: DataSourceSchema): CashRegisterSession {
  return {
    id: String(page.id),
    name: getFirstTitle(page, cashRegisterCandidates.name) || "Caja",
    businessId: firstRelation(page, cashRegisterCandidates.business) || undefined,
    status: normalizeStatus(readStatus(page, cashRegisterCandidates.status)),
    openedAt: readDate(page, cashRegisterCandidates.openedAt),
    closedAt: readDate(page, cashRegisterCandidates.closedAt) || undefined,
    openedByUserId: firstRelation(page, cashRegisterCandidates.openedBy) || undefined,
    closedByUserId: firstRelation(page, cashRegisterCandidates.closedBy) || undefined,
    cashAccountId: firstRelation(page, cashRegisterCandidates.cashAccount) || undefined,
    initialCash: firstNumber(page, cashRegisterCandidates.initialCash),
    expectedCash: firstNumberOrNull(page, cashRegisterCandidates.expectedCash),
    cashCounted: firstNumberOrNull(page, cashRegisterCandidates.cashCounted),
    difference: firstNumberOrNull(page, cashRegisterCandidates.difference),
    totalSales: firstNumberOrNull(page, cashRegisterCandidates.totalSales),
    notes: firstText(page, cashRegisterCandidates.notes) || null,
  };
}

export async function listCashRegisters(session: PermissionSession, filters: { status?: CashRegisterStatus | "todas"; businessId?: string; from?: string; to?: string } = {}) {
  const schema = await getCashRegisterSchema();
  const result = await queryDataSource(schema.id, { page_size: 100 });
  const data = (result.results || []).map((page: any) => mapCashRegisterPage(page, schema)).filter((caja: CashRegisterSession) => {
    if (filters.status && filters.status !== "todas" && caja.status.toLowerCase() !== filters.status.toLowerCase()) return false;
    if (filters.from && caja.openedAt && caja.openedAt.slice(0, 10) < filters.from) return false;
    if (filters.to && caja.openedAt && caja.openedAt.slice(0, 10) > filters.to) return false;
    if (isBusinessSeller(session) && caja.openedByUserId !== session.userId) return false;
    if (!isGlobalAdmin(session) && (!caja.businessId || !canAccessBusiness(session, caja.businessId))) return false;
    if (filters.businessId && !isGlobalAdmin(session) && !canAccessBusiness(session, filters.businessId)) return false;
    if (filters.businessId && caja.businessId && caja.businessId !== filters.businessId) return false;
    return true;
  });
  return { data, schema };
}

export async function getOpenCashRegisterForSession(session: PermissionSession) {
  const result = await listCashRegisters(session, { status: "Abierta", businessId: getActiveBusinessId(session) });
  return result.data.find((caja: CashRegisterSession) => (!session.userId || caja.openedByUserId === session.userId) && (!caja.businessId || caja.businessId === getActiveBusinessId(session))) || null;
}

export function ensureCanAccessCashRegister(session: PermissionSession, caja: CashRegisterSession, action: "view" | "close" = "view") {
  if (!isGlobalAdmin(session) && caja.businessId && !canAccessBusiness(session, caja.businessId)) throw new CashRegisterError("BUSINESS_FORBIDDEN", "La caja no pertenece a tu negocio.");
  if (action === "close" && isBusinessSeller(session) && caja.openedByUserId !== session.userId) throw new CashRegisterError("CASH_REGISTER_FORBIDDEN", "No tenés permiso para cerrar esta caja.");
  return caja;
}

export async function openCashRegister(session: PermissionSession, input: OpenCashRegisterInput) {
  if (!(input.initialCash >= 0) || !Number.isFinite(input.initialCash)) throw new CashRegisterError("VALIDATION", "El monto inicial debe ser mayor o igual a cero.");
  const businessId = getActiveBusinessId(session);
  if (!businessId) throw new CashRegisterError("BUSINESS_REQUIRED", "No hay un negocio activo para abrir la caja.");
  await assertActiveAccount(input.accountId, businessId, session);
  const current = await getOpenCashRegisterForSession(session);
  if (current) throw new CashRegisterError("CASH_REGISTER_ALREADY_OPEN", "Ya tenés una caja abierta.", { cashRegisterId: current.id });
  const schema = await getCashRegisterSchema();
  const built = buildSchemaAwareProperties(schema, "Cajas / Turnos", {
    name: { candidates: cashRegisterCandidates.name, value: title(`Caja ${new Date().toLocaleDateString("es-AR")}`), required: true, label: "Nombre" },
    business: { candidates: cashRegisterCandidates.business, value: relation(businessId), required: true, label: "Negocio" },
    status: { candidates: cashRegisterCandidates.status, value: cashRegisterStatusValue(schema, "Abierta"), required: true, label: "Estado" },
    openedAt: { candidates: cashRegisterCandidates.openedAt, value: date(new Date().toISOString()), required: true, label: "Fecha apertura" },
    openedBy: { candidates: cashRegisterCandidates.openedBy, value: session.userId ? relation(session.userId) : undefined, required: Boolean(session.userId), label: "Abierta por" },
    cashAccount: { candidates: cashRegisterCandidates.cashAccount, value: relation(input.accountId), label: "Cuenta efectivo" },
    initialCash: { candidates: cashRegisterCandidates.initialCash, value: number(input.initialCash), required: true, label: "Monto inicial" },
    expectedCash: { candidates: cashRegisterCandidates.expectedCash, value: number(input.initialCash), label: "Efectivo esperado" },
    notes: { candidates: cashRegisterCandidates.notes, value: input.notes ? richText(input.notes) : undefined, label: "Notas" },
    active: { candidates: cashRegisterCandidates.active, value: checkbox(true), label: "Activo" },
  });
  const page = await createPage(schema.id, built.properties);
  return { data: { ...mapCashRegisterPage(page, schema), businessId, openedByUserId: session.userId, cashAccountId: input.accountId, initialCash: input.initialCash, status: "Abierta" as const }, warnings: built.warnings };
}

export async function getCashRegisterSummary(session: PermissionSession, cashRegisterId: string): Promise<CashRegisterSummary> {
  const schema = await getCashRegisterSchema();
  const page = await retrievePage(cashRegisterId);
  const caja = mapCashRegisterPage(page, schema);
  ensureCanAccessCashRegister(session, caja);
  const movementDataSourceId = getEnv("MOVIMIENTOS_DATA_SOURCE_ID");
  if (!movementDataSourceId) return limitedSummary(caja, ["Falta MOVIMIENTOS_DATA_SOURCE_ID; el resumen no puede calcular ventas."]);
  const [movementSchema, movementResult, accountResult] = await Promise.all([getDataSourceSchema(movementDataSourceId), queryDataSource(movementDataSourceId, { page_size: 100 }), getEnv("CUENTAS_DATA_SOURCE_ID") ? queryDataSource(getEnv("CUENTAS_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] })]);
  const accountNames = new Map<string, string>((accountResult.results || []).map((item: any) => [String(item.id), getFirstTitle(item, ["Nombre", "Name"]) || "Cuenta"]));
  const relationName = pickPropertyName(movementSchema, movementCashRegisterCandidates);
  const userName = pickPropertyName(movementSchema, movementUserCandidates);
  const businessName = pickPropertyName(movementSchema, ["Negocio", "Negocios", "Empresa"]);
  const warnings: string[] = [];
  let estimated = false;
  let pages = (movementResult.results || []).filter((movement: any) => isIncomeMovement(movement));
  if (relationName) {
    pages = pages.filter((movement: any) => firstRelation(movement, movementCashRegisterCandidates) === cashRegisterId);
  } else {
    estimated = true;
    warnings.push("Movimientos no tiene relación a Caja; el resumen puede ser estimado.");
    const canFallback = Boolean(caja.openedAt && caja.openedByUserId && userName && businessName && caja.businessId);
    if (!canFallback) pages = [];
    else if (userName && businessName) pages = pages.filter((movement: any) => movementMatchesFallback(movement, caja, userName, businessName));
    if (!pages.length && !canFallback) warnings.push("No se pudo calcular un resumen seguro sin relación Caja en Movimientos.");
  }
  const sales = pages.map((movement: any) => ({ accountId: firstRelation(movement, ["Cuenta"]), accountName: accountNames.get(firstRelation(movement, ["Cuenta"])) || "Cuenta", total: firstNumber(movement, ["Monto"]), date: readDate(movement, ["Fecha"]) }));
  const byAccount = new Map<string, { accountId?: string; accountName: string; total: number; isCash: boolean }>();
  for (const sale of sales) { const key = sale.accountId || sale.accountName; const current = byAccount.get(key) || { accountId: sale.accountId, accountName: sale.accountName, total: 0, isCash: sale.accountId === caja.cashAccountId }; current.total += sale.total; byAccount.set(key, current); }
  const salesByAccount = [...byAccount.values()];
  const cashSales = salesByAccount.filter((item) => item.isCash).reduce((sum, item) => sum + item.total, 0);
  const nonCashSales = salesByAccount.filter((item) => !item.isCash).reduce((sum, item) => sum + item.total, 0);
  const expectedCash = caja.initialCash + cashSales;
  return { cashRegister: { ...caja, expectedCash, totalSales: cashSales + nonCashSales }, totalSales: cashSales + nonCashSales, salesByAccount, cashSales, nonCashSales, expectedCash, cashCounted: caja.cashCounted, difference: caja.cashCounted === null || caja.cashCounted === undefined ? null : caja.cashCounted - expectedCash, estimated, warnings };
}

export async function closeCashRegister(session: PermissionSession, cashRegisterId: string, input: CloseCashRegisterInput) {
  if (!(input.cashCounted >= 0) || !Number.isFinite(input.cashCounted)) throw new CashRegisterError("VALIDATION", "El efectivo contado debe ser mayor o igual a cero.");
  const summary = await getCashRegisterSummary(session, cashRegisterId);
  ensureCanAccessCashRegister(session, summary.cashRegister, "close");
  if (summary.cashRegister.status !== "Abierta") throw new CashRegisterError("CASH_REGISTER_NOT_OPEN", "La caja ya está cerrada.");
  const schema = await getCashRegisterSchema();
  const difference = input.cashCounted - summary.expectedCash;
  const built = buildSchemaAwareProperties(schema, "Cajas / Turnos", {
    status: { candidates: cashRegisterCandidates.status, value: cashRegisterStatusValue(schema, "Cerrada"), required: true, label: "Estado" },
    closedAt: { candidates: cashRegisterCandidates.closedAt, value: date(new Date().toISOString()), label: "Fecha cierre" },
    closedBy: { candidates: cashRegisterCandidates.closedBy, value: session.userId ? relation(session.userId) : undefined, label: "Cerrada por" },
    expectedCash: { candidates: cashRegisterCandidates.expectedCash, value: writableNumber(schema, cashRegisterCandidates.expectedCash, summary.expectedCash), label: "Efectivo esperado" },
    cashCounted: { candidates: cashRegisterCandidates.cashCounted, value: writableNumber(schema, cashRegisterCandidates.cashCounted, input.cashCounted), label: "Efectivo contado" },
    difference: { candidates: cashRegisterCandidates.difference, value: writableNumber(schema, cashRegisterCandidates.difference, difference), label: "Diferencia" },
    totalSales: { candidates: cashRegisterCandidates.totalSales, value: writableNumber(schema, cashRegisterCandidates.totalSales, summary.totalSales), label: "Total ventas" },
    notes: { candidates: cashRegisterCandidates.notes, value: input.notes ? richText(input.notes) : undefined, label: "Notas" },
    active: { candidates: cashRegisterCandidates.active, value: checkbox(false), label: "Activo" },
  });
  await updatePage(cashRegisterId, built.properties);
  return { data: { ...summary, cashCounted: input.cashCounted, difference, cashRegister: { ...summary.cashRegister, status: "Cerrada" as const, closedAt: new Date().toISOString(), closedByUserId: session.userId, cashCounted: input.cashCounted, expectedCash: summary.expectedCash, difference, totalSales: summary.totalSales, notes: input.notes || summary.cashRegister.notes } }, warnings: [...summary.warnings, ...built.warnings] };
}

function cashRegisterStatusValue(schema: DataSourceSchema, value: CashRegisterStatus) {
  const name = pickPropertyName(schema, cashRegisterCandidates.status);
  if (!name) throw new SchemaValidationError(schema.id, "Cajas / Turnos", cashRegisterCandidates.status, "Estado");
  const definition = schema.properties[name];
  const options = (((definition as any)[definition.type || ""]?.options || []) as Array<{ name?: string }>).map((option) => option.name).filter(Boolean) as string[];
  if (options.length && !options.includes(value)) throw new CashRegisterError("CASH_REGISTER_STATUS_OPTION_MISSING", `La propiedad "${name}" no tiene la opción "${value}" en Notion.`);
  if (definition.type === "status") return status(value);
  if (definition.type === "rich_text") return richText(value);
  return select(value);
}

function writableNumber(schema: DataSourceSchema, candidates: readonly string[], value: number) {
  const name = pickPropertyName(schema, candidates);
  if (!name) return undefined;
  return schema.properties[name].type === "number" ? number(value) : undefined;
}

function firstRelation(page: any, names: readonly string[]) { if (!page) return ""; for (const name of names) { const ids = getRelationIds(page, name); if (ids.length) return ids[0]; } return ""; }
function firstNumber(page: any, names: readonly string[]) { return getFirstNumber(page, names); }
function firstNumberOrNull(page: any, names: readonly string[]) { const value = firstNumber(page, names); return hasAnyProperty(page, names) ? value : null; }
function firstText(page: any, names: readonly string[]) { for (const name of names) { const value = getRichText(page, name); if (value) return value; } return ""; }
function readDate(page: any, names: readonly string[]) { for (const name of names) { const value = page.properties?.[name]?.date?.start; if (value) return value; } return ""; }
function readStatus(page: any, names: readonly string[]) { for (const name of names) { const property = page.properties?.[name]; const value = property?.select?.name || property?.status?.name || getRichText(page, name); if (value) return value; } return ""; }
function normalizeStatus(value: string): CashRegisterStatus { return value === "Cerrada" || value === "Cancelada" ? value : "Abierta"; }
function hasAnyProperty(page: any, names: readonly string[]) { return names.some((name) => page.properties?.[name] !== undefined); }
function isIncomeMovement(page: any) { const property = page.properties?.Tipo; return (property?.select?.name || property?.status?.name || getRichText(page, "Tipo")) === "Ingreso"; }
function movementMatchesFallback(page: any, caja: CashRegisterSession, userProperty: string, businessProperty: string) {
  const dateValue = readDate(page, ["Fecha"]); const opened = caja.openedAt.slice(0, 10); const closed = caja.closedAt?.slice(0, 10); const inDateRange = Boolean(dateValue && dateValue.slice(0, 10) >= opened && (!closed || dateValue.slice(0, 10) <= closed));
  return inDateRange && firstRelation(page, [userProperty]) === caja.openedByUserId && firstRelation(page, [businessProperty]) === caja.businessId;
}
function limitedSummary(cashRegister: CashRegisterSession, warnings: string[]): CashRegisterSummary { return { cashRegister, totalSales: 0, salesByAccount: [], cashSales: 0, nonCashSales: 0, expectedCash: cashRegister.initialCash, cashCounted: cashRegister.cashCounted, difference: null, estimated: true, warnings }; }
