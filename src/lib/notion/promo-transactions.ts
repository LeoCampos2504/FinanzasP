import "server-only";
import { createPage } from "@/lib/notion/client";
import { getEnv } from "@/lib/env";
import { resolveBusinessId } from "@/lib/notion/domain";
import { checkbox, date, number, relation, richText, select, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, getDataSourceSchema, pickPropertyName, pickSelectOption, SchemaValidationError } from "@/lib/notion/schema";
import { loadPromoContext, PromoOperationError, resolveManualPromoComponents, resolvePromoSale } from "@/lib/notion/promo-service";
import { calculatePromoTotal } from "@/lib/promo-calculations";
import type { PromoSaleInput, ResolvedPromoItem } from "@/lib/types";
import { AccountOperationError, assertActiveAccount } from "@/lib/notion/account-service";
import { detailApprovalCandidates } from "@/lib/notion/replenishment-approval";

export class PartialPromoCreationError extends PromoOperationError {
  constructor(message: string, details: Record<string, unknown>) { super("PARTIAL_PROMO_CREATION", message, details); }
}

export { PromoOperationError } from "@/lib/notion/promo-service";

const movementCandidates = ["Movimiento", "Movimientos", "Movimiento relacionado", "Movimientos relacionados"] as const;
const variantCandidates = ["Variante / Ítem", "Variante / Item", "Variante", "Ítem vendible", "Item vendible", "Producto vendido"] as const;

export async function createPromoSale(input: PromoSaleInput) {
  try { await assertActiveAccount(input.accountId, input.businessId); } catch (error) { if (error instanceof AccountOperationError) throw new PromoOperationError(error.code, error.message); throw error; }
  const movementId = getEnv("MOVIMIENTOS_DATA_SOURCE_ID");
  const detailId = getEnv("DETALLE_PRODUCTOS_DATA_SOURCE_ID");
  if (!movementId) throw new PromoOperationError("CONFIG_MISSING", "Falta configurar MOVIMIENTOS_DATA_SOURCE_ID.");
  if (!detailId) throw new PromoOperationError("CONFIG_MISSING", "Falta configurar DETALLE_PRODUCTOS_DATA_SOURCE_ID.");

  const context = input.promoId ? await loadPromoContext(input.promoId) : undefined;
  const ruleItems = context && context.rules.length ? (await resolvePromoSale(input, context)).items : [];
  const manualItems = await resolveManualPromoComponents(input.manualComponents);
  const items = [...ruleItems, ...manualItems];
  if (!items.length) throw new PromoOperationError(input.mode === "custom" ? "CUSTOM_COMPONENTS_REQUIRED" : "FIXED_COMPONENTS_REQUIRED", input.mode === "custom" ? "Agregá al menos un componente o resolvé una regla de la promo." : "La promo fija necesita reglas, componentes o un precio definido.");
  const total = calculatePromoTotal(input.mode, context?.promo, items, input.manualTotal);
  if (!(total > 0)) throw new PromoOperationError("VALIDATION", "La promo no tiene precio definido. Ingresá un total manual mayor a cero.");
  if (input.mode === "fixed" && !context?.promo && !(input.manualTotal && input.manualTotal > 0)) throw new PromoOperationError("VALIDATION", "La promo fija requiere una promo seleccionada.");

  const [movementSchema, detailSchema, businessId] = await Promise.all([getDataSourceSchema(movementId), getDataSourceSchema(detailId), resolveBusinessId(input.businessId)]);
  const requiredDetailProperties: Array<{ candidates: readonly string[]; label: string }> = [
    { candidates: ["Nombre"], label: "Nombre" }, { candidates: movementCandidates, label: "relación movimiento" }, { candidates: variantCandidates, label: "relación variante" },
    { candidates: ["Cantidad"], label: "Cantidad" }, { candidates: ["Modo de precio"], label: "Modo de precio" }, { candidates: ["Afecta stock"], label: "Afecta stock" }, { candidates: ["Sentido stock"], label: "Sentido stock" }, { candidates: ["Activo"], label: "Activo" },
  ];
  if (businessId) requiredDetailProperties.push({ candidates: ["Negocio"], label: "Negocio" });
  if (items.some((item) => item.unitPriceMode === "Manual")) requiredDetailProperties.push({ candidates: ["Precio unitario manual"], label: "Precio unitario manual" });
  for (const required of requiredDetailProperties) if (!pickPropertyName(detailSchema, required.candidates)) throw new SchemaValidationError(detailSchema.id, "Detalle de productos", required.candidates, required.label);

  const promoName = context?.promo.name || "Promo personalizada libre";
  const movementBuilt = buildSchemaAwareProperties(movementSchema, "Movimientos", {
    name: { candidates: ["Nombre"], value: title(`Venta promo - ${promoName}`), required: true }, date: { candidates: ["Fecha"], value: date(input.date), required: true }, scope: { candidates: ["Ámbito"], value: select("Negocio"), required: true }, business: { candidates: ["Negocio"], value: businessId ? relation(businessId) : undefined, required: Boolean(businessId), label: "Negocio" }, type: { candidates: ["Tipo"], value: select("Ingreso"), required: true }, subtype: { candidates: ["Subtipo"], value: select(input.mode === "fixed" ? "Venta promo fija" : "Venta promo personalizada"), required: true }, account: { candidates: ["Cuenta"], value: relation(input.accountId), required: true }, amount: { candidates: ["Monto"], value: number(total), required: true }, paymentStatus: { candidates: ["Estado de pago", "Estado"], value: select("Pagado"), required: true, label: "Estado de pago" }, moneyOrigin: { candidates: ["Origen del dinero"], value: select("No aplica"), required: true }, description: { candidates: ["Descripción", "Descripcion", "Notas", "Nota"], value: input.description ? richText(input.description) : undefined, label: "Descripción" }, active: { candidates: ["Activo"], value: checkbox(true), required: true }, accountEntry: { candidates: ["Entrada cuenta"], value: number(total), label: "Entrada cuenta" }, accountNet: { candidates: ["Movimiento neto cuenta"], value: number(total), label: "Movimiento neto cuenta" },
  });
  const movement = await createPage(movementId, movementBuilt.properties);
  const createdDetails: string[] = []; const failedDetails: Array<{ name: string; cause: string }> = []; const detailWarnings: string[] = [];
  for (const item of items) {
    try {
      const preferredMode = item.unitPriceMode === "Sin precio" ? ["Sin precio", "Promo", "Manual"] : item.unitPriceMode === "Manual" ? ["Manual", "Promo", "Sin precio"] : ["Promo", "Manual", "Sin precio"];
      const detailBuilt = buildSchemaAwareProperties(detailSchema, "Detalle de productos", {
        name: { candidates: ["Nombre"], value: title(`${item.variantName} · ${promoName} x${item.quantity}`), required: true }, movement: { candidates: movementCandidates, value: relation(String(movement.id)), required: true, label: "relación movimiento" }, business: { candidates: ["Negocio"], value: businessId ? relation(businessId) : undefined, required: Boolean(businessId), label: "Negocio" }, variant: { candidates: variantCandidates, value: relation(item.variantId), required: true, label: "relación variante" }, promo: { candidates: ["Promo", "Promos"], value: input.promoId ? relation(input.promoId) : undefined, label: "Promo" }, rule: { candidates: ["Regla de promo", "Reglas de promo", "Regla"], value: item.ruleId ? relation(item.ruleId) : undefined, label: "Regla de promo" }, quantity: { candidates: ["Cantidad"], value: number(item.quantity), required: true }, priceMode: { candidates: ["Modo de precio"], value: select(pickSelectOption(detailSchema, ["Modo de precio"], preferredMode)), required: true }, manualPrice: { candidates: ["Precio unitario manual"], value: item.manualUnitPrice ? number(item.manualUnitPrice) : undefined, required: item.unitPriceMode === "Manual", label: "Precio unitario manual" }, affectsStock: { candidates: ["Afecta stock"], value: checkbox(true), required: true }, stockDirection: { candidates: ["Sentido stock"], value: select("Salida"), required: true }, active: { candidates: ["Activo"], value: checkbox(true), required: true },
        costSnapshot: { candidates: detailApprovalCandidates.costUsed, value: number(item.replacementCost), label: "Costo reposición unitario usado" },
      });
      const detail = await createPage(detailId, detailBuilt.properties); createdDetails.push(String(detail.id)); detailWarnings.push(...detailBuilt.warnings);
    } catch (error) { if (error instanceof SchemaValidationError) throw error; failedDetails.push({ name: item.variantName, cause: error instanceof Error ? error.message : String(error) }); }
  }
  if (failedDetails.length) throw new PartialPromoCreationError("Movimiento creado, pero uno o más detalles de la promo fallaron. Revisar Notion.", { movementId: movement.id, movementUrl: movement.url, createdDetails, failedDetails });
  return { movementId: movement.id, movementUrl: movement.url, detailIds: createdDetails, total, warnings: [...movementBuilt.warnings, ...detailWarnings] };
}
