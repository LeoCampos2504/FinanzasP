export const roles = ["Admin global", "Admin negocio", "Vendedor negocio"] as const;
export type AppRole = (typeof roles)[number];
export type PermissionSession = { role: string; businessIds?: string[]; activeBusinessId?: string };
export type ManagedUser = { role: string; businessIds?: string[]; id?: string };

export function normalizeRole(role: unknown): AppRole {
  if (role === "Admin global" || role === "Admin negocio" || role === "Vendedor negocio") return role;
  if (role === "Admin") return "Admin global";
  return "Vendedor negocio";
}
export function isGlobalAdmin(session: PermissionSession | null | undefined) { return Boolean(session && normalizeRole(session.role) === "Admin global"); }
export function isBusinessAdmin(session: PermissionSession | null | undefined) { return Boolean(session && normalizeRole(session.role) === "Admin negocio"); }
export function isBusinessSeller(session: PermissionSession | null | undefined) { return Boolean(session && normalizeRole(session.role) === "Vendedor negocio"); }
export function canViewUsers(session: PermissionSession | null | undefined) { return isGlobalAdmin(session) || isBusinessAdmin(session); }
export function canManageUsers(session: PermissionSession | null | undefined) { return canViewUsers(session); }
export function canManageProducts(session: PermissionSession | null | undefined) { return isGlobalAdmin(session) || isBusinessAdmin(session); }
export function canManageAccounts(session: PermissionSession | null | undefined) { return isGlobalAdmin(session) || isBusinessAdmin(session); }
export function canViewAccountsAdmin(session: PermissionSession | null | undefined) { return isGlobalAdmin(session) || isBusinessAdmin(session); }
export function canUseAccountsForSales(session: PermissionSession | null | undefined) { return isGlobalAdmin(session) || isBusinessAdmin(session) || isBusinessSeller(session); }
export function canListActiveAccountsForOperations(session: PermissionSession | null | undefined) { return canUseAccountsForSales(session); }
export function canManageExpenses(session: PermissionSession | null | undefined) { return isGlobalAdmin(session) || isBusinessAdmin(session); }
export function canSell(session: PermissionSession | null | undefined) { return isGlobalAdmin(session) || isBusinessAdmin(session) || isBusinessSeller(session); }
export function canReceiveStock(session: PermissionSession | null | undefined) { return canManageProducts(session) || isBusinessSeller(session); }
export function canViewConfig(session: PermissionSession | null | undefined) { return isGlobalAdmin(session) || isBusinessAdmin(session); }
export function canSwitchBusiness(session: PermissionSession | null | undefined) { return isGlobalAdmin(session); }
export function getActiveBusinessId(session: PermissionSession | null | undefined) { return session?.activeBusinessId || session?.businessIds?.[0] || ""; }
export function canAccessBusiness(session: PermissionSession | null | undefined, businessId: string | undefined) {
  if (!session) return false;
  if (isGlobalAdmin(session)) return true;
  if (!businessId) return Boolean(getActiveBusinessId(session));
  if (!session.businessIds?.length) return businessId === session.activeBusinessId;
  return Boolean(session.businessIds.includes(businessId));
}
export function requireBusinessAccess(session: PermissionSession, businessId: string) { if (!canAccessBusiness(session, businessId)) throw new Error("BUSINESS_FORBIDDEN"); return businessId; }
export function roleLabel(role: unknown) { return normalizeRole(role); }

export function getAllowedAssignableRoles(session: PermissionSession | null | undefined): AppRole[] {
  if (isGlobalAdmin(session)) return [...roles];
  if (isBusinessAdmin(session)) return ["Admin negocio", "Vendedor negocio"];
  return [];
}

export function canSeeManagedUser(session: PermissionSession | null | undefined, target: ManagedUser | null | undefined) {
  if (!target || !canViewUsers(session)) return false;
  if (isGlobalAdmin(session)) return true;
  if (normalizeRole(target.role) === "Admin global") return false;
  const allowed = [...(session?.businessIds || []), getActiveBusinessId(session)].filter(Boolean);
  const targetBusinesses = target.businessIds || [];
  return targetBusinesses.some((id) => allowed.includes(id));
}

export function filterManagedUsers<T extends ManagedUser>(session: PermissionSession, users: T[]) {
  return isGlobalAdmin(session) ? users : users.filter((user) => canSeeManagedUser(session, user));
}

export function canCreateUserWithRole(session: PermissionSession | null | undefined, role: unknown) {
  return getAllowedAssignableRoles(session).includes(normalizeRole(role));
}

export function canEditUser(session: PermissionSession | null | undefined, target: ManagedUser | null | undefined, nextRole?: unknown) {
  if (!canSeeManagedUser(session, target)) return false;
  return isGlobalAdmin(session) || normalizeRole(nextRole === undefined ? target?.role : nextRole) !== "Admin global";
}

export function canResetUserPin(session: PermissionSession | null | undefined, target: ManagedUser | null | undefined) {
  return canSeeManagedUser(session, target);
}

export function canAssignBusinesses(session: PermissionSession | null | undefined, businessIds: string[] | undefined) {
  if (!canViewUsers(session)) return false;
  const ids = businessIds || [];
  if (isGlobalAdmin(session)) return true;
  const own = getActiveBusinessId(session);
  return Boolean(own && ids.length > 0 && ids.every((id) => id === own));
}
