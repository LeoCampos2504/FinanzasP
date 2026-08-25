import { NextResponse } from "next/server";
import { formatNotionError } from "@/lib/notion/schema";

export function productAdminError(error: unknown, fallback: string, dataSourceLabel: string) {
  const code = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "NOTION_ERROR";
  const businessForbidden = error instanceof Error && error.message === "BUSINESS_FORBIDDEN";
  const finalCode = businessForbidden ? "BUSINESS_FORBIDDEN" : code;
  const status = businessForbidden ? 403 : code === "NOTION_SCHEMA_MISSING_PROPERTY" ? 422 : code === "CONFIG_MISSING" ? 503 : 502;
  return NextResponse.json({ ok: false, error: { code: finalCode, message: businessForbidden ? "No tenés acceso a este negocio." : formatNotionError(error, fallback, dataSourceLabel) } }, { status });
}
