import { VariantForm } from "@/components/product-admin-forms";
import { PermissionGate } from "@/components/permission-gate";
export default async function EditVariantPage({ params }: { params: Promise<{ variantId: string }> }) { const { variantId } = await params; return <PermissionGate permission="products" title="Editar variante"><VariantForm variantId={variantId} /></PermissionGate>; }
