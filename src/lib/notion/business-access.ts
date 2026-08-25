import "server-only";
import { retrievePage } from "@/lib/notion/client";
import { getRelationIds } from "@/lib/notion/normalize";
import { canAccessBusiness, isGlobalAdmin, getActiveBusinessId, type PermissionSession } from "@/lib/permissions";

export async function assertPageBusinessAccess(pageId: string, session: PermissionSession, candidates = ["Negocio", "Negocios"]) {
  if (isGlobalAdmin(session)) return;
  const page = await retrievePage(pageId);
  const ids = candidates.flatMap((name) => getRelationIds(page, name));
  const target = ids[0] || getActiveBusinessId(session);
  if (!target || !canAccessBusiness(session, target)) throw new Error("BUSINESS_FORBIDDEN");
}
