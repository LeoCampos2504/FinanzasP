import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { updatePage } from "@/lib/notion/client";
import { getDataSourceSchema } from "@/lib/notion/schema";
import { buildAccountProperties, mapAccount, normalizeAccountPatch, validateAccountInput, validateAccountType } from "@/lib/notion/account-admin";
import { getDemoAccount, updateDemoAccount } from "@/lib/demo-account-store";
import { productAdminError } from "@/lib/notion/product-admin-errors";
import { canManageAccounts, getActiveBusinessId, isGlobalAdmin } from "@/lib/permissions";
import { assertPageBusinessAccess } from "@/lib/notion/business-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  let session; try { session = await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (!canManageAccounts(session)) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para administrar cuentas." } }, { status: 403 });
  const { accountId } = await params;
  if (!accountId) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Falta el ID de la cuenta." } }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const input = normalizeAccountPatch(body);
  const validation = validateAccountInput(input, true);
  if (validation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: validation } }, { status: 400 });
  const ownBusiness = getActiveBusinessId(session);
  if (!isGlobalAdmin(session) && input.businessIds?.some((id) => id !== ownBusiness)) return NextResponse.json({ ok: false, error: { code: "BUSINESS_FORBIDDEN", message: "Solo podés administrar cuentas de tu negocio." } }, { status: 403 });
  if (!isGlobalAdmin(session) && input.businessIds !== undefined) input.businessIds = ownBusiness ? [ownBusiness] : [];
  if (isDemoMode()) {
    if (!getDemoAccount(accountId)) return notFound();
    return NextResponse.json({ ok: true, data: updateDemoAccount(accountId, input), meta: { demo: true, message: "Guardado simulado en modo demo." } });
  }
  const dataSourceId = getEnv("CUENTAS_DATA_SOURCE_ID");
  if (!dataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar CUENTAS_DATA_SOURCE_ID." } }, { status: 503 });
  try {
    await assertPageBusinessAccess(accountId, session);
    const schema = await getDataSourceSchema(dataSourceId);
    const typeValidation = validateAccountType(schema, input.type);
    if (typeValidation) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: typeValidation } }, { status: 400 });
    const built = buildAccountProperties(schema, input, false);
    const page = await updatePage(accountId, built.properties);
    return NextResponse.json({ ok: true, data: mapAccount(page), meta: { warnings: built.warnings, message: "Cuenta actualizada correctamente." } });
  } catch (error) { return productAdminError(error, "No se pudo actualizar la cuenta.", "Cuentas"); }
}

function notFound() { return NextResponse.json({ ok: false, error: { code: "ACCOUNT_NOT_FOUND", message: "No se encontró la cuenta." } }, { status: 404 }); }
