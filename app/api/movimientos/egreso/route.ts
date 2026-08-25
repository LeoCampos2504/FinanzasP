import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createPage } from "@/lib/notion/client";
import { getEnv, isDemoMode } from "@/lib/env";
import { resolveBusinessId } from "@/lib/notion/domain";
import { checkbox, date, number, relation, richText, select, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, formatNotionError, getDataSourceSchema } from "@/lib/notion/schema";

export async function POST(request: Request) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!(amount > 0)) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "El monto debe ser mayor a cero." } }, { status: 400 });
  if (!body.accountId) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Elegí una cuenta." } }, { status: 400 });
  if (!body.date) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "La fecha es requerida." } }, { status: 400 });
  if (!body.origin) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Elegí el origen del dinero." } }, { status: 400 });
  const subtype = ["Gasto", "Retiro personal", "Préstamo", "Otro"].includes(body.subtype) ? body.subtype : "Otro";
  if (isDemoMode() || !getEnv("MOVIMIENTOS_DATA_SOURCE_ID")) return NextResponse.json({ ok: true, data: { id: `demo-${Date.now()}` }, meta: { demo: true, message: "Guardado simulado en modo demo." } });
  try {
    const dataSourceId = getEnv("MOVIMIENTOS_DATA_SOURCE_ID");
    const schema = await getDataSourceSchema(dataSourceId);
    const businessId = await resolveBusinessId();
    const needsBusiness = body.scope !== "Personal" || subtype === "Retiro personal";
    const built = buildSchemaAwareProperties(schema, "Movimientos", {
      name: { candidates: ["Nombre"], value: title(String(body.description || subtype)), required: true },
      date: { candidates: ["Fecha"], value: date(String(body.date)), required: true },
      scope: { candidates: ["Ámbito"], value: select(body.scope === "Personal" ? "Personal" : "Negocio"), required: true },
      business: { candidates: ["Negocio"], value: needsBusiness && businessId ? relation(businessId) : undefined, required: needsBusiness && Boolean(businessId), label: "Negocio" },
      type: { candidates: ["Tipo"], value: select("Egreso"), required: true },
      subtype: { candidates: ["Subtipo"], value: select(subtype), required: true },
      account: { candidates: ["Cuenta"], value: relation(String(body.accountId)), required: true },
      category: { candidates: ["Categoría", "Categoria", "Categoría movimiento", "Categoria movimiento"], value: body.categoryId ? relation(String(body.categoryId)) : undefined, label: "Categoría" },
      amount: { candidates: ["Monto"], value: number(amount), required: true },
      paymentStatus: { candidates: ["Estado de pago", "Estado"], value: select("Pagado"), required: true, label: "Estado de pago" },
      moneyOrigin: { candidates: ["Origen del dinero"], value: select(String(body.origin)), required: true },
      description: { candidates: ["Descripción", "Descripcion", "Notas", "Nota"], value: body.description ? richText(String(body.description)) : undefined, label: "Descripción" },
      active: { candidates: ["Activo"], value: checkbox(true), required: true },
      accountExit: { candidates: ["Salida cuenta"], value: number(amount), label: "Salida cuenta" },
      accountNet: { candidates: ["Movimiento neto cuenta"], value: number(-amount), label: "Movimiento neto cuenta" },
      profitUsed: { candidates: ["Ganancia usada"], value: body.origin === "Ganancias" ? number(amount) : undefined, label: "Ganancia usada" },
      reserveUsed: { candidates: ["Fondo reposición usado"], value: body.origin === "Fondo reposición" ? number(amount) : undefined, label: "Fondo reposición usado" },
      capitalUsed: { candidates: ["Inversión usada"], value: body.origin === "Inversión / capital" ? number(amount) : undefined, label: "Inversión usada" },
    });
    const page = await createPage(dataSourceId, built.properties);
    return NextResponse.json({ ok: true, data: { id: page.id }, meta: built.warnings.length ? { warnings: built.warnings } : undefined });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "NOTION_ERROR", message: formatNotionError(error, "No se pudo guardar el egreso.", "Movimientos") } }, { status: error instanceof Error && "code" in error && String((error as Error & { code?: string }).code) === "NOTION_SCHEMA_MISSING_PROPERTY" ? 422 : 502 }); }
}
