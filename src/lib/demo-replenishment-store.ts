import { demoVariants } from "@/lib/demo-data";
import type { PendingReplenishment, ReplenishmentInput } from "@/lib/types";

type DemoReplenishmentState = { replenishments: PendingReplenishment[]; variantOverrides: Record<string, Partial<{ currentStock: number; replacementCost: number }>> };
const globalState = globalThis as typeof globalThis & { __finanzasDemoReplenishmentState?: DemoReplenishmentState };
const state = globalState.__finanzasDemoReplenishmentState ||= { replenishments: [
  { id: "demo-replenishment-pending", movementId: "demo-replenishment-movement", variantId: "demo-variant-1", variantName: "Detergente clásico 1L", businessId: "demo-business-tigre", date: new Date().toISOString().slice(0, 10), quantity: 4, currentCost: 2500, costUsed: 2500, reportedCost: 2700, confirmationStatus: "Pendiente", notes: "Factura pendiente de revisar.", receivedByUserId: "demo-user-vendedor" },
], variantOverrides: {} };

export function listDemoPendingReplenishments() { return state.replenishments.filter((item) => item.confirmationStatus === "Pendiente").map((item) => ({ ...item })); }

export function listDemoVariants() { return demoVariants.map((variant) => ({ ...variant, ...state.variantOverrides[variant.id] })); }
export function getDemoVariant(id: string) { const variant = demoVariants.find((item) => item.id === id); return variant ? { ...variant, ...state.variantOverrides[id] } : undefined; }

export function createDemoReplenishment(input: ReplenishmentInput, userId?: string) {
  const variant = getDemoVariant(input.variantId);
  if (!variant) throw new Error("VARIANT_NOT_FOUND");
  state.variantOverrides[input.variantId] = { ...state.variantOverrides[input.variantId], currentStock: variant.currentStock + input.quantity };
  const item: PendingReplenishment = { id: `demo-replenishment-${Date.now()}`, movementId: `demo-replenishment-movement-${Date.now()}`, variantId: input.variantId, variantName: variant.name, businessId: input.businessId, date: input.date, quantity: input.quantity, currentCost: variant.replacementCost, costUsed: input.unitCost, reportedCost: input.reportedCost ?? null, confirmationStatus: input.confirmationStatus || "Pendiente", notes: input.notes || input.description || null, receivedByUserId: userId, warnings: [] };
  state.replenishments = [item, ...state.replenishments];
  return { ...item };
}

export function getDemoReplenishment(id: string) { return state.replenishments.find((item) => item.id === id); }

export function confirmDemoReplenishment(id: string, costUsed: number, updateMasterCost: boolean, userId?: string, notes?: string) {
  const item = getDemoReplenishment(id); if (!item) throw new Error("REPLENISHMENT_NOT_FOUND"); if (item.confirmationStatus !== "Pendiente") throw new Error("REPLENISHMENT_NOT_PENDING");
  item.costUsed = costUsed; item.confirmationStatus = "Confirmado"; item.confirmedByUserId = userId; item.confirmedAt = new Date().toISOString(); if (notes) item.notes = notes;
  if (updateMasterCost) { state.variantOverrides[item.variantId] = { ...state.variantOverrides[item.variantId], replacementCost: costUsed }; }
  return { ...item, updateMasterCost };
}

export function rejectDemoReplenishment(id: string, userId?: string, notes?: string) {
  const item = getDemoReplenishment(id); if (!item) throw new Error("REPLENISHMENT_NOT_FOUND"); if (item.confirmationStatus !== "Pendiente") throw new Error("REPLENISHMENT_NOT_PENDING");
  const variant = getDemoVariant(item.variantId); if (variant) state.variantOverrides[item.variantId] = { ...state.variantOverrides[item.variantId], currentStock: Math.max(0, variant.currentStock - item.quantity) };
  item.confirmationStatus = "Rechazado"; item.confirmedByUserId = userId; item.confirmedAt = new Date().toISOString(); item.reversalMovementId = `demo-reversal-${Date.now()}`; if (notes) item.notes = notes;
  return { ...item, reversalMovementId: item.reversalMovementId };
}
