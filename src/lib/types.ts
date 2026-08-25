export type Account = {
  id: string;
  name: string;
  balance: number;
  active?: boolean;
  primary?: boolean;
};

export type Movement = {
  id: string;
  name: string;
  date: string;
  type: "Ingreso" | "Egreso" | "Deuda" | "Ajuste";
  subtype: string;
  amount: number;
  account?: string;
  category?: string;
  debtor?: string;
  description?: string;
  review?: string;
  scope?: string;
};

export type Debtor = {
  id: string;
  name: string;
  balance: number;
  status: string;
  active?: boolean;
};

export type Category = { id: string; name: string; type?: string; active?: boolean };

import type { NormalizedStockStatus } from "@/lib/stock";
export type StockStatus = NormalizedStockStatus;

export type ProductBase = {
  id: string;
  name: string;
  businessId?: string;
  active?: boolean;
  order?: number;
  notes?: string;
};

export type ProductBaseInput = {
  name: string;
  active: boolean;
  order?: number | null;
  notes?: string | null;
};

export type SellableVariant = {
  id: string;
  name: string;
  productBaseId?: string;
  productBaseName?: string;
  variant?: string;
  presentation?: string;
  salePrice: number;
  promoPrice: number;
  replacementCost: number;
  managesStock: boolean;
  initialStock: number;
  minimumStock: number;
  currentStock: number;
  stockStatus: StockStatus;
  stockStatusRaw: string;
  active?: boolean;
  stockKnown?: boolean;
};

export type VariantInput = {
  productBaseId: string;
  name: string;
  variant?: string | null;
  presentation?: string | null;
  salePrice: number;
  promoPrice?: number | null;
  replacementCost: number;
  managesStock: boolean;
  initialStock?: number | null;
  minimumStock?: number | null;
  active: boolean;
  order?: number | null;
  notes?: string | null;
};

export type ProductDetail = {
  id?: string;
  name: string;
  movementId?: string;
  variantId: string;
  quantity: number;
  unitPriceMode: "Individual" | "Manual";
  manualUnitPrice?: number;
  affectsStock: boolean;
  stockDirection: "Entrada" | "Salida";
};

export type ProductSaleInput = {
  variantId: string;
  quantity: number;
  accountId: string;
  date: string;
  description?: string;
  unitPriceMode: "individual" | "manual";
  manualUnitPrice?: number | null;
};

export type ReplenishmentInput = {
  variantId: string;
  quantity: number;
  accountId: string;
  date: string;
  unitCost: number;
  origin: "Fondo reposición" | "Ganancias" | "Inversión / capital" | "No aplica";
  description?: string;
};

export type Promo = {
  id: string;
  name: string;
  type?: string;
  manualPrice: number;
  calculatedPrice: number;
  finalPrice: number;
  displayPrice: number;
  priceSource: "final" | "manual" | "calculated" | "components" | "none";
  active?: boolean;
  order?: number;
  notes?: string;
};

export type PromoRule = {
  id: string;
  name: string;
  promoId?: string;
  productBaseId?: string;
  productBaseName?: string;
  requiredQuantity: number;
  allowVariantChoice: boolean;
  fixedVariantId?: string;
  fixedVariantName?: string;
  active?: boolean;
  order?: number;
};

export type ResolvedPromoItem = {
  ruleId: string;
  ruleName: string;
  productBaseId?: string;
  variantId: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  unitPriceMode: "Promo" | "Sin precio" | "Manual";
  replacementCost: number;
  stockStatus: StockStatus;
  currentStock: number;
  managesStock: boolean;
  stockKnown?: boolean;
  manualUnitPrice?: number;
};

export type ManualPromoComponentInput = {
  variantId: string;
  quantity: number;
  unitPrice?: number | null;
  priceMode: "Promo" | "Manual";
};

export type PromoSaleInput = {
  promoId?: string;
  accountId: string;
  date: string;
  description?: string;
  mode: "fixed" | "custom";
  selectedVariantsByRuleId: Record<string, string>;
  manualComponents: ManualPromoComponentInput[];
  manualTotal?: number | null;
};
