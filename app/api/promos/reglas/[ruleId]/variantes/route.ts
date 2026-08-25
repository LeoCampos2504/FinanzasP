import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoPromoRules, demoVariants } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { getPromoRule, listPromoRuleVariants } from "@/lib/notion/promo-service";
import type { SellableVariant } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const { ruleId } = await params;
  if (isDemoMode()) {
    const rule = demoPromoRules.find((item) => item.id === ruleId);
    if (!rule) return NextResponse.json({ ok: false, error: { code: "RULE_NOT_FOUND", message: "No se encontró la regla de promo." } }, { status: 404 });
    const variants = demoVariants.filter((variant) => variant.active !== false && (!rule.productBaseId || variant.productBaseId === rule.productBaseId) && (!rule.fixedVariantId || variant.id === rule.fixedVariantId));
    return NextResponse.json({ ok: true, data: variants, meta: { demo: true } });
  }
  try {
    const rule = await getPromoRule(ruleId);
    const variants = await listPromoRuleVariants(rule);
    return NextResponse.json({ ok: true, data: rule.fixedVariantId ? variants.filter((variant: SellableVariant) => variant.id === rule.fixedVariantId) : variants });
  } catch (error) { const code = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "NOTION_ERROR"; return NextResponse.json({ ok: false, error: { code, message: error instanceof Error ? error.message : "No se pudieron cargar las variantes." } }, { status: code === "CONFIG_MISSING" ? 503 : 502 }); }
}
