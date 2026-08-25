import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { getDemoUser, resetDemoUserPin } from "@/lib/demo-user-store";
import { getUserById, resetUserPin, toPublicUser } from "@/lib/notion/user-admin";
import { canManageUsers, canResetUserPin } from "@/lib/permissions";

export async function POST(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  let session; try { session = await requireAuth(); } catch { return forbidden("UNAUTHORIZED", "Sesión requerida.", 401); }
  if (!canManageUsers(session)) return forbidden("FORBIDDEN", "No tenés permiso para ver esta sección.", 403);
  const { userId } = await params;
  try {
    const target = isDemoMode() ? getDemoUser(userId) : await getUserById(userId);
    if (!target) return notFound();
    if (!canResetUserPin(session, target)) return forbidden("BUSINESS_FORBIDDEN", "Solo podés administrar usuarios de tu negocio.", 403);
    if (isDemoMode()) return NextResponse.json({ ok: true, data: toPublicUser(resetDemoUserPin(userId)!), meta: { demo: true, message: "PIN restaurado. Guardado simulado en modo demo." } });
    if (!getEnv("USUARIOS_DATA_SOURCE_ID")) return NextResponse.json({ ok: false, error: { code: "CONFIG_MISSING", message: "Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global." } }, { status: 503 });
    return NextResponse.json({ ok: true, data: toPublicUser(await resetUserPin(userId)), meta: { message: "PIN restaurado. La próxima vez el usuario deberá crear uno nuevo." } });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "PIN_RESET_ERROR", message: error instanceof Error ? error.message : "No se pudo restaurar el PIN." } }, { status: 400 }); }
}
function notFound() { return NextResponse.json({ ok: false, error: { code: "USER_NOT_FOUND", message: "No se encontró el usuario." } }, { status: 404 }); }
function forbidden(code: string, message: string, status: number) { return NextResponse.json({ ok: false, error: { code, message } }, { status }); }
