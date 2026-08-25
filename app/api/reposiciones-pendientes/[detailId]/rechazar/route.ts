import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { rejectDemoReplenishment } from "@/lib/demo-replenishment-store";
import { rejectReplenishment, ReplenishmentApprovalError } from "@/lib/notion/replenishment-approval";
import { canManageProducts } from "@/lib/permissions";
import { formatNotionError, SchemaValidationError } from "@/lib/notion/schema";

export async function POST(request: Request, { params }: { params: Promise<{ detailId: string }> }) {
  let session; try { session = await requireAuth(); } catch { return response("UNAUTHORIZED", "Sesión requerida.", 401); }
  if (!canManageProducts(session)) return response("FORBIDDEN", "Vendedor negocio no puede rechazar reposiciones.", 403);
  const { detailId } = await params; const body = await request.json().catch(() => ({})); const notes = body.notes ? String(body.notes) : undefined;
  try { const data = isDemoMode() ? rejectDemoReplenishment(detailId, session.userId, notes) : await rejectReplenishment(detailId, session, notes); return NextResponse.json({ ok: true, data, meta: { demo: isDemoMode(), message: "Reposición rechazada. Se aplicó el ajuste inverso cuando fue posible." } }); }
  catch (error) { return approvalError(error, "No se pudo rechazar la reposición."); }
}
function response(code: string, message: string, status: number) { return NextResponse.json({ ok: false, error: { code, message } }, { status }); }
function approvalError(error: unknown, fallback: string) { const operation = error instanceof ReplenishmentApprovalError ? error : null; const schema = error instanceof SchemaValidationError ? error : null; const demoCode = error instanceof Error && ["REPLENISHMENT_NOT_FOUND", "REPLENISHMENT_NOT_PENDING"].includes(error.message) ? error.message : undefined; const code = operation?.code || schema?.code || demoCode || "NOTION_ERROR"; const status = code === "BUSINESS_FORBIDDEN" ? 403 : code === "REPLENISHMENT_NOT_FOUND" ? 404 : code === "REPLENISHMENT_NOT_PENDING" ? 409 : code === "CONFIG_MISSING" ? 503 : schema ? 422 : 502; const message = operation?.message || schema?.message || (code === "REPLENISHMENT_NOT_FOUND" ? "No se encontró la reposición." : code === "REPLENISHMENT_NOT_PENDING" ? "La reposición ya no está pendiente de confirmación." : formatNotionError(error, fallback, "Detalle de productos")); return response(code, message, status); }
