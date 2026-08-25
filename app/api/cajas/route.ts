import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { listDemoCashRegisters } from "@/lib/demo-cash-store";
import { listCashRegisters } from "@/lib/notion/cash-register";
import { canSell } from "@/lib/permissions";
import { cashRegisterErrorResponse, forbiddenCash, unauthorizedCash } from "@/lib/cash-register-errors";

export async function GET(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorizedCash(); }
  if (!canSell(session)) return forbiddenCash();
  const params = new URL(request.url).searchParams; const status = params.get("estado") || "todas";
  try { const result = isDemoMode() ? { data: listDemoCashRegisters(session, { status }) } : await listCashRegisters(session, { status: status as any, businessId: params.get("negocio") || undefined, from: params.get("desde") || undefined, to: params.get("hasta") || undefined }); return NextResponse.json({ ok: true, data: result.data, meta: { demo: isDemoMode() } }); }
  catch (error) { return cashRegisterErrorResponse(error, "No se pudieron cargar las cajas."); }
}
