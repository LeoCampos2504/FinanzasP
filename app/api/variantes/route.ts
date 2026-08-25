import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoProducts, demoVariants } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { queryDataSource } from "@/lib/notion/client";
import { isActiveNotionPage, mapProductBase, mapSellableVariant } from "@/lib/notion/product-mappers";
import type { SellableVariant } from "@/lib/types";

export async function GET(request: Request) {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  const params = new URL(request.url).searchParams;
  const search = (params.get("search") || "").trim().toLowerCase();
  const requestedStatus = params.get("stockStatus");
  const stockStatus = requestedStatus === "low" || requestedStatus === "empty" ? requestedStatus : params.get("lowStock") === "true" ? "low" : "all";
  const productBaseId = params.get("productBaseId") || "";
  if (isDemoMode()) return NextResponse.json({ ok: true, data: filterVariants(demoVariants, { search, stockStatus, productBaseId }), meta: { demo: true } });
  if (!getEnv("VARIANTES_DATA_SOURCE_ID")) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar VARIANTES_DATA_SOURCE_ID." } }, { status: 503 });
  try {
    const [variantResult, productResult] = await Promise.all([
      queryDataSource(getEnv("VARIANTES_DATA_SOURCE_ID"), { page_size: 100 }),
      getEnv("PRODUCTOS_DATA_SOURCE_ID") ? queryDataSource(getEnv("PRODUCTOS_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] }),
    ]);
    const productNames = new Map<string, string>((productResult.results || []).filter(isActiveNotionPage).map((page: any) => { const product = mapProductBase(page); return [product.id, product.name] as [string, string]; }));
    const variants = (variantResult.results || []).filter(isActiveNotionPage).map((page: any) => mapSellableVariant(page, productNames));
    return NextResponse.json({ ok: true, data: filterVariants(variants, { search, stockStatus, productBaseId }) });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar las variantes." } }, { status: 502 }); }
}

function filterVariants(variants: SellableVariant[], filters: { search: string; stockStatus: string; productBaseId: string }) {
  return variants.filter((variant) => {
    const haystack = `${variant.name} ${variant.variant || ""} ${variant.presentation || ""} ${variant.productBaseName || ""}`.toLowerCase();
    const matchesSearch = !filters.search || haystack.includes(filters.search);
    const matchesProduct = !filters.productBaseId || variant.productBaseId === filters.productBaseId;
    const matchesStock = filters.stockStatus === "all" || variant.stockStatus === filters.stockStatus;
    return matchesSearch && matchesProduct && matchesStock;
  });
}
