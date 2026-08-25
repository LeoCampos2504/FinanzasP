import "server-only";

import { checkbox, date, number, richText, select, status, title } from "@/lib/notion/properties";
import { createPage, queryDataSource, retrievePage, updatePage } from "@/lib/notion/client";
import { buildSchemaAwareProperties, DataSourceSchema, getDataSourceSchema, pickPropertyName } from "@/lib/notion/schema";
import { getFirstCheckbox, getFirstNumber, getFirstSelect, getFirstTitle, getRichText } from "@/lib/notion/normalize";
import { getEnv } from "@/lib/env";
import { normalizeRole, roles, type AppRole } from "@/lib/permissions";
import { getRelationIds } from "@/lib/notion/normalize";

export const userCandidates = {
  name: ["Nombre", "Name"],
  active: ["Activo", "Activa", "Habilitado", "Habilitada"],
  role: ["Rol", "Role", "Tipo de usuario", "Permiso", "Permisos"],
  pinHash: ["PIN hash", "Pin hash", "Hash PIN", "Hash", "Clave hash", "Password hash"],
  requiresPinSetup: ["PIN pendiente", "Requiere configurar PIN", "Debe configurar PIN", "Reset PIN", "Restablecer PIN"],
  order: ["Orden", "Order"],
  notes: ["Notas", "Nota", "Descripción", "Descripcion"],
  lastLogin: ["Último acceso", "Ultimo acceso", "Last login", "Último ingreso", "Ultimo ingreso"],
  business: ["Negocio", "Negocios", "Negocios asignados", "Empresa", "Empresas"],
} as const;

export type UserRole = AppRole;
export type UserInput = { name: string; role: UserRole; active: boolean; businessIds: string[]; order?: number | null; notes?: string | null };
export type UserRecord = UserInput & { id: string; hasPin: boolean; requiresPinSetup: boolean; lastLogin?: string; pinHash?: string };
export type PublicUser = Omit<UserRecord, "pinHash">;

export class UserServiceError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = "UserServiceError"; this.code = code; }
}

export function userDataSourceId() { return getEnv("USUARIOS_DATA_SOURCE_ID"); }

export function mapUser(page: any): UserRecord {
  const role = normalizeRole(readRole(page) || "Usuario");
  const pinHash = readPinHash(page);
  return {
    id: page.id,
    name: getFirstTitle(page, userCandidates.name),
    active: isUserActive(page),
    role,
    businessIds: readBusinessIds(page),
    order: userCandidates.order.some((name) => page.properties?.[name]?.number !== undefined) ? getFirstNumber(page, userCandidates.order) : null,
    notes: readRichText(page, userCandidates.notes) || null,
    hasPin: Boolean(pinHash),
    requiresPinSetup: readRequiresPinSetup(page, !pinHash),
    lastLogin: readDate(page, userCandidates.lastLogin),
    pinHash,
  };
}

export function toPublicUser(user: UserRecord): PublicUser {
  const { pinHash: _pinHash, ...publicUser } = user;
  return publicUser;
}

export function normalizeUserInput(body: any): UserInput {
  const role = normalizeRole(body?.role);
  return {
    name: String(body?.name || "").trim(),
    role,
    businessIds: Array.isArray(body?.businessIds) ? body.businessIds.map((id: unknown) => String(id)).filter(Boolean) : [],
    active: body?.active === undefined ? true : toBoolean(body.active, true),
    order: body?.order === undefined || body?.order === "" || body?.order === null ? null : Number(body.order),
    notes: body?.notes === undefined ? undefined : body.notes === null ? null : String(body.notes),
  };
}

export function normalizeUserPatch(body: any): Partial<UserInput> {
  const input: Partial<UserInput> = {};
  if (Object.prototype.hasOwnProperty.call(body, "name")) input.name = String(body.name || "").trim();
  if (Object.prototype.hasOwnProperty.call(body, "role")) input.role = normalizeRole(body.role);
  if (Object.prototype.hasOwnProperty.call(body, "businessIds")) input.businessIds = Array.isArray(body.businessIds) ? body.businessIds.map((id: unknown) => String(id)).filter(Boolean) : [];
  if (Object.prototype.hasOwnProperty.call(body, "active")) input.active = toBoolean(body.active, true);
  if (Object.prototype.hasOwnProperty.call(body, "order")) input.order = body.order === null || body.order === "" ? null : Number(body.order);
  if (Object.prototype.hasOwnProperty.call(body, "notes")) input.notes = body.notes === null ? null : String(body.notes);
  return input;
}

export function validateUserInput(input: UserInput | Partial<UserInput>, partial = false) {
  if (!partial && !input.name) return "El nombre del usuario es requerido.";
  if (input.name !== undefined && !input.name) return "El nombre del usuario es requerido.";
  if (input.role !== undefined && !roles.includes(input.role)) return "El rol no es válido.";
  if (input.order !== undefined && input.order !== null && !Number.isFinite(input.order)) return "El orden debe ser un número válido.";
  if (partial && !Object.keys(input).length) return "No hay cambios para guardar.";
  return "";
}

export function userRoleField(schema: DataSourceSchema) {
  const name = pickPropertyName(schema, userCandidates.role);
  if (!name) return undefined;
  const definition = schema.properties[name];
  const source = definition[definition.type || ""] as { options?: Array<{ name?: string }> } | undefined;
  return { name, type: definition.type || "unknown", options: (source?.options || []).map((option) => option.name).filter((option): option is string => Boolean(option)) };
}

export function userSchemaForClient(schema: DataSourceSchema) {
  return {
    roleField: userRoleField(schema),
    activeProperty: pickPropertyName(schema, userCandidates.active),
    pendingPinProperty: pickPropertyName(schema, userCandidates.requiresPinSetup),
    orderProperty: pickPropertyName(schema, userCandidates.order),
    notesProperty: pickPropertyName(schema, userCandidates.notes),
    lastLoginProperty: pickPropertyName(schema, userCandidates.lastLogin),
    businessProperty: pickPropertyName(schema, userCandidates.business),
  };
}

export function validateUserRole(schema: DataSourceSchema, role: UserRole | undefined) {
  if (!role) return "";
  const field = userRoleField(schema);
  if (!field || !["select", "status"].includes(field.type) || !field.options.length) return "";
  const storageRole = roleStorageValue(field.options, role);
  return storageRole ? "" : `El rol "${role}" no está disponible en las opciones de Notion.`;
}

export function buildUserProperties(schema: DataSourceSchema, input: Partial<UserInput> & { pinHash?: string; requiresPinSetup?: boolean; lastLogin?: string }) {
  return buildSchemaAwareProperties(schema, "Usuarios", {
    name: { candidates: userCandidates.name, value: input.name !== undefined ? title(input.name) : undefined, required: true, label: "Nombre" },
    active: { candidates: userCandidates.active, value: input.active !== undefined ? checkbox(input.active) : undefined, required: true, label: "Activo" },
    role: { candidates: userCandidates.role, value: input.role !== undefined ? roleValue(schema, input.role) : undefined, required: true, label: "Rol" },
    pinHash: { candidates: userCandidates.pinHash, value: input.pinHash !== undefined ? pinHashValue(schema, input.pinHash) : undefined, required: true, label: "PIN hash" },
    requiresPinSetup: { candidates: userCandidates.requiresPinSetup, value: input.requiresPinSetup !== undefined ? checkbox(input.requiresPinSetup) : undefined, label: "PIN pendiente" },
    order: { candidates: userCandidates.order, value: input.order !== undefined && input.order !== null ? number(input.order) : undefined, label: "Orden" },
    notes: { candidates: userCandidates.notes, value: input.notes !== undefined ? richText(input.notes || "") : undefined, label: "Notas" },
    lastLogin: { candidates: userCandidates.lastLogin, value: input.lastLogin ? date(input.lastLogin) : undefined, label: "Último acceso" },
    business: { candidates: userCandidates.business, value: input.businessIds !== undefined ? relations(input.businessIds) : undefined, label: "Negocio" },
  });
}

export async function listUsers(options: { includeInactive?: boolean } = {}) {
  const dataSourceId = userDataSourceId();
  if (!dataSourceId) throw new UserServiceError("CONFIG_MISSING", "Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global.");
  const body = await queryDataSource(dataSourceId, { page_size: 100 });
  const users = (body.results || []).map(mapUser).filter((user: UserRecord) => options.includeInactive || user.active !== false).sort((a: UserRecord, b: UserRecord) => (a.order ?? 999999) - (b.order ?? 999999) || a.name.localeCompare(b.name));
  return users;
}

export async function getUserById(userId: string) {
  if (!userDataSourceId()) throw new UserServiceError("CONFIG_MISSING", "Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global.");
  try {
    const page = await retrievePage(userId);
    const user = mapUser(page);
    if (!user.name) throw new Error("missing");
    return user;
  } catch {
    throw new UserServiceError("USER_NOT_FOUND", "No se encontró el usuario seleccionado.");
  }
}

export async function createUser(input: UserInput) {
  const dataSourceId = userDataSourceId();
  if (!dataSourceId) throw new UserServiceError("CONFIG_MISSING", "Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global.");
  const schema = await getDataSourceSchema(dataSourceId);
  const properties = buildUserProperties(schema, input);
  return createPage(dataSourceId, properties.properties);
}

export async function updateUser(userId: string, input: Partial<UserInput>) {
  const dataSourceId = userDataSourceId();
  if (!dataSourceId) throw new UserServiceError("CONFIG_MISSING", "Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global.");
  const schema = await getDataSourceSchema(dataSourceId);
  const properties = buildUserProperties(schema, input);
  await updatePage(userId, properties.properties);
  return getUserById(userId);
}

export async function resetUserPin(userId: string) {
  const dataSourceId = userDataSourceId();
  if (!dataSourceId) throw new UserServiceError("CONFIG_MISSING", "Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global.");
  const schema = await getDataSourceSchema(dataSourceId);
  const properties = buildUserProperties(schema, { pinHash: "", requiresPinSetup: true });
  await updatePage(userId, properties.properties);
  return getUserById(userId);
}

export async function setUserPin(userId: string, hashedPin: string) {
  const dataSourceId = userDataSourceId();
  if (!dataSourceId) throw new UserServiceError("CONFIG_MISSING", "Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global.");
  const schema = await getDataSourceSchema(dataSourceId);
  const properties = buildUserProperties(schema, { pinHash: hashedPin, requiresPinSetup: false });
  await updatePage(userId, properties.properties);
  return getUserById(userId);
}

export async function updateLastLogin(userId: string) {
  const dataSourceId = userDataSourceId();
  if (!dataSourceId) return;
  const schema = await getDataSourceSchema(dataSourceId);
  const property = pickPropertyName(schema, userCandidates.lastLogin);
  if (!property || schema.properties[property].type !== "date") return;
  await updatePage(userId, { [property]: date(new Date().toISOString()) });
}

function roleValue(schema: DataSourceSchema, role: UserRole) {
  const field = userRoleField(schema);
  const value = roleStorageValue(field?.options || [], role) || role;
  if (field?.type === "status") return status(value);
  if (field?.type === "select") return select(value);
  return richText(value);
}

function roleStorageValue(options: string[], role: UserRole) {
  if (!options.length || options.includes(role)) return role;
  if (role === "Admin global" && options.includes("Admin")) return "Admin";
  if (role === "Vendedor negocio" && options.includes("Usuario")) return "Usuario";
  return "";
}
function relations(ids: string[]) { return { relation: ids.map((id) => ({ id })) }; }

function pinHashValue(schema: DataSourceSchema, value: string) {
  const property = pickPropertyName(schema, userCandidates.pinHash);
  const type = property ? schema.properties[property].type : "rich_text";
  if (type === "title") return value ? title(value) : { title: [] };
  if (type === "rich_text") return richText(value);
  throw new UserServiceError("PIN_SCHEMA_UNSUPPORTED", "La propiedad PIN hash debe ser de tipo texto en Notion.");
}

function readRole(page: any) { return getFirstSelect(page, userCandidates.role) || readStatus(page, userCandidates.role) || readRichText(page, userCandidates.role); }
function readBusinessIds(page: any) { for (const name of userCandidates.business) { const ids = getRelationIds(page, name); if (ids.length) return ids; } return []; }
function readPinHash(page: any) { return readRichText(page, userCandidates.pinHash) || readTitle(page, userCandidates.pinHash); }
function readRichText(page: any, names: readonly string[]) { for (const name of names) { const value = getRichText(page, name); if (value) return value; } return ""; }
function readTitle(page: any, names: readonly string[]) { for (const name of names) { const value = page.properties?.[name]?.title?.map((item: any) => item.plain_text || item.text?.content || "").join(""); if (value) return value; } return ""; }
function readStatus(page: any, names: readonly string[]) { for (const name of names) { const value = page.properties?.[name]?.status?.name; if (value) return value; } return ""; }
function readDate(page: any, names: readonly string[]) { for (const name of names) { const value = page.properties?.[name]?.date?.start; if (value) return value; } return ""; }
function isUserActive(page: any) { const property = userCandidates.active.find((name) => page.properties?.[name]?.checkbox !== undefined); return property ? getFirstCheckbox(page, userCandidates.active) : true; }
function readRequiresPinSetup(page: any, fallback: boolean) { const property = userCandidates.requiresPinSetup.find((name) => page.properties?.[name]?.checkbox !== undefined); return property ? getFirstCheckbox(page, userCandidates.requiresPinSetup) : fallback; }
function toBoolean(value: unknown, fallback: boolean) { if (value === undefined || value === null) return fallback; if (typeof value === "string") return value.toLowerCase() !== "false" && value !== "0"; return Boolean(value); }
