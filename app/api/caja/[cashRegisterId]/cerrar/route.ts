import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { closeDemoCashRegister } from "@/lib/demo-cash-store";
import { closeCashRegister } from "@/lib/notion/cash-register";
import { canSell } from "@/lib/permissions";
import { cashRegisterErrorResponse, forbiddenCash, unauthorizedCash } from "@/lib/cash-register-errors";

export async function POST(request: Request, { params }: { params: Promise<{ cashRegisterId: string }> }) {
  let session; try { session = await requireAuth(); } catch { return unauthorizedCash(); }
  if (!canSell(session)) return forbiddenCash();
  const { cashRegisterId } = await params; const body = await request.json().catch(() => ({})); const cashCounted = Number(body.cashCounted); const notes = body.notes ? String(body.notes) : undefined;
  if (!(cashCounted >= 0) || !Number.isFinite(cashCounted)) return cashRegisterErrorResponse(new Error("VALIDATION"), "El efectivo contado debe ser mayor o igual a cero.");
  try { const result = isDemoMode() ? closeDemoCashRegister(session, cashRegisterId, { cashCounted, notes }) : await closeCashRegister(session, cashRegisterId, { cashCounted, notes }); return NextResponse.json({ ok: true, data: result.data, meta: { demo: isDemoMode(), warnings: result.warnings, message: "Caja cerrada correctamente." } }); }
  catch (error) { return cashRegisterErrorResponse(error, "No se pudo cerrar la caja."); }
}
