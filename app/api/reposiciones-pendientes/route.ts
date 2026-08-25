import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { listDemoPendingReplenishments } from "@/lib/demo-replenishment-store";
import { listPendingReplenishments, ReplenishmentApprovalError } from "@/lib/notion/replenishment-approval";
import { canManageProducts } from "@/lib/permissions";
import { formatNotionError, SchemaValidationError } from "@/lib/notion/schema";

export async function GET() {
  let session; try { session = await requireAuth(); } catch { return response("UNAUTHORIZED", "Sesión requerida.", 401); }
  if (!canManageProducts(session)) return response("FORBIDDEN", "Vendedor negocio no puede confirmar reposiciones.", 403);
  if (isDemoMode()) return NextResponse.json({ ok: true, data: listDemoPendingReplenishments(), meta: { demo: true, warnings: [] } });
  try { const result = await listPendingReplenishments(session); return NextResponse.json({ ok: true, data: result.data, meta: { warnings: result.warnings } }); }
  catch (error) { return approvalError(error, "No se pudieron cargar las reposiciones pendientes."); }
}

function response(code: string, message: string, status: number) { return NextResponse.json({ ok: false, error: { code, message } }, { status }); }
function approvalError(error: unknown, fallback: string) { const operation = error instanceof ReplenishmentApprovalError ? error : null; const schema = error instanceof SchemaValidationError ? error : null; const code = operation?.code || schema?.code || "NOTION_ERROR"; const status = code === "BUSINESS_FORBIDDEN" ? 403 : code === "CONFIG_MISSING" ? 503 : schema ? 422 : 502; const message = operation?.message || schema?.message || formatNotionError(error, fallback, "Detalle de productos"); return response(code, message, status); }
