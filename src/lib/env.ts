import "server-only";

const names = [
  "NOTION_TOKEN", "NOTION_VERSION", "MOVIMIENTOS_DATA_SOURCE_ID", "DETALLE_PRODUCTOS_DATA_SOURCE_ID",
  "DEUDORES_DATA_SOURCE_ID", "CUENTAS_DATA_SOURCE_ID", "NEGOCIOS_DATA_SOURCE_ID",
  "CATEGORIAS_DATA_SOURCE_ID", "PRODUCTOS_DATA_SOURCE_ID", "VARIANTES_DATA_SOURCE_ID",
  "PROMOS_DATA_SOURCE_ID", "REGLAS_PROMO_DATA_SOURCE_ID", "DEFAULT_NEGOCIO_PAGE_ID",
  "DEFAULT_NEGOCIO_NAME", "APP_PIN", "APP_SECRET",
] as const;

export type EnvName = (typeof names)[number];

export function getEnv(name: EnvName): string {
  return process.env[name] || "";
}

export function hasNotionConfig() {
  return Boolean(getEnv("NOTION_TOKEN") && getEnv("MOVIMIENTOS_DATA_SOURCE_ID"));
}

export function isDemoMode() {
  return !hasNotionConfig();
}

export function envStatus() {
  return Object.fromEntries(names.map((name) => [name, Boolean(getEnv(name))]));
}

export function notionDataSource(name: EnvName) {
  return getEnv(name);
}

export const envNames = names;
