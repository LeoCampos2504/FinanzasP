import { VariantForm } from "@/components/product-admin-forms";
export default async function NewVariantPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) { const params = await searchParams; return <VariantForm initialProductId={params.productId} />; }
