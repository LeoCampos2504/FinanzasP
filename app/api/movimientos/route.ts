import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoMovements } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { isBusinessSeller } from "@/lib/permissions";
import { queryDataSource } from "@/lib/notion/client";
import { mapMovement } from "@/lib/notion/mappers";
import { getTitle } from "@/lib/notion/normalize";

export async function GET(request: Request) {
  let session; try { session = await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (isBusinessSeller(session)) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para ver todos los movimientos." } }, { status: 403 });
  const filter = new URL(request.url).searchParams.get("filter") || "all";
  if (isDemoMode() || !getEnv("MOVIMIENTOS_DATA_SOURCE_ID")) {
    const today = new Date();
    const start = filter === "today" ? today : filter === "week" ? new Date(Date.now() - 6 * 86400000) : filter === "month" ? new Date(today.getFullYear(), today.getMonth(), 1) : null;
    const data = demoMovements.filter((m) => !start || new Date(`${m.date}T00:00:00`) >= start);
    return NextResponse.json({ ok: true, data });
  }
  try {
    const [result, accountResult, debtorResult] = await Promise.all([
      queryDataSource(getEnv("MOVIMIENTOS_DATA_SOURCE_ID"), { page_size: 100, sorts: [{ property: "Fecha", direction: "descending" }] }),
      getEnv("CUENTAS_DATA_SOURCE_ID") ? queryDataSource(getEnv("CUENTAS_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] }),
      getEnv("DEUDORES_DATA_SOURCE_ID") ? queryDataSource(getEnv("DEUDORES_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] }),
    ]);
    const accounts = new Map<string, string>((accountResult.results || []).map((p: any): [string, string] => [p.id, getTitle(p)]));
    const debtors = new Map<string, string>((debtorResult.results || []).map((p: any): [string, string] => [p.id, getTitle(p)]));
    const start = filter === "today" ? new Date() : filter === "week" ? new Date(Date.now() - 6 * 86400000) : filter === "month" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : null;
    const data = (result.results || []).map((page: any) => mapMovement(page, { accounts, debtors })).filter((m: any) => !start || new Date(`${m.date}T00:00:00`) >= new Date(start.toISOString().slice(0, 10) + "T00:00:00"));
    return NextResponse.json({ ok: true, data });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar los movimientos." } }, { status: 502 }); }
}
