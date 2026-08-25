import { AccountForm } from "@/components/account-admin-forms";
import { PermissionGate } from "@/components/permission-gate";

export default async function EditAccountPage({ params }: { params: Promise<{ accountId: string }> }) { const { accountId } = await params; return <PermissionGate permission="accounts" title="Editar cuenta"><AccountForm accountId={accountId} /></PermissionGate>; }
