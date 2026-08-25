import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoCategories } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { queryDataSource } from "@/lib/notion/client";
import { getCheckbox, getSelect, getTitle } from "@/lib/notion/normalize";

export async function GET() {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (isDemoMode() || !getEnv("CATEGORIAS_DATA_SOURCE_ID")) return NextResponse.json({ ok: true, data: demoCategories });
  try {
    const result = await queryDataSource(getEnv("CATEGORIAS_DATA_SOURCE_ID"), { page_size: 100 });
    const categories = (result.results || []).filter((p: any) => !p.properties?.Activa || getCheckbox(p, "Activa")).map((p: any) => ({ id: p.id, name: getTitle(p), type: getSelect(p, "Tipo de movimiento") }));
    return NextResponse.json({ ok: true, data: categories });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar las categorías." } }, { status: 502 }); }
}
