import type { Account, Category, Debtor, Movement } from "@/lib/types";

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
