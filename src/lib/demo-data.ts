import type { Account, Category, Debtor, Movement, ProductBase, SellableVariant } from "@/lib/types";

export const demoAccounts: Account[] = [
  { id: "demo-cash", name: "Efectivo", balance: 186500, primary: true },
  { id: "demo-mp", name: "MP / Transferencia", balance: 324800 },
];
export const demoMovements: Movement[] = [
  { id: "demo-1", name: "Venta mostrador", date: new Date().toISOString().slice(0, 10), type: "Ingreso", subtype: "Venta simple", amount: 28500, account: "Efectivo", scope: "Negocio" },
  { id: "demo-2", name: "Cobro a Juan Pérez", date: new Date().toISOString().slice(0, 10), type: "Ingreso", subtype: "Cobro de deuda", amount: 12000, account: "MP / Transferencia", debtor: "Juan Pérez", scope: "Negocio" },
  { id: "demo-3", name: "Compra de insumos", date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), type: "Egreso", subtype: "Gasto", amount: 18900, account: "Efectivo", category: "Insumos", scope: "Negocio" },
  { id: "demo-4", name: "Retiro personal", date: new Date(Date.now() - 172800000).toISOString().slice(0, 10), type: "Egreso", subtype: "Retiro personal", amount: 30000, account: "MP / Transferencia", scope: "Personal" },
];
export const demoDebtors: Debtor[] = [
  { id: "demo-debtor-1", name: "Juan Pérez", balance: 46500, status: "Pendiente" },
  { id: "demo-debtor-2", name: "María González", balance: 18500, status: "Pendiente" },
];
export const demoCategories: Category[] = [
  { id: "demo-cat-1", name: "Insumos", type: "Egreso" },
  { id: "demo-cat-2", name: "Transporte", type: "Egreso" },
  { id: "demo-cat-3", name: "Servicios", type: "Egreso" },
];
export const demoProducts: ProductBase[] = [
  { id: "demo-product-1", name: "Detergente", active: true },
  { id: "demo-product-2", name: "Lavandina", active: true },
];
export const demoVariants: SellableVariant[] = [
  { id: "demo-variant-1", name: "Detergente clásico 1L", productBaseId: "demo-product-1", productBaseName: "Detergente", variant: "Clásico", presentation: "1 litro", salePrice: 4200, promoPrice: 0, replacementCost: 2500, managesStock: true, initialStock: 24, minimumStock: 8, currentStock: 5, stockStatus: "low", stockStatusRaw: "⚠️ Bajo stock", active: true, stockKnown: true },
  { id: "demo-variant-2", name: "Lavandina concentrada 2L", productBaseId: "demo-product-2", productBaseName: "Lavandina", variant: "Concentrada", presentation: "2 litros", salePrice: 3900, promoPrice: 0, replacementCost: 2100, managesStock: true, initialStock: 18, minimumStock: 5, currentStock: 0, stockStatus: "empty", stockStatusRaw: "❌ Sin unidades", active: true, stockKnown: true },
  { id: "demo-variant-3", name: "Esponja multiuso", productBaseId: "demo-product-1", productBaseName: "Detergente", variant: "Multiuso", presentation: "Unidad", salePrice: 1200, promoPrice: 0, replacementCost: 650, managesStock: false, initialStock: 0, minimumStock: 0, currentStock: 0, stockStatus: "not_managed", stockStatusRaw: "➖ Sin stock", active: true, stockKnown: false },
];
