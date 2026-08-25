import "server-only";

import { getEnv } from "@/lib/env";
import { retrievePage } from "@/lib/notion/client";
import { mapAccount } from "@/lib/notion/account-admin";
import { canAccessBusiness, type PermissionSession } from "@/lib/permissions";

export class AccountOperationError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = "AccountOperationError"; this.code = code; }
}

export async function assertActiveAccount(accountId: string, businessId?: string, session?: PermissionSession) {
  const dataSourceId = getEnv("CUENTAS_DATA_SOURCE_ID");
  if (!dataSourceId) throw new AccountOperationError("CONFIG_MISSING", "Falta configurar CUENTAS_DATA_SOURCE_ID.");
  let page: any;
  try { page = await retrievePage(accountId); } catch { throw new AccountOperationError("ACCOUNT_NOT_FOUND", "No se encontró la cuenta seleccionada."); }
  const account = mapAccount(page);
  if (!account.name) throw new AccountOperationError("ACCOUNT_NOT_FOUND", "No se encontró la cuenta seleccionada.");
  if (account.active === false) throw new AccountOperationError("ACCOUNT_INACTIVE", "Esta cuenta está inactiva y no se puede usar en ventas, egresos, reposiciones ni cobros.");
  const targetBusinesses = (account.businessIds || []).filter(Boolean);
  const requestedBusiness = businessId || session?.activeBusinessId;
  if (targetBusinesses.length && requestedBusiness && !targetBusinesses.some((targetBusiness) => canAccessBusiness(session || { role: "Vendedor negocio", businessIds: [requestedBusiness], activeBusinessId: requestedBusiness }, targetBusiness))) {
    throw new AccountOperationError("BUSINESS_FORBIDDEN", "La cuenta seleccionada pertenece a otro negocio.");
  }
  return account;
}
