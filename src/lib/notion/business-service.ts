import "server-only";
import { getEnv } from "@/lib/env";
import { queryDataSource } from "@/lib/notion/client";
import { getCheckbox, getFirstTitle } from "@/lib/notion/normalize";
import { demoBusinesses } from "@/lib/demo-data";
import { isGlobalAdmin, type PermissionSession } from "@/lib/permissions";
import type { Business } from "@/lib/types";

export async function listBusinesses(session: PermissionSession, demo = false): Promise<Business[]> {
  if (demo) return demoBusinesses.filter((business) => isGlobalAdmin(session) || !session.businessIds?.length || session.businessIds.includes(business.id));
  const dataSourceId = getEnv("NEGOCIOS_DATA_SOURCE_ID");
  if (!dataSourceId) return [];
  const result = await queryDataSource(dataSourceId, { page_size: 100 });
  const all: Business[] = (result.results || []).map(mapBusiness).filter((business: Business) => business.active !== false);
  return isGlobalAdmin(session) ? all : all.filter((business) => !session.businessIds?.length || session.businessIds.includes(business.id));
}

function mapBusiness(page: any): Business { return { id: page.id, name: getFirstTitle(page, ["Nombre", "Name"]), active: page.properties?.Activo?.checkbox === undefined ? true : getCheckbox(page, "Activo") }; }
