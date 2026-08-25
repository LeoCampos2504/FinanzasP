import "server-only";
import { checkbox, number, relation, richText, select, title } from "@/lib/notion/properties";
import { buildSchemaAwareProperties, DataSourceSchema } from "@/lib/notion/schema";
import type { ProductBaseInput, VariantInput } from "@/lib/types";

export const productCandidates = { name: ["Nombre", "Name"], business: ["Negocio", "Negocios"], active: ["Activo", "Activa"], order: ["Orden", "Order"], notes: ["Notas", "Nota", "Descripción", "Descripcion"] } as const;
export const variantCandidates = { name: ["Nombre", "Name"], productBase: ["Producto base", "Producto", "Productos base"], business: ["Negocio", "Negocios"], variant: ["Variante", "Nombre variante"], presentation: ["Presentación", "Presentacion", "Formato"], salePrice: ["Precio venta individual", "Precio venta", "Precio"], promoPrice: ["Precio promo unitario", "Precio promo", "Precio promoción", "Precio promocion"], replacementCost: ["Costo reposición unitario", "Costo reposicion unitario", "Costo reposición", "Costo reposicion", "Costo"], managesStock: ["Maneja stock", "Controla stock"], initialStock: ["Stock inicial", "Stock"], minimumStock: ["Stock mínimo", "Stock minimo", "Mínimo", "Minimo"], active: ["Activo", "Activa"], order: ["Orden", "Order"], notes: ["Notas", "Nota", "Descripción", "Descripcion"] } as const;

export function normalizeProductInput(body: any): ProductBaseInput {
  return {
    name: String(body?.name || "").trim(),
    active: body?.active === undefined ? true : toBoolean(body.active, true),
    order: body?.order === null || body?.order === undefined || body?.order === "" ? null : Number(body.order),
    notes: body?.notes === null || body?.notes === undefined ? null : String(body.notes),
  };
}

export function validateProductInput(input: ProductBaseInput) {
  if (!input.name) return "El nombre del producto es requerido.";
  if (input.order !== null && input.order !== undefined && !Number.isFinite(input.order)) return "El orden debe ser un número válido.";
  return "";
}

export function normalizeVariantInput(body: any, productBaseId = ""): VariantInput {
  return {
    productBaseId: productBaseId || String(body?.productBaseId || ""),
    name: String(body?.name || "").trim(),
    variant: body?.variant === null || body?.variant === undefined ? null : String(body.variant),
    presentation: body?.presentation === null || body?.presentation === undefined ? null : String(body.presentation),
    salePrice: Number(body?.salePrice),
    promoPrice: body?.promoPrice === null || body?.promoPrice === undefined || body?.promoPrice === "" ? null : Number(body.promoPrice),
    replacementCost: Number(body?.replacementCost),
    managesStock: body?.managesStock === undefined ? true : toBoolean(body.managesStock, true),
    initialStock: body?.initialStock === null || body?.initialStock === undefined || body?.initialStock === "" ? 0 : Number(body.initialStock),
    minimumStock: body?.minimumStock === null || body?.minimumStock === undefined || body?.minimumStock === "" ? 0 : Number(body.minimumStock),
    active: body?.active === undefined ? true : toBoolean(body.active, true),
    order: body?.order === null || body?.order === undefined || body?.order === "" ? null : Number(body.order),
    notes: body?.notes === null || body?.notes === undefined ? null : String(body.notes),
  };
}

export function validateVariantInput(input: VariantInput) {
  if (!input.productBaseId) return "Elegí un producto base.";
  if (!input.name) return "El nombre de la variante es requerido.";
  if (!(input.salePrice >= 0)) return "Precio venta debe ser mayor o igual a 0.";
  if (!(input.replacementCost >= 0)) return "Costo de reposición debe ser mayor o igual a 0.";
  if (input.promoPrice !== null && input.promoPrice !== undefined && !(input.promoPrice >= 0)) return "Precio promo debe ser mayor o igual a 0.";
  if (input.managesStock && (!(input.initialStock !== null && input.initialStock !== undefined && input.initialStock >= 0) || !(input.minimumStock !== null && input.minimumStock !== undefined && input.minimumStock >= 0))) return "Stock inicial y mínimo deben ser mayores o iguales a 0.";
  if (input.order !== null && input.order !== undefined && (!(input.order >= 0) || !Number.isFinite(input.order))) return "El orden debe ser un número válido mayor o igual a 0.";
  return "";
}

function toBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value.toLowerCase() !== "false" && value !== "0";
  return Boolean(value);
}

function textValue(schema: DataSourceSchema, candidates: readonly string[], value: string) {
  const propertyName = candidates.find((candidate) => schema.properties[candidate]);
  const type = propertyName ? schema.properties[propertyName].type : "rich_text";
  return type === "select" ? select(value) : richText(value);
}

export function buildProductProperties(schema: DataSourceSchema, input: Partial<ProductBaseInput>, businessId: string, requiredName = true) {
  return buildSchemaAwareProperties(schema, "Productos base", {
    name: { candidates: productCandidates.name, value: input.name !== undefined ? title(input.name) : undefined, required: requiredName, label: "Nombre" },
    business: { candidates: productCandidates.business, value: businessId ? relation(businessId) : undefined, required: false },
    active: { candidates: productCandidates.active, value: input.active !== undefined ? checkbox(input.active) : undefined, required: false, label: "Activo" },
    order: { candidates: productCandidates.order, value: input.order !== undefined && input.order !== null ? number(input.order) : undefined, label: "Orden" },
    notes: { candidates: productCandidates.notes, value: input.notes !== undefined && input.notes !== null && input.notes !== "" ? textValue(schema, productCandidates.notes, input.notes) : undefined, label: "Notas" },
  });
}

export function buildVariantProperties(schema: DataSourceSchema, input: Partial<VariantInput>, businessId: string, required = true) {
  const managesStock = input.managesStock;
  return buildSchemaAwareProperties(schema, "Variantes / Ítems vendibles", {
    name: { candidates: variantCandidates.name, value: input.name !== undefined ? title(input.name) : undefined, required, label: "Nombre" },
    productBase: { candidates: variantCandidates.productBase, value: input.productBaseId ? relation(input.productBaseId) : undefined, required, label: "Producto base" },
    business: { candidates: variantCandidates.business, value: businessId ? relation(businessId) : undefined, required: false },
    variant: { candidates: variantCandidates.variant, value: input.variant !== undefined && input.variant !== null && input.variant !== "" ? textValue(schema, variantCandidates.variant, input.variant) : undefined, label: "Variante" },
    presentation: { candidates: variantCandidates.presentation, value: input.presentation !== undefined && input.presentation !== null && input.presentation !== "" ? textValue(schema, variantCandidates.presentation, input.presentation) : undefined, label: "Presentación" },
    salePrice: { candidates: variantCandidates.salePrice, value: input.salePrice !== undefined ? number(input.salePrice) : undefined, required, label: "Precio venta individual" },
    promoPrice: { candidates: variantCandidates.promoPrice, value: input.promoPrice !== undefined && input.promoPrice !== null ? number(input.promoPrice) : undefined, label: "Precio promo unitario" },
    replacementCost: { candidates: variantCandidates.replacementCost, value: input.replacementCost !== undefined ? number(input.replacementCost) : undefined, required, label: "Costo reposición unitario" },
    managesStock: { candidates: variantCandidates.managesStock, value: managesStock !== undefined ? checkbox(managesStock) : undefined, required, label: "Maneja stock" },
    initialStock: { candidates: variantCandidates.initialStock, value: input.initialStock !== undefined && input.initialStock !== null ? number(input.initialStock) : undefined, required: required && managesStock === true, label: "Stock inicial" },
    minimumStock: { candidates: variantCandidates.minimumStock, value: input.minimumStock !== undefined && input.minimumStock !== null ? number(input.minimumStock) : undefined, required: required && managesStock === true, label: "Stock mínimo" },
    active: { candidates: variantCandidates.active, value: input.active !== undefined ? checkbox(input.active) : undefined, label: "Activo" },
    order: { candidates: variantCandidates.order, value: input.order !== undefined && input.order !== null ? number(input.order) : undefined, label: "Orden" },
    notes: { candidates: variantCandidates.notes, value: input.notes !== undefined && input.notes !== null && input.notes !== "" ? textValue(schema, variantCandidates.notes, input.notes) : undefined, label: "Notas" },
  });
}
