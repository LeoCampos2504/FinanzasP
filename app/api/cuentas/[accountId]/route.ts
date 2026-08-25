import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { updatePage } from "@/lib/notion/client";
import { getDataSourceSchema } from "@/lib/notion/schema";
import { buildAccountProperties, mapAccount, normalizeAccountPatch, validateAccountInput, validateAccountType } from "@/lib/notion/account-admin";
import { getDemoAccount, updateDemoAccount } from "@/lib/demo-account-store";
import { productAdminError } from "@/lib/notion/product-admin-errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const { accountId } = await params;
  if (!accountId) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Falta el ID de la cuenta." } }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const input = normalizeAccountPatch(body);
  const validation = validateAccountInput(input, true);
  if (validation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: validation } }, { status: 400 });
  if (isDemoMode()) {
    if (!getDemoAccount(accountId)) return notFound();
    return NextResponse.json({ ok: true, data: updateDemoAccount(accountId, input), meta: { demo: true, message: "Guardado simulado en modo demo." } });
  }
  const dataSourceId = getEnv("CUENTAS_DATA_SOURCE_ID");
  if (!dataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar CUENTAS_DATA_SOURCE_ID." } }, { status: 503 });
  try {
    const schema = await getDataSourceSchema(dataSourceId);
    const typeValidation = validateAccountType(schema, input.type);
    if (typeValidation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: typeValidation } }, { status: 400 });
    const built = buildAccountProperties(schema, input, false);
    const page = await updatePage(accountId, built.properties);
    return NextResponse.json({ ok: true, data: mapAccount(page), meta: { warnings: built.warnings, message: "Cuenta actualizada correctamente." } });
  } catch (error) { return productAdminError(error, "No se pudo actualizar la cuenta.", "Cuentas"); }
}

function notFound() { return NextResponse.json({ ok: false, error: { code: "ACCOUNT_NOT_FOUND", message: "No se encontró la cuenta." } }, { status: 404 }); }
