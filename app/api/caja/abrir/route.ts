import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { openDemoCashRegister } from "@/lib/demo-cash-store";
import { openCashRegister } from "@/lib/notion/cash-register";
import { canSell } from "@/lib/permissions";
import { cashRegisterErrorResponse, forbiddenCash, unauthorizedCash } from "@/lib/cash-register-errors";
import type { OpenCashRegisterInput } from "@/lib/types";

export async function POST(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorizedCash(); }
  if (!canSell(session)) return forbiddenCash();
  const body = await request.json().catch(() => ({}));
  const input: OpenCashRegisterInput = { accountId: String(body.accountId || ""), initialCash: Number(body.initialCash), notes: body.notes ? String(body.notes) : undefined };
  if (!input.accountId) return cashRegisterErrorResponse(new Error("VALIDATION"), "Elegí la cuenta de efectivo.");
  if (!(input.initialCash >= 0) || !Number.isFinite(input.initialCash)) return cashRegisterErrorResponse(new Error("VALIDATION"), "El monto inicial debe ser mayor o igual a cero.");
  try { const result = isDemoMode() ? openDemoCashRegister(session, input) : await openCashRegister(session, input); return NextResponse.json({ ok: true, data: result.data, meta: { demo: isDemoMode(), warnings: result.warnings, message: "Caja abierta correctamente." } }); }
  catch (error) { return cashRegisterErrorResponse(error, "No se pudo abrir la caja."); }
}
