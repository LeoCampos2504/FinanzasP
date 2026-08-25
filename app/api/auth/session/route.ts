import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ ok: true, data: session ? { authenticated: true, session } : { authenticated: false, session: null } });
}
