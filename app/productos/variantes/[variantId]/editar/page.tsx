import { VariantForm } from "@/components/product-admin-forms";
export default async function EditVariantPage({ params }: { params: Promise<{ variantId: string }> }) { const { variantId } = await params; return <VariantForm variantId={variantId} />; }
