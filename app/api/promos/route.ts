import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoPromos } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { queryDataSource } from "@/lib/notion/client";
import { isActiveNotionPage } from "@/lib/notion/product-mappers";
import { mapPromo } from "@/lib/notion/promo-mappers";

export async function GET(request: Request) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const params = new URL(request.url).searchParams;
  const search = (params.get("search") || "").trim().toLowerCase();
  const type = (params.get("type") || "").trim().toLowerCase();
  if (isDemoMode()) return NextResponse.json({ ok: true, data: filterPromos(demoPromos, search, type), meta: { demo: true } });
  const dataSourceId = getEnv("PROMOS_DATA_SOURCE_ID");
  if (!dataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar PROMOS_DATA_SOURCE_ID." } }, { status: 503 });
  try {
    const result = await queryDataSource(dataSourceId, { page_size: 100 });
    const promos = (result.results || []).filter(isActiveNotionPage).map(mapPromo);
    return NextResponse.json({ ok: true, data: filterPromos(promos, search, type) });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar las promos." } }, { status: 502 }); }
}

function filterPromos(promos: ReturnType<typeof mapPromo>[], search: string, type: string) {
  return promos.filter((promo) => (!search || `${promo.name} ${promo.type || ""}`.toLowerCase().includes(search)) && (!type || (promo.type || "").toLowerCase().includes(type)));
}
