import { AccountForm } from "@/components/account-admin-forms";

export default async function EditAccountPage({ params }: { params: Promise<{ accountId: string }> }) { const { accountId } = await params; return <AccountForm accountId={accountId} />; }
