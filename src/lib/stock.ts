export type NormalizedStockStatus = "ok" | "low" | "empty" | "not_managed" | "unknown";

export type StockStatusContext = {
  managesStock?: boolean | null;
  currentStock?: number | null;
  minimumStock?: number | null;
};

export function normalizeStockStatus(value: unknown, context: StockStatusContext = {}): NormalizedStockStatus {
  const managesStock = context.managesStock;
  const currentStock = typeof context.currentStock === "number" && Number.isFinite(context.currentStock) ? context.currentStock : undefined;
  const minimumStock = typeof context.minimumStock === "number" && Number.isFinite(context.minimumStock) ? context.minimumStock : undefined;

  if (managesStock === false) return "not_managed";
  if (managesStock === true && currentStock !== undefined) {
    if (currentStock <= 0) return "empty";
    if (minimumStock !== undefined && currentStock <= minimumStock) return "low";
    if (minimumStock !== undefined && currentStock > minimumStock) return "ok";
  }

  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "unknown";
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[✅⚠️❌➖]/gu, "").trim();
  if (normalized.includes("no maneja") || normalized.includes("sin control") || normalized.includes("not managed")) return "not_managed";
  if (normalized === "ok" || normalized.includes(" ok") || normalized.startsWith("ok ")) return "ok";
  if (normalized.includes("bajo")) return "low";
  if (normalized.includes("sin unidades") || normalized.includes("sin unidad")) return "empty";
  if (normalized.includes("sin stock")) {
    if (managesStock === true && currentStock !== undefined) return currentStock <= 0 ? "empty" : "unknown";
    return "unknown";
  }
  return "unknown";
}

export function stockStatusLabel(status: NormalizedStockStatus) {
  return { ok: "OK", low: "Bajo stock", empty: "Sin unidades", not_managed: "Sin control de stock", unknown: "Estado desconocido" }[status];
}
