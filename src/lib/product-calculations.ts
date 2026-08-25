export function calculateProductTotal(quantity: number, unitPrice: number) {
  return Math.round(quantity * unitPrice * 100) / 100;
}

export function validateStock(quantity: number, currentStock: number, stockKnown: boolean, managesStock: boolean) {
  if (!managesStock) return { ok: true as const };
  if (!stockKnown) return { ok: false as const, code: "STOCK_UNKNOWN", message: "No se pudo verificar el stock actual de esta variante." };
  if (quantity > currentStock) return { ok: false as const, code: "STOCK_INSUFFICIENT", message: `Stock insuficiente. Stock actual: ${currentStock}.` };
  return { ok: true as const };
}
