import { NextResponse } from "next/server";
import { CashRegisterError } from "@/lib/notion/cash-register";
import { formatNotionError, SchemaValidationError } from "@/lib/notion/schema";

const demoMessages: Record<string, string> = {
  CASH_REGISTER_NOT_FOUND: "No se encontró la caja.",
  CASH_REGISTER_NOT_OPEN: "La caja no está abierta.",
  CASH_REGISTER_ALREADY_OPEN: "Ya tenés una caja abierta.",
  CASH_REGISTER_FORBIDDEN: "No tenés permiso para cerrar esta caja.",
  BUSINESS_FORBIDDEN: "La caja no pertenece a tu negocio.",
};

export function cashRegisterErrorResponse(error: unknown, fallback: string) {
  const operation = error instanceof CashRegisterError ? error : null;
  const schema = error instanceof SchemaValidationError ? error : null;
  const demoCode = error instanceof Error && demoMessages[error.message] ? error.message : undefined;
  const rawCode = error instanceof Error && ["VALIDATION", "CONFIG_MISSING"].includes(error.message) ? error.message : undefined;
  const code = operation?.code || schema?.code || demoCode || rawCode || "NOTION_ERROR";
  const status = code === "BUSINESS_FORBIDDEN" || code === "CASH_REGISTER_FORBIDDEN" ? 403 : code === "CASH_REGISTER_NOT_FOUND" ? 404 : code === "CASH_REGISTER_ALREADY_OPEN" || code === "CASH_REGISTER_NOT_OPEN" || code === "VALIDATION" ? 409 : code === "CONFIG_MISSING" ? 503 : code === "CASH_REGISTER_STATUS_OPTION_MISSING" || schema ? 422 : 502;
  const message = operation?.message || schema?.message || (demoCode ? demoMessages[demoCode] : fallback);
  return NextResponse.json({ ok: false, error: { code, message, details: operation?.details } }, { status });
}

export function unauthorizedCash() { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
export function forbiddenCash(message = "No tenés permiso para usar Caja/POS.") { return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message } }, { status: 403 }); }
