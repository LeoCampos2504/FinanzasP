import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoAccounts } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { queryDataSource } from "@/lib/notion/client";
import { getCheckbox, getFormulaNumber, getNumber, getTitle } from "@/lib/notion/normalize";

export async function GET() {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (isDemoMode() || !getEnv("CUENTAS_DATA_SOURCE_ID")) return NextResponse.json({ ok: true, data: demoAccounts });
  try {
    const result = await queryDataSource(getEnv("CUENTAS_DATA_SOURCE_ID"), { page_size: 100 });
    const accounts = (result.results || []).filter((p: any) => !p.properties?.Activa || getCheckbox(p, "Activa")).map((p: any) => ({ id: p.id, name: getTitle(p), balance: getFormulaNumber(p, "Saldo esperado") || getNumber(p, "Saldo inicial"), primary: getCheckbox(p, "Es caja principal") }));
    return NextResponse.json({ ok: true, data: accounts });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar las cuentas." } }, { status: 502 }); }
}
