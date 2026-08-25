import { AccountForm } from "@/components/account-admin-forms";
import { PermissionGate } from "@/components/permission-gate";

export default function NewAccountPage() { return <PermissionGate permission="accounts" title="Nueva cuenta"><AccountForm /></PermissionGate>; }
