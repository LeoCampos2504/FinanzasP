import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoPromos, demoPromoRules, demoVariants } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { retrievePage } from "@/lib/notion/client";
import { mapSellableVariant } from "@/lib/notion/product-mappers";
import { loadPromoContext } from "@/lib/notion/promo-service";
import { resolvePromoUnitPrice } from "@/lib/promo-calculations";
import { canAccessBusiness, canSell, type PermissionSession } from "@/lib/permissions";
import type { PosPromo } from "@/lib/types";

export async function GET() {
  let session: Awaited<ReturnType<typeof requireAuth>>;
  try { session = await requireAuth(); } catch { return response("UNAUTHORIZED", "Sesión requerida.", 401); }
  if (!canSell(session)) return response("FORBIDDEN", "No tenés permiso para vender.", 403);
  try {
    if (isDemoMode()) {
      const data = demoPromos.filter((promo) => promo.active !== false).map((promo) => {
        const rules = demoPromoRules.filter((rule) => rule.promoId === promo.id && rule.active !== false);
        const fixed = rules.length > 0 && rules.every((rule) => !rule.allowVariantChoice && Boolean(rule.fixedVariantId));
        if (!fixed) return null;
        return { id: promo.id, name: promo.name, type: promo.type, displayPrice: promo.displayPrice, active: promo.active, components: rules.map((rule) => { const variant = demoVariants.find((item) => item.id === rule.fixedVariantId); return { ruleId: rule.id, variantId: rule.fixedVariantId as string, variantName: variant?.name || rule.fixedVariantName || "Variante", quantity: rule.requiredQuantity, unitPrice: resolvePromoUnitPrice("fixed", variant?.salePrice || 0, variant?.promoPrice || 0).value, replacementCost: variant?.replacementCost || 0, managesStock: Boolean(variant?.managesStock), currentStock: variant?.currentStock || 0, stockKnown: variant?.stockKnown }; }) } as PosPromo;
      }).filter(Boolean) as PosPromo[];
      return NextResponse.json({ ok: true, data, meta: { demo: true } });
    }
    const promos = await loadPromosForBusiness(session);
    return NextResponse.json({ ok: true, data: promos });
  } catch (error) {
    return response("NOTION_ERROR", error instanceof Error ? error.message : "No se pudieron cargar las promos para POS.", 502);
  }
}

async function loadPromosForBusiness(session: PermissionSession) {
  const { queryDataSource } = await import("@/lib/notion/client");
  const { getEnv } = await import("@/lib/env");
  const promosId = getEnv("PROMOS_DATA_SOURCE_ID");
  if (!promosId) throw new Error("Falta configurar PROMOS_DATA_SOURCE_ID.");
  const { mapPromo } = await import("@/lib/notion/promo-mappers");
  const { isActiveNotionPage } = await import("@/lib/notion/product-mappers");
  const result = await queryDataSource(promosId, { page_size: 100 });
  const promos = (result.results || []).filter(isActiveNotionPage).map(mapPromo);
  const output: PosPromo[] = [];
  for (const promo of promos) {
    const context = await loadPromoContext(promo.id);
    const rules = context.rules.filter((rule) => rule.active !== false);
    if (!rules.length || rules.some((rule) => rule.allowVariantChoice || !rule.fixedVariantId)) continue;
    const components = [];
    for (const rule of rules) {
      const page = await retrievePage(rule.fixedVariantId as string);
      const variant = mapSellableVariant(page);
      if (variant.active === false || (variant.businessId && !canAccessBusiness(session, variant.businessId))) continue;
      const price = resolvePromoUnitPrice("fixed", variant.salePrice, variant.promoPrice);
      components.push({ ruleId: rule.id, variantId: variant.id, variantName: variant.name, quantity: rule.requiredQuantity, unitPrice: price.value, replacementCost: variant.replacementCost, managesStock: variant.managesStock, currentStock: variant.currentStock, stockKnown: variant.stockKnown });
    }
    if (components.length === rules.length) output.push({ id: promo.id, name: promo.name, type: promo.type, displayPrice: promo.displayPrice, active: promo.active, components });
  }
  return output;
}

function response(code: string, message: string, status: number) { return NextResponse.json({ ok: false, error: { code, message } }, { status }); }
