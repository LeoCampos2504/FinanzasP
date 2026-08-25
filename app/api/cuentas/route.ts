import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { createPage, queryDataSource } from "@/lib/notion/client";
import { getDataSourceSchema, formatNotionError } from "@/lib/notion/schema";
import { productAdminError } from "@/lib/notion/product-admin-errors";
import { canManageAccounts, canListActiveAccountsForOperations, canViewAccountsAdmin, getActiveBusinessId, isGlobalAdmin } from "@/lib/permissions";
import { buildAccountProperties, accountSchemaForClient, mapAccount, normalizeAccountInput, validateAccountInput, validateAccountType } from "@/lib/notion/account-admin";
import { listDemoAccounts, createDemoAccount } from "@/lib/demo-account-store";

export async function GET(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
  if (includeInactive ? !canViewAccountsAdmin(session) : !canListActiveAccountsForOperations(session)) return forbidden();
  if (isDemoMode()) {
    const data = listDemoAccounts(includeInactive).filter((account) => (includeInactive || account.active !== false) && accountVisible(account, session, includeInactive));
    return NextResponse.json({ ok: true, data, meta: { demo: true, schema: demoAccountSchema(), readOnly: !canManageAccounts(session) } });
  }
  const dataSourceId = getEnv("CUENTAS_DATA_SOURCE_ID");
  if (!dataSourceId) return configMissing();
  try {
    const [schema, result] = await Promise.all([getDataSourceSchema(dataSourceId), queryDataSource(dataSourceId, { page_size: 100 })]);
    const accounts = (result.results || []).map((page: any) => mapAccount(page)).filter((account: ReturnType<typeof mapAccount>) => (includeInactive || account.active !== false) && accountVisible(account, session, includeInactive));
    const hasBusinessRelation = Boolean(accountSchemaForClient(schema).businessProperty);
    return NextResponse.json({ ok: true, data: accounts, meta: { schema: accountSchemaForClient(schema), readOnly: !canManageAccounts(session), warnings: hasBusinessRelation ? [] : ["Cuentas no tiene relación a Negocios. No se puede aislar cuentas por negocio todavía."] } });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: formatNotionError(error, "No se pudieron cargar las cuentas.", "Cuentas") } }, { status: 502 }); }
}

export async function POST(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  if (!canManageAccounts(session)) return forbidden();
  const body = await request.json().catch(() => ({}));
  const input = normalizeAccountInput(body);
  const validation = validateAccountInput(input);
  if (validation) return validationError(validation);
  const scoped = scopeAccountInput(input, session);
  if (scoped.error) return validationError(scoped.error, "BUSINESS_FORBIDDEN");
  if (isDemoMode()) return NextResponse.json({ ok: true, data: createDemoAccount(scoped.input), meta: { demo: true, message: "Guardado simulado en modo demo." } });
  const dataSourceId = getEnv("CUENTAS_DATA_SOURCE_ID");
  if (!dataSourceId) return configMissing();
  try {
    const schema = await getDataSourceSchema(dataSourceId);
    const typeValidation = validateAccountType(schema, scoped.input.type);
    if (typeValidation) return validationError(typeValidation);
    const built = buildAccountProperties(schema, scoped.input);
    const page = await createPage(dataSourceId, built.properties);
    return NextResponse.json({ ok: true, data: mapAccount(page), meta: { warnings: built.warnings, message: "Cuenta creada correctamente." } });
  } catch (error) { return productAdminError(error, "No se pudo crear la cuenta.", "Cuentas"); }
}

function unauthorized() { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
function forbidden() { return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para administrar cuentas." } }, { status: 403 }); }
function configMissing() { return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar CUENTAS_DATA_SOURCE_ID." } }, { status: 503 }); }
function validationError(message: string, code = "VALIDATION") { return NextResponse.json({ ok: false, error: { code, message } }, { status: 400 }); }
function accountVisible(account: ReturnType<typeof mapAccount>, session: Awaited<ReturnType<typeof requireAuth>>, includeInactive: boolean) {
  if (includeInactive && isGlobalAdmin(session)) return true;
  const allowed = isGlobalAdmin(session) ? [getActiveBusinessId(session)] : (session.businessIds || [getActiveBusinessId(session)]);
  return !account.businessIds?.length || account.businessIds.some((id) => allowed.includes(id));
}
function scopeAccountInput(input: import("@/lib/types").AccountInput, session: Awaited<ReturnType<typeof requireAuth>>) {
  if (isGlobalAdmin(session)) return { input: input.businessIds?.length ? input : { ...input, businessIds: getActiveBusinessId(session) ? [getActiveBusinessId(session)] : undefined } };
  const own = getActiveBusinessId(session);
  if (!own) return { input, error: "Tu usuario no tiene negocio asignado." };
  if (input.businessIds?.some((id) => id !== own)) return { input, error: "Solo podés administrar cuentas de tu negocio." };
  return { input: { ...input, businessIds: [own] } };
}
function demoAccountSchema() { return { typeField: { name: "Tipo de cuenta", type: "rich_text", options: [] }, activeProperty: "Activa", mainCashProperty: "Es caja principal", initialBalanceProperty: "Saldo inicial", orderProperty: "Orden", notesProperty: "Notas", businessProperty: "Negocio" }; }
