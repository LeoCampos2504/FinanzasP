import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { queryDataSource } from "@/lib/notion/client";

export async function POST() {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (isDemoMode()) return NextResponse.json({ ok: true, data: { connected: false, demoMode: true, message: "Modo demo: completá las variables de Notion para probar la conexión real." } });
  try {
    await queryDataSource(getEnv("CUENTAS_DATA_SOURCE_ID") || getEnv("MOVIMIENTOS_DATA_SOURCE_ID"), { page_size: 1 });
    return NextResponse.json({ ok: true, data: { connected: true, demoMode: false, message: "Conexión con Notion correcta." } });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_CONNECTION_ERROR", message: error instanceof Error ? error.message : "No se pudo conectar con Notion." } }, { status: 502 }); }
}
