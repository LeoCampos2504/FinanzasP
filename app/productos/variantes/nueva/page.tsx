import { VariantForm } from "@/components/product-admin-forms";
import { PermissionGate } from "@/components/permission-gate";
export default async function NewVariantPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) { const params = await searchParams; return <PermissionGate permission="products" title="Nueva variante"><VariantForm initialProductId={params.productId} /></PermissionGate>; }
