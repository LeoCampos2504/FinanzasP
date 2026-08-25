import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { createPage } from "@/lib/notion/client";
import { resolveBusinessId } from "@/lib/notion/domain";
import { formatNotionError, getDataSourceSchema } from "@/lib/notion/schema";
import { buildProductProperties, buildVariantProperties, normalizeProductInput, normalizeVariantInput, validateProductInput, validateVariantInput } from "@/lib/notion/product-admin";
import { productAdminError } from "@/lib/notion/product-admin-errors";
import { canManageProducts } from "@/lib/permissions";

type CreationVariant = { name?: string; [key: string]: unknown };

export async function POST(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  if (!canManageProducts(session)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const product = normalizeProductInput(body?.product || {});
  const mode = body?.mode === "multiple" ? "multiple" : body?.mode === "single" ? "single" : "";
  const rawVariants: CreationVariant[] = Array.isArray(body?.variants) ? body.variants : [];
  const productValidation = validateProductInput(product);
  if (productValidation) return validationError(productValidation);
  if (!mode) return validationError("Elegí si el producto es único o tiene múltiples variantes.");
  if (mode === "single" && rawVariants.length !== 1) return validationError("Un producto único debe tener exactamente una variante vendible.");
  if (mode === "multiple" && rawVariants.length < 1) return validationError("Agregá al menos una variante vendible.");
  const invalidVariant = rawVariants.map((rawVariant, index) => ({ index, validation: validateVariantInput(normalizeVariantInput(rawVariant, "pending-product")) })).find((item) => item.validation);
  if (invalidVariant) return validationError(`Variante ${invalidVariant.index + 1}: ${invalidVariant.validation}`);

  if (isDemoMode()) return demoCreation(product, mode, rawVariants);

  const productDataSourceId = getEnv("PRODUCTOS_DATA_SOURCE_ID");
  const variantsDataSourceId = getEnv("VARIANTES_DATA_SOURCE_ID");
  if (!productDataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar PRODUCTOS_DATA_SOURCE_ID." } }, { status: 503 });
  if (!variantsDataSourceId) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar VARIANTES_DATA_SOURCE_ID." } }, { status: 503 });

  try {
    const [productSchema, variantSchema] = await Promise.all([getDataSourceSchema(productDataSourceId), getDataSourceSchema(variantsDataSourceId)]);
    const businessId = await resolveBusinessId(session.activeBusinessId);
    const productBuilt = buildProductProperties(productSchema, product, businessId);
    const productPage = await createPage(productDataSourceId, productBuilt.properties);
    const createdVariants: Array<{ id: string; url?: string; name: string; warnings: string[] }> = [];
    const failedVariants: Array<{ index: number; name: string; message: string }> = [];

    for (const [index, rawVariant] of rawVariants.entries()) {
      const variant = normalizeVariantInput(rawVariant, productPage.id);
      const variantValidation = validateVariantInput(variant);
      if (variantValidation) {
        failedVariants.push({ index, name: variant.name || `Variante ${index + 1}`, message: variantValidation });
        continue;
      }
      try {
        const built = buildVariantProperties(variantSchema, variant, businessId);
        const variantPage = await createPage(variantsDataSourceId, built.properties);
        createdVariants.push({ id: variantPage.id, url: variantPage.url, name: variant.name, warnings: built.warnings });
      } catch (error) {
        failedVariants.push({ index, name: variant.name || `Variante ${index + 1}`, message: formatNotionError(error, "No se pudo crear esta variante.", "Variantes / Ítems vendibles") });
      }
    }

    const productData = { id: productPage.id, url: productPage.url, name: product.name, warnings: productBuilt.warnings };
    if (failedVariants.length) {
      return NextResponse.json({ ok: false, error: { code: "PARTIAL_PRODUCT_WITH_VARIANTS_CREATION", message: "Producto creado, pero fallaron algunas variantes. Revisá Notion o creá las variantes manualmente.", details: { productId: productPage.id, productUrl: productPage.url, createdVariants, failedVariants } } }, { status: 207 });
    }
    return NextResponse.json({ ok: true, data: { product: productData, variants: createdVariants }, meta: { message: "Producto y variantes creados." } });
  } catch (error) {
    return productAdminError(error, "No se pudo crear el producto y sus variantes.", "Productos base / Variantes / Ítems vendibles");
  }
}
function unauthorized() { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
function forbidden() { return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para administrar productos." } }, { status: 403 }); }

function validationError(message: string) {
  return NextResponse.json({ ok: false, error: { code: "VALIDATION", message } }, { status: 400 });
}

function demoCreation(product: ReturnType<typeof normalizeProductInput>, mode: string, rawVariants: CreationVariant[]) {
  const productId = `demo-product-${Date.now()}`;
  const variants = rawVariants.map((rawVariant, index) => {
    const variant = normalizeVariantInput(rawVariant, productId);
    return { id: `demo-variant-${Date.now()}-${index}`, ...variant, currentStock: variant.managesStock ? variant.initialStock || 0 : 0, stockStatus: variant.managesStock ? "ok" : "not_managed", stockStatusRaw: variant.managesStock ? "OK" : "No administra stock", stockKnown: variant.managesStock };
  });
  return NextResponse.json({ ok: true, data: { product: { id: productId, name: product.name, active: product.active, order: product.order || 0, notes: product.notes || "" }, variants }, meta: { demo: true, mode, message: "Producto y variantes creados de forma simulada en modo demo." } });
}
