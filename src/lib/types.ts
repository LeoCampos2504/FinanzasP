export type Account = {
  id: string;
  name: string;
  businessIds?: string[];
  type?: string | null;
  initialBalance: number;
  expectedBalance?: number | null;
  active: boolean;
  isMainCash?: boolean;
  order?: number | null;
  notes?: string | null;
  /** Alias de compatibilidad para el dashboard existente. */
  balance: number;
};

export type AccountInput = {
  name: string;
  businessIds?: string[];
  type?: string | null;
  initialBalance?: number;
  isMainCash?: boolean;
  active?: boolean;
  order?: number | null;
  notes?: string | null;
};

export type Business = { id: string; name: string; active?: boolean };

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
  businessId?: string;
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
  replacementCostSnapshot?: number | null;
  confirmationStatus?: string;
};

export type ProductSaleInput = {
  variantId: string;
  quantity: number;
  accountId: string;
  date: string;
  description?: string;
  unitPriceMode: "individual" | "manual";
  manualUnitPrice?: number | null;
  businessId?: string;
  cashRegisterId?: string;
  userId?: string;
  pos?: boolean;
  payment?: PaymentDetails;
};

export type PaymentDetails = {
  isCash?: boolean;
  received?: number | null;
  change?: number | null;
  method?: string;
};

export type CashRegisterStatus = "Abierta" | "Cerrada" | "Cancelada";

export type CashRegisterSession = {
  id: string;
  name: string;
  businessId?: string;
  status: CashRegisterStatus;
  openedAt: string;
  closedAt?: string;
  openedByUserId?: string;
  closedByUserId?: string;
  cashAccountId?: string;
  initialCash: number;
  expectedCash?: number | null;
  cashCounted?: number | null;
  difference?: number | null;
  totalSales?: number | null;
  notes?: string | null;
  warnings?: string[];
};

export type OpenCashRegisterInput = {
  accountId: string;
  initialCash: number;
  notes?: string;
};

export type CloseCashRegisterInput = {
  cashCounted: number;
  notes?: string;
};

export type CashRegisterSale = {
  movementId?: string;
  accountId?: string;
  accountName?: string;
  total: number;
  date: string;
};

export type CashRegisterSummary = {
  cashRegister: CashRegisterSession;
  totalSales: number;
  salesByAccount: Array<{ accountId?: string; accountName: string; total: number; isCash: boolean }>;
  cashSales: number;
  nonCashSales: number;
  expectedCash: number;
  cashCounted?: number | null;
  difference?: number | null;
  estimated: boolean;
  warnings: string[];
};

export type PosCartItem = {
  variantId: string;
  quantity: number;
  unitPrice?: number;
};

export type PosPromoComponent = {
  ruleId?: string;
  variantId: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  replacementCost: number;
  managesStock: boolean;
  currentStock: number;
  stockKnown?: boolean;
};

export type PosPromo = {
  id: string;
  name: string;
  type?: string;
  displayPrice: number;
  components: PosPromoComponent[];
  active?: boolean;
};

export type PosPromoCartItem = {
  promoId: string;
  quantity: number;
  unitPrice: number;
};

export type PosSaleInput = {
  items: PosCartItem[];
  promoItems?: PosPromoCartItem[];
  accountId: string;
  cashRegisterId: string;
  date: string;
  description?: string;
  businessId?: string;
  userId?: string;
  payment?: PaymentDetails;
  expectedTotal?: number;
};

export type ReplenishmentInput = {
  variantId: string;
  quantity: number;
  accountId: string;
  date: string;
  unitCost: number;
  origin: "Fondo reposición" | "Ganancias" | "Inversión / capital" | "No aplica";
  description?: string;
  businessId?: string;
  reportedCost?: number | null;
  confirmationStatus?: "No requiere" | "Pendiente" | "Confirmado" | "Rechazado";
  receivedByUserId?: string;
  confirmedByUserId?: string;
  updateMasterCost?: boolean;
  notes?: string;
};

export type PendingReplenishment = {
  id: string;
  movementId?: string;
  variantId: string;
  variantName: string;
  businessId?: string;
  date: string;
  quantity: number;
  currentCost: number;
  costUsed?: number | null;
  reportedCost?: number | null;
  confirmationStatus: "Pendiente" | "Confirmado" | "Rechazado" | "No requiere";
  notes?: string | null;
  receivedByUserId?: string;
  confirmedByUserId?: string;
  confirmedAt?: string;
  reversalMovementId?: string;
  warnings?: string[];
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
  businessId?: string;
  cashRegisterId?: string;
  userId?: string;
  quantity?: number;
  payment?: PaymentDetails;
};
