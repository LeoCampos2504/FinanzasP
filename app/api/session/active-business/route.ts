import { NextResponse } from "next/server";
import { createSessionCookie, requireAuth } from "@/lib/auth";
import { canAccessBusiness, canSwitchBusiness } from "@/lib/permissions";

export async function POST(request: Request) {
  try {
    const session = await requireAuth(); const body = await request.json().catch(() => ({})); const businessId = String(body.businessId || "");
    if (!businessId) return response("VALIDATION", "Elegí un negocio.", 400);
    if (!canSwitchBusiness(session) && !canAccessBusiness(session, businessId)) return response("BUSINESS_FORBIDDEN", "No tenés acceso a este negocio.", 403);
    await createSessionCookie({ ...session, activeBusinessId: businessId });
    return NextResponse.json({ ok: true, data: { activeBusinessId: businessId } });
  } catch { return response("UNAUTHORIZED", "Sesión requerida.", 401); }
}
function response(code: string, message: string, status: number) { return NextResponse.json({ ok: false, error: { code, message } }, { status }); }
