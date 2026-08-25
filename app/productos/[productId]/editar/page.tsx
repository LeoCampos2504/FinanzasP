import { ProductBaseForm } from "@/components/product-admin-forms";
import { PermissionGate } from "@/components/permission-gate";
export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) { const { productId } = await params; return <PermissionGate permission="products" title="Editar producto"><ProductBaseForm productId={productId} /></PermissionGate>; }
