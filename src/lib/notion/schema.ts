import "server-only";
import { notionRequest } from "@/lib/notion/client";

export type NotionPropertySchema = {
  id?: string;
  type?: string;
  name?: string;
  [key: string]: unknown;
};

export type DataSourceSchema = {
  id: string;
  properties: Record<string, NotionPropertySchema>;
};

type PropertyDefinition = {
  candidates: readonly string[];
  value: unknown;
  required?: boolean;
  label?: string;
};

export class SchemaValidationError extends Error {
  code = "NOTION_SCHEMA_MISSING_PROPERTY";
  propertyCandidates: string[];
  dataSourceId: string;
  dataSourceLabel: string;

  constructor(dataSourceId: string, dataSourceLabel: string, candidates: readonly string[], label?: string) {
    const display = label || candidates.join(" / ");
    super(`Falta la propiedad obligatoria "${display}" en el data source ${dataSourceLabel}.`);
    this.name = "SchemaValidationError";
    this.propertyCandidates = [...candidates];
    this.dataSourceId = dataSourceId;
    this.dataSourceLabel = dataSourceLabel;
  }
}

const schemaCache = new Map<string, { schema: DataSourceSchema; expiresAt: number }>();
const schemaTtlMs = 60_000;

export async function getDataSourceSchema(dataSourceId: string, forceRefresh = false): Promise<DataSourceSchema> {
  if (!dataSourceId) throw new Error("DATA_SOURCE_ID_MISSING");
  const cached = schemaCache.get(dataSourceId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.schema;
  const body = await notionRequest(`/data_sources/${dataSourceId}`);
  const schema: DataSourceSchema = { id: dataSourceId, properties: body.properties || {} };
  schemaCache.set(dataSourceId, { schema, expiresAt: Date.now() + schemaTtlMs });
  return schema;
}

export function hasProperty(schema: DataSourceSchema, propertyName: string) {
  return Boolean(schema.properties[propertyName]);
}

export function pickPropertyName(schema: DataSourceSchema, candidates: readonly string[]) {
  return candidates.find((candidate) => hasProperty(schema, candidate));
}

export function pickSelectOption(schema: DataSourceSchema, candidates: readonly string[], preferred: readonly string[]) {
  const propertyName = pickPropertyName(schema, candidates);
  const options: Array<{ name?: string }> = propertyName ? ((schema.properties[propertyName].select as { options?: Array<{ name?: string }> } | undefined)?.options || []) : [];
  if (!options.length) return preferred[0] || "";
  return preferred.find((value) => options.some((option) => option.name === value)) || options[0]?.name || preferred[0] || "";
}

export function buildSchemaAwareProperties(
  schema: DataSourceSchema,
  dataSourceLabel: string,
  definitions: Record<string, PropertyDefinition>,
) {
  const properties: Record<string, unknown> = {};
  const warnings: string[] = [];
  for (const definition of Object.values(definitions)) {
    const propertyName = pickPropertyName(schema, definition.candidates);
    const valueIsEmpty = definition.value === undefined;
    if (!propertyName) {
      if (definition.required) throw new SchemaValidationError(schema.id, dataSourceLabel, definition.candidates, definition.label);
      if (!valueIsEmpty) warnings.push(`Se omitió ${definition.label || definition.candidates.join(" / ")} porque no existe en ${dataSourceLabel}.`);
      continue;
    }
    if (!valueIsEmpty) properties[propertyName] = definition.value;
  }
  return { properties, warnings };
}

export function schemaPropertyList(schema: DataSourceSchema) {
  return Object.entries(schema.properties).map(([name, definition]) => ({ name, type: definition.type || "desconocido" }));
}

export function formatNotionError(error: unknown, fallback: string, dataSourceLabel: string) {
  if (error instanceof SchemaValidationError) {
    return `${error.message} Revisá Config > Propiedades detectadas.`;
  }
  const message = error instanceof Error ? error.message : String(error || "");
  const unknownProperty = message.match(/(?:NOTION_)?validation_error:\s*([^:]+?)\s+is not a property that exists/i);
  if (unknownProperty) {
    return `Notion rechazó el guardado porque la propiedad "${unknownProperty[1].trim()}" no existe en la base ${dataSourceLabel}. Revisá Config > Propiedades detectadas.`;
  }
  if (message.startsWith("NOTION_")) return `Notion rechazó el guardado en ${dataSourceLabel}. Revisá Config > Propiedades detectadas o la conexión.`;
  return fallback;
}
