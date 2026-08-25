import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getDemoCashSummary, getDemoOpenCashRegister } from "@/lib/demo-cash-store";
import { getCashRegisterSummary, getOpenCashRegisterForSession } from "@/lib/notion/cash-register";
import { canSell } from "@/lib/permissions";
import { cashRegisterErrorResponse, forbiddenCash, unauthorizedCash } from "@/lib/cash-register-errors";

export async function GET() {
  let session; try { session = await requireAuth(); } catch { return unauthorizedCash(); }
  if (!canSell(session)) return forbiddenCash();
  try {
    const caja = isDemoMode() ? getDemoOpenCashRegister(session) : await getOpenCashRegisterForSession(session);
    if (!caja) return NextResponse.json({ ok: true, data: null, meta: { demo: isDemoMode() } });
    const summary = isDemoMode() ? getDemoCashSummary(session, caja.id) : await getCashRegisterSummary(session, caja.id);
    return NextResponse.json({ ok: true, data: summary, meta: { demo: isDemoMode() } });
  } catch (error) { return cashRegisterErrorResponse(error, "No se pudo cargar la caja actual."); }
}
