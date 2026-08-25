import { NextResponse } from "next/server";
import { createSessionCookie, validatePin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!validatePin(String(body.pin || ""))) return NextResponse.json({ ok: false, error: { code: "INVALID_PIN", message: "El PIN no es correcto." } }, { status: 401 });
  await createSessionCookie();
  return NextResponse.json({ ok: true, data: { demoMode: isDemoMode() } });
}
