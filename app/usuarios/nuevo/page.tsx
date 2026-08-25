import { UserForm } from "@/components/user-admin-forms";
import { PermissionGate } from "@/components/permission-gate";
export default function NewUserPage() { return <PermissionGate permission="users" title="Nuevo usuario"><UserForm /></PermissionGate>; }
