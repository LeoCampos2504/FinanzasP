import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { demoAccounts, demoDebtors, demoMovements, demoVariants } from "@/lib/demo-data";
import { getEnv, isDemoMode } from "@/lib/env";
import { queryDataSource } from "@/lib/notion/client";
import { getFormulaNumber, getTitle } from "@/lib/notion/normalize";
import { mapAccount } from "@/lib/notion/account-admin";
import { mapMovement } from "@/lib/notion/mappers";
import { mapSellableVariant } from "@/lib/notion/product-mappers";
import type { Account, Movement } from "@/lib/types";

export async function GET() {
  try { await requireAuth(); } catch { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
  if (isDemoMode() || !getEnv("MOVIMIENTOS_DATA_SOURCE_ID")) return NextResponse.json({ ok: true, data: buildDashboard(demoAccounts, demoMovements, demoDebtors, demoVariants.filter((variant) => variant.stockStatus === "low" || variant.stockStatus === "empty")), meta: { demo: true } });
  try {
    const [accountsResult, movementsResult, debtorsResult, variantsResult] = await Promise.all([
      getEnv("CUENTAS_DATA_SOURCE_ID") ? queryDataSource(getEnv("CUENTAS_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] }),
      queryDataSource(getEnv("MOVIMIENTOS_DATA_SOURCE_ID"), { page_size: 100, sorts: [{ property: "Fecha", direction: "descending" }] }),
      getEnv("DEUDORES_DATA_SOURCE_ID") ? queryDataSource(getEnv("DEUDORES_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] }),
      getEnv("VARIANTES_DATA_SOURCE_ID") ? queryDataSource(getEnv("VARIANTES_DATA_SOURCE_ID"), { page_size: 100 }) : Promise.resolve({ results: [] }),
    ]);
    const accounts: Account[] = (accountsResult.results || []).map((page: any) => mapAccount(page)).filter((account: Account) => account.active !== false);
    const accountNames = new Map<string, string>(accounts.map((account): [string, string] => [account.id, account.name]));
    const debtorNames = new Map<string, string>((debtorsResult.results || []).map((p: any): [string, string] => [p.id, getTitle(p)]));
    const movements = (movementsResult.results || []).map((page: any) => mapMovement(page, { accounts: accountNames, debtors: debtorNames }));
    const debtors = (debtorsResult.results || []).map((p: any) => ({ id: p.id, name: getTitle(p), balance: getFormulaNumber(p, "Saldo pendiente"), status: "Pendiente" }));
    const lowStock = (variantsResult.results || []).map((page: any) => mapSellableVariant(page)).filter((variant: any) => variant.stockStatus === "low" || variant.stockStatus === "empty");
    return NextResponse.json({ ok: true, data: buildDashboard(accounts, movements, debtors, lowStock) });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "NOTION_ERROR", message: error instanceof Error ? error.message : "No se pudo cargar el dashboard." } }, { status: 502 }); }
}

function buildDashboard(accounts: Account[], movements: Movement[], debtors: any[], lowStock: any[] = []) {
  const today = new Date().toISOString().slice(0, 10);
  const todayMovements = movements.filter((m) => m.date === today);
  const ingresosHoy = todayMovements.filter((m) => m.type === "Ingreso").reduce((sum, m) => sum + m.amount, 0);
  const egresosHoy = todayMovements.filter((m) => m.type === "Egreso").reduce((sum, m) => sum + m.amount, 0);
  return { accounts, totals: { efectivo: accounts.find((a) => a.isMainCash)?.balance || 0, total: accounts.reduce((sum, a) => sum + a.balance, 0), ingresosHoy, egresosHoy, balanceHoy: ingresosHoy - egresosHoy }, latestMovements: movements.slice(0, 5), pendingDebtors: debtors.filter((d) => d.balance > 0).slice(0, 5), lowStock: lowStock.slice(0, 3), businessSummary: {} };
}
