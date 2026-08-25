import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { listBusinesses } from "@/lib/notion/business-service";

export async function GET() { try { const session = await requireAuth(); const data = await listBusinesses(session, isDemoMode()); return NextResponse.json({ ok: true, data, meta: { demo: isDemoMode() } }); } catch (error) { return NextResponse.json({ ok: false, error: { code: "BUSINESS_LOAD_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar los negocios." } }, { status: 401 }); } }
