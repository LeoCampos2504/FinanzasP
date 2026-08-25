import { UnifiedProductForm } from "@/components/product-admin-forms";
import { PermissionGate } from "@/components/permission-gate";
export default function NewProductPage() { return <PermissionGate permission="products" title="Nuevo producto"><UnifiedProductForm /></PermissionGate>; }
