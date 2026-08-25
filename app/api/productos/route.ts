import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoProducts } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { queryDataSource } from "@/lib/notion/client";
import { mapProductBase, isActiveNotionPage } from "@/lib/notion/product-mappers";

export async function GET() {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (isDemoMode()) return NextResponse.json({ ok: true, data: demoProducts, meta: { demo: true } });
  if (!getEnv("PRODUCTOS_DATA_SOURCE_ID")) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar PRODUCTOS_DATA_SOURCE_ID." } }, { status: 503 });
  try {
    const result = await queryDataSource(getEnv("PRODUCTOS_DATA_SOURCE_ID"), { page_size: 100 });
    return NextResponse.json({ ok: true, data: (result.results || []).filter(isActiveNotionPage).map(mapProductBase) });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar los productos." } }, { status: 502 }); }
}
