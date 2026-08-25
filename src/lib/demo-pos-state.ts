import "server-only";

import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { CashRegisterSession, PendingReplenishment } from "@/lib/types";

export type DemoPosSale = { movementId: string; cashRegisterId: string; accountId: string; total: number; date: string; userId?: string };
export type DemoPosState = { registers: CashRegisterSession[]; sales: DemoPosSale[]; variantOverrides: Record<string, Partial<{ currentStock: number; replacementCost: number }>>; replenishments: PendingReplenishment[] };

const stateFile = join(tmpdir(), "finanzas-el-tigre-demo-pos.json");
const initialState = (): DemoPosState => ({ registers: [], sales: [], variantOverrides: {}, replenishments: [{ id: "demo-replenishment-pending", movementId: "demo-replenishment-movement", variantId: "demo-variant-1", variantName: "Detergente clásico 1L", businessId: "demo-business-tigre", date: new Date().toISOString().slice(0, 10), quantity: 4, currentCost: 2500, costUsed: 2500, reportedCost: 2700, confirmationStatus: "Pendiente", notes: "Factura pendiente de revisar.", receivedByUserId: "demo-user-vendedor" }] });

export function readDemoPosState() { if (!existsSync(stateFile)) return initialState(); try { return JSON.parse(readFileSync(stateFile, "utf8")) as DemoPosState; } catch { return initialState(); } }
export function updateDemoPosState<T>(mutator: (state: DemoPosState) => T) { const state = readDemoPosState(); const result = mutator(state); const tempFile = `${stateFile}.${process.pid}.${Date.now()}.tmp`; writeFileSync(tempFile, JSON.stringify(state), "utf8"); renameSync(tempFile, stateFile); return result; }
