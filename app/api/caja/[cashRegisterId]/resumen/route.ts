import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getDemoCashSummary } from "@/lib/demo-cash-store";
import { getCashRegisterSummary } from "@/lib/notion/cash-register";
import { canSell } from "@/lib/permissions";
import { cashRegisterErrorResponse, forbiddenCash, unauthorizedCash } from "@/lib/cash-register-errors";

export async function GET(_request: Request, { params }: { params: Promise<{ cashRegisterId: string }> }) {
  let session; try { session = await requireAuth(); } catch { return unauthorizedCash(); }
  if (!canSell(session)) return forbiddenCash();
  const { cashRegisterId } = await params;
  try { const data = isDemoMode() ? getDemoCashSummary(session, cashRegisterId) : await getCashRegisterSummary(session, cashRegisterId); return NextResponse.json({ ok: true, data, meta: { demo: isDemoMode() } }); }
  catch (error) { return cashRegisterErrorResponse(error, "No se pudo cargar el resumen de caja."); }
}
