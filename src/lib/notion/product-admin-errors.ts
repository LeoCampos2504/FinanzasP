import { NextResponse } from "next/server";
import { formatNotionError } from "@/lib/notion/schema";

export function productAdminError(error: unknown, fallback: string, dataSourceLabel: string) {
  const code = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "NOTION_ERROR";
  const status = code === "NOTION_SCHEMA_MISSING_PROPERTY" ? 422 : code === "CONFIG_MISSING" ? 503 : 502;
  return NextResponse.json({ ok: false, error: { code, message: formatNotionError(error, fallback, dataSourceLabel) } }, { status });
}
