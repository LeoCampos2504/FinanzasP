import { ProductBaseForm } from "@/components/product-admin-forms";
export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) { const { productId } = await params; return <ProductBaseForm productId={productId} />; }
