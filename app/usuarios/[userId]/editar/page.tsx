import { UserForm } from "@/components/user-admin-forms";
import { PermissionGate } from "@/components/permission-gate";
export default async function EditUserPage({ params }: { params: Promise<{ userId: string }> }) { const { userId } = await params; return <PermissionGate permission="users" title="Editar usuario"><UserForm userId={userId} /></PermissionGate>; }
