import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createPage } from "@/lib/notion/client";
import { getEnv, isDemoMode } from "@/lib/env";
import { resolveBusinessId } from "@/lib/notion/domain";
import { checkbox, date, number, relation, richText, select, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, formatNotionError, getDataSourceSchema } from "@/lib/notion/schema";
import { AccountOperationError, assertActiveAccount } from "@/lib/notion/account-service";

export async function POST(request: Request) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const dateValue = String(body.date || "");
  const kind = String(body.kind || "general");
  if (!(amount > 0)) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "El monto debe ser mayor a cero." } }, { status: 400 });
  if (!dateValue) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "La fecha es requerida." } }, { status: 400 });
  if (!body.accountId) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Elegí una cuenta." } }, { status: 400 });
  if (kind === "debt" && !body.debtorId) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Elegí un deudor." } }, { status: 400 });
  const subtype = kind === "debt" ? "Cobro de deuda" : "Otro";
  if (isDemoMode() || !getEnv("MOVIMIENTOS_DATA_SOURCE_ID")) return NextResponse.json({ ok: true, data: { id: `demo-${Date.now()}` }, meta: { demo: true, message: "Guardado simulado en modo demo." } });
  try {
    await assertActiveAccount(String(body.accountId));
    const dataSourceId = getEnv("MOVIMIENTOS_DATA_SOURCE_ID");
    const schema = await getDataSourceSchema(dataSourceId);
    const businessId = await resolveBusinessId();
    const built = buildSchemaAwareProperties(schema, "Movimientos", {
      name: { candidates: ["Nombre"], value: title(String(body.description || (kind === "simple" ? "Venta simple" : "Ingreso general"))), required: true },
      date: { candidates: ["Fecha"], value: date(dateValue), required: true },
      scope: { candidates: ["Ámbito"], value: select("Negocio"), required: true },
      business: { candidates: ["Negocio"], value: businessId ? relation(businessId) : undefined },
      type: { candidates: ["Tipo"], value: select("Ingreso"), required: true },
      subtype: { candidates: ["Subtipo"], value: select(subtype), required: true },
      account: { candidates: ["Cuenta"], value: relation(String(body.accountId)), required: true },
      debtor: { candidates: ["Deudor"], value: body.debtorId ? relation(String(body.debtorId)) : undefined, required: kind === "debt", label: "Deudor" },
      amount: { candidates: ["Monto"], value: number(amount), required: true },
      paymentStatus: { candidates: ["Estado de pago", "Estado"], value: select("Pagado"), required: true, label: "Estado de pago" },
      moneyOrigin: { candidates: ["Origen del dinero"], value: select("No aplica"), required: true },
      description: { candidates: ["Descripción", "Descripcion", "Notas", "Nota"], value: body.description ? richText(String(body.description)) : undefined, label: "Descripción" },
      active: { candidates: ["Activo"], value: checkbox(true), required: true },
      accountEntry: { candidates: ["Entrada cuenta"], value: number(amount), label: "Entrada cuenta" },
      accountNet: { candidates: ["Movimiento neto cuenta"], value: number(amount), label: "Movimiento neto cuenta" },
      debtCollection: { candidates: ["Cobro deuda"], value: kind === "debt" ? number(amount) : undefined, label: "Cobro deuda" },
    });
    const page = await createPage(dataSourceId, built.properties);
    return NextResponse.json({ ok: true, data: { id: page.id }, meta: built.warnings.length ? { warnings: built.warnings } : undefined });
  } catch (error) { const code = error instanceof AccountOperationError ? error.code : error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "NOTION_ERROR"; const status = code === "ACCOUNT_INACTIVE" ? 409 : code === "ACCOUNT_NOT_FOUND" ? 404 : code === "CONFIG_MISSING" ? 503 : code === "NOTION_SCHEMA_MISSING_PROPERTY" ? 422 : 502; return NextResponse.json({ ok: false, error: { code, message: error instanceof AccountOperationError ? error.message : formatNotionError(error, "No se pudo guardar el ingreso.", "Movimientos") } }, { status }); }
}
