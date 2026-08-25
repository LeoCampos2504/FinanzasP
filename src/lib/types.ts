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
