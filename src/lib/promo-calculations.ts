import type { Promo, ResolvedPromoItem } from "@/lib/types";

export function promoModeFromType(type?: string): "fixed" | "custom" {
  const value = (type || "").toLowerCase();
  return value.includes("personal") || value.includes("custom") ? "custom" : "fixed";
}

export function calculatePromoTotal(mode: "fixed" | "custom", promo: Promo | undefined, items: ResolvedPromoItem[], manualTotal?: number | null) {
  if (mode === "custom" && Number(manualTotal) > 0) return Math.round(Number(manualTotal) * 100) / 100;
  if (mode === "fixed" && promo && promo.displayPrice > 0) return Math.round(promo.displayPrice * 100) / 100;
  return Math.round(items.reduce((total, item) => total + item.unitPrice * item.quantity, 0) * 100) / 100;
}

export function resolvePromoUnitPrice(mode: "fixed" | "custom", variantPrice: number, promoPrice: number) {
  const price = promoPrice > 0 ? promoPrice : variantPrice;
  return { value: price, detailMode: mode === "fixed" ? "Sin precio" as const : "Promo" as const };
}
