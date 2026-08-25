import { getEnv } from "@/lib/env";
import { queryDataSource } from "@/lib/notion/client";
import { getCheckbox, getRelationId, getTitle } from "@/lib/notion/normalize";

export async function resolveBusinessId(preferredId = "") {
  if (preferredId) return preferredId;
  if (getEnv("DEFAULT_NEGOCIO_PAGE_ID")) return getEnv("DEFAULT_NEGOCIO_PAGE_ID");
  const dataSourceId = getEnv("NEGOCIOS_DATA_SOURCE_ID");
  if (!dataSourceId) return "";
  const result = await queryDataSource(dataSourceId, { page_size: 100 });
  const expected = (getEnv("DEFAULT_NEGOCIO_NAME") || "El Tigre Artículos de Limpieza").toLowerCase();
  const match = (result.results || []).find((page: any) => {
    const name = getTitle(page).toLowerCase();
    return name === expected && (page.properties?.Activo ? getCheckbox(page, "Activo") : true);
  }) || result.results?.find((page: any) => page.properties?.Activo ? getCheckbox(page, "Activo") : true);
  return match?.id || "";
}

export function normalizeRelationValue(id: string) { return id ? [{ id }] : []; }

export function relationIdOrEmpty(page: any, name: string) { return getRelationId(page, name); }
