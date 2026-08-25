import "server-only";

import { checkbox, number, richText, select, status, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, DataSourceSchema, pickPropertyName } from "@/lib/notion/schema";
import { getFirstCheckbox, getFirstNumber, getFirstTitle, getRichText, getFirstSelect, getRelationIds } from "@/lib/notion/normalize";
import type { Account, AccountInput } from "@/lib/types";

export const accountCandidates = {
  name: ["Nombre", "Name"],
  active: ["Activa", "Activo", "Habilitada", "Habilitado"],
  mainCash: ["Es caja principal", "Caja principal", "Principal", "Cuenta principal"],
  initialBalance: ["Saldo inicial", "Saldo inicial cuenta", "Inicial"],
  order: ["Orden", "Order"],
  type: ["Tipo de cuenta", "Tipo", "Clase", "Categoría cuenta", "Categoria cuenta"],
  color: ["Color"],
  icon: ["Icono", "Ícono", "Icon"],
  notes: ["Notas", "Nota", "Descripción", "Descripcion"],
  expectedBalance: ["Saldo esperado"],
  business: ["Negocio", "Negocios"],
} as const;

export function mapAccount(page: any): Account {
  const expectedBalance = getFirstNumber(page, accountCandidates.expectedBalance);
  const initialBalance = getFirstNumber(page, accountCandidates.initialBalance);
  return {
    id: page.id,
    name: getFirstTitle(page, accountCandidates.name),
    businessIds: accountCandidates.business.flatMap((name) => getRelationIds(page, name)),
    type: firstRichOrSelect(page, accountCandidates.type) || null,
    initialBalance,
    expectedBalance: hasNumberProperty(page, accountCandidates.expectedBalance) ? expectedBalance : null,
    balance: hasNumberProperty(page, accountCandidates.expectedBalance) ? expectedBalance : initialBalance,
    active: isAccountActive(page),
    isMainCash: getFirstCheckbox(page, accountCandidates.mainCash),
    order: hasNumberProperty(page, accountCandidates.order) ? getFirstNumber(page, accountCandidates.order) : null,
    notes: firstRichText(page, accountCandidates.notes) || null,
  };
}

export function isAccountActive(page: any) {
  const activeProperty = accountCandidates.active.find((name) => page.properties?.[name]?.checkbox !== undefined);
  return activeProperty ? getFirstCheckbox(page, accountCandidates.active) : true;
}

export function accountTypeField(schema: DataSourceSchema) {
  const name = pickPropertyName(schema, accountCandidates.type);
  if (!name) return undefined;
  const definition = schema.properties[name];
  const source = definition[definition.type || ""] as { options?: Array<{ name?: string }> } | undefined;
  return { name, type: definition.type || "unknown", options: (source?.options || []).map((option) => option.name).filter((option): option is string => Boolean(option)) };
}

export function accountSchemaForClient(schema: DataSourceSchema) {
  return {
    typeField: accountTypeField(schema),
    activeProperty: pickPropertyName(schema, accountCandidates.active),
    mainCashProperty: pickPropertyName(schema, accountCandidates.mainCash),
    initialBalanceProperty: pickPropertyName(schema, accountCandidates.initialBalance),
    orderProperty: pickPropertyName(schema, accountCandidates.order),
    notesProperty: pickPropertyName(schema, accountCandidates.notes),
    businessProperty: pickPropertyName(schema, accountCandidates.business),
  };
}

export function normalizeAccountInput(body: any): AccountInput {
  return {
    name: String(body?.name || "").trim(),
    businessIds: Array.isArray(body?.businessIds) ? body.businessIds.map((id: unknown) => String(id)).filter(Boolean) : undefined,
    type: body?.type === undefined ? undefined : body.type === null ? null : String(body.type).trim(),
    initialBalance: body?.initialBalance === undefined || body?.initialBalance === "" || body?.initialBalance === null ? 0 : Number(body.initialBalance),
    isMainCash: body?.isMainCash === undefined ? false : toBoolean(body.isMainCash, false),
    active: body?.active === undefined ? true : toBoolean(body.active, true),
    order: body?.order === undefined || body?.order === "" || body?.order === null ? null : Number(body.order),
    notes: body?.notes === undefined ? undefined : body.notes === null ? null : String(body.notes),
  };
}

export function normalizeAccountPatch(body: any): Partial<AccountInput> {
  const input: Partial<AccountInput> = {};
  if (Object.prototype.hasOwnProperty.call(body, "businessIds")) input.businessIds = Array.isArray(body.businessIds) ? body.businessIds.map((id: unknown) => String(id)).filter(Boolean) : [];
  if (Object.prototype.hasOwnProperty.call(body, "name")) input.name = String(body.name || "").trim();
  if (Object.prototype.hasOwnProperty.call(body, "type")) input.type = body.type === null ? null : String(body.type).trim();
  if (Object.prototype.hasOwnProperty.call(body, "initialBalance")) input.initialBalance = body.initialBalance === null || body.initialBalance === "" ? 0 : Number(body.initialBalance);
  if (Object.prototype.hasOwnProperty.call(body, "isMainCash")) input.isMainCash = toBoolean(body.isMainCash, false);
  if (Object.prototype.hasOwnProperty.call(body, "active")) input.active = toBoolean(body.active, true);
  if (Object.prototype.hasOwnProperty.call(body, "order")) input.order = body.order === null || body.order === "" ? null : Number(body.order);
  if (Object.prototype.hasOwnProperty.call(body, "notes")) input.notes = body.notes === null ? null : String(body.notes);
  return input;
}

export function validateAccountInput(input: AccountInput | Partial<AccountInput>, partial = false) {
  if (!partial && !input.name) return "El nombre de la cuenta es requerido.";
  if (input.name !== undefined && !input.name) return "El nombre de la cuenta es requerido.";
  if (input.initialBalance !== undefined && !Number.isFinite(input.initialBalance)) return "El saldo inicial debe ser un número válido.";
  if (input.order !== undefined && input.order !== null && !Number.isFinite(input.order)) return "El orden debe ser un número válido.";
  if (partial && !Object.keys(input).length) return "No hay cambios para guardar.";
  return "";
}

export function validateAccountType(schema: DataSourceSchema, value: string | null | undefined) {
  if (!value) return "";
  const field = accountTypeField(schema);
  if (!field || !["select", "status"].includes(field.type) || !field.options.length) return "";
  return field.options.includes(value) ? "" : `El tipo de cuenta "${value}" no está disponible en las opciones de Notion.`;
}

export function buildAccountProperties(schema: DataSourceSchema, input: Partial<AccountInput>, requiredName = true) {
  return buildSchemaAwareProperties(schema, "Cuentas", {
    name: { candidates: accountCandidates.name, value: input.name !== undefined ? title(input.name) : undefined, required: requiredName, label: "Nombre" },
    active: { candidates: accountCandidates.active, value: input.active !== undefined ? checkbox(input.active) : undefined, label: "Activa" },
    mainCash: { candidates: accountCandidates.mainCash, value: input.isMainCash !== undefined ? checkbox(input.isMainCash) : undefined, label: "Es caja principal" },
    initialBalance: { candidates: accountCandidates.initialBalance, value: input.initialBalance !== undefined ? number(input.initialBalance) : undefined, label: "Saldo inicial" },
    order: { candidates: accountCandidates.order, value: input.order !== undefined && input.order !== null ? number(input.order) : undefined, label: "Orden" },
    type: { candidates: accountCandidates.type, value: input.type !== undefined ? accountTypeValue(schema, input.type) : undefined, label: "Tipo de cuenta" },
    notes: { candidates: accountCandidates.notes, value: input.notes !== undefined ? richText(input.notes || "") : undefined, label: "Notas" },
    business: { candidates: accountCandidates.business, value: input.businessIds !== undefined ? relationValue(input.businessIds) : undefined, label: "Negocio" },
  });
}

function accountTypeValue(schema: DataSourceSchema, value: string | null) {
  const field = accountTypeField(schema);
  if (field?.type === "status") return status(value || undefined);
  if (field?.type === "select") return select(value || undefined);
  return richText(value || "");
}

function firstRichOrSelect(page: any, names: readonly string[]) {
  return getFirstSelect(page, names) || firstRichText(page, names);
}

function firstRichText(page: any, names: readonly string[]) {
  for (const name of names) { const value = getRichText(page, name); if (value) return value; }
  return "";
}

function hasNumberProperty(page: any, names: readonly string[]) {
  return names.some((name) => {
    const property = page.properties?.[name];
    return property?.number !== undefined || property?.formula?.number !== undefined || property?.rollup?.number !== undefined;
  });
}

function toBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value.toLowerCase() !== "false" && value !== "0";
  return Boolean(value);
}

function relationValue(ids: string[]) { return { relation: ids.map((id) => ({ id })) }; }
