import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { createPage, queryDataSource } from "@/lib/notion/client";
import { getDataSourceSchema, formatNotionError } from "@/lib/notion/schema";
import { productAdminError } from "@/lib/notion/product-admin-errors";
import { buildAccountProperties, accountSchemaForClient, mapAccount, normalizeAccountInput, validateAccountInput, validateAccountType } from "@/lib/notion/account-admin";
import { listDemoAccounts, createDemoAccount } from "@/lib/demo-account-store";

export async function GET(request: Request) {
  try { await requireAuth(); } catch { return unauthorized(); }
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
  if (isDemoMode()) return NextResponse.json({ ok: true, data: listDemoAccounts(includeInactive), meta: { demo: true, schema: demoAccountSchema() } });
  const dataSourceId = getEnv("CUENTAS_DATA_SOURCE_ID");
  if (!dataSourceId) return configMissing();
  try {
    const [schema, result] = await Promise.all([getDataSourceSchema(dataSourceId), queryDataSource(dataSourceId, { page_size: 100 })]);
    const accounts = (result.results || []).map((page: any) => mapAccount(page)).filter((account: ReturnType<typeof mapAccount>) => includeInactive || account.active !== false);
    return NextResponse.json({ ok: true, data: accounts, meta: { schema: accountSchemaForClient(schema) } });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: formatNotionError(error, "No se pudieron cargar las cuentas.", "Cuentas") } }, { status: 502 }); }
}

export async function POST(request: Request) {
  try { await requireAuth(); } catch { return unauthorized(); }
  const body = await request.json().catch(() => ({}));
  const input = normalizeAccountInput(body);
  const validation = validateAccountInput(input);
  if (validation) return validationError(validation);
  if (isDemoMode()) return NextResponse.json({ ok: true, data: createDemoAccount(input), meta: { demo: true, message: "Guardado simulado en modo demo." } });
  const dataSourceId = getEnv("CUENTAS_DATA_SOURCE_ID");
  if (!dataSourceId) return configMissing();
  try {
    const schema = await getDataSourceSchema(dataSourceId);
    const typeValidation = validateAccountType(schema, input.type);
    if (typeValidation) return validationError(typeValidation);
    const built = buildAccountProperties(schema, input);
    const page = await createPage(dataSourceId, built.properties);
    return NextResponse.json({ ok: true, data: mapAccount(page), meta: { warnings: built.warnings, message: "Cuenta creada correctamente." } });
  } catch (error) { return productAdminError(error, "No se pudo crear la cuenta.", "Cuentas"); }
}

function unauthorized() { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
function configMissing() { return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar CUENTAS_DATA_SOURCE_ID." } }, { status: 503 }); }
function validationError(message: string) { return NextResponse.json({ ok: false, error: { code: "VALIDATION", message } }, { status: 400 }); }
function demoAccountSchema() { return { typeField: { name: "Tipo de cuenta", type: "rich_text", options: [] }, activeProperty: "Activa", mainCashProperty: "Es caja principal", initialBalanceProperty: "Saldo inicial", orderProperty: "Orden", notesProperty: "Notas" }; }
