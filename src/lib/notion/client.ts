import "server-only";
import { getEnv } from "@/lib/env";

const notionBase = "https://api.notion.com/v1";

export async function notionRequest(path: string, options: RequestInit = {}) {
  const token = getEnv("NOTION_TOKEN");
  if (!token) throw new Error("NOTION_TOKEN_MISSING");
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("Notion-Version", getEnv("NOTION_VERSION") || "2025-09-03");
  const response = await fetch(`${notionBase}${path}`, { ...options, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parseNotionError(body, response.status));
  return body;
}

export async function queryDataSource(dataSourceId: string, body: Record<string, unknown> = {}) {
  return notionRequest(`/data_sources/${dataSourceId}/query`, { method: "POST", body: JSON.stringify(body) });
}

export async function createPage(dataSourceId: string, properties: Record<string, unknown>) {
  return notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: dataSourceId }, properties }),
  });
}

export async function updatePage(pageId: string, properties: Record<string, unknown>) {
  return notionRequest(`/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
}

export async function retrievePage(pageId: string) {
  return notionRequest(`/pages/${pageId}`);
}

export function parseNotionError(body: { message?: string; code?: string }, status?: number) {
  return `NOTION_${body.code || status || "ERROR"}: ${body.message || "No se pudo conectar con Notion"}`;
}
