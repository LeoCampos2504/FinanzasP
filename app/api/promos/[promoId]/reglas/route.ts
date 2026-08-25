import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoPromoRules } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { loadPromoContext } from "@/lib/notion/promo-service";

export async function GET(_request: Request, { params }: { params: Promise<{ promoId: string }> }) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const { promoId } = await params;
  if (isDemoMode()) return NextResponse.json({ ok: true, data: demoPromoRules.filter((rule) => rule.promoId === promoId), meta: { demo: true } });
  try {
    const context = await loadPromoContext(promoId);
    return NextResponse.json({ ok: true, data: context.rules });
  } catch (error) { const code = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "NOTION_ERROR"; return NextResponse.json({ ok: false, error: { code, message: error instanceof Error ? error.message : "No se pudieron cargar las reglas de la promo." } }, { status: code === "CONFIG_MISSING" ? 503 : 502 }); }
}
