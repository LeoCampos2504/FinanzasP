import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { getDemoUser, listDemoUsers, updateDemoUser } from "@/lib/demo-user-store";
import { getUserById, listUsers, normalizeUserPatch, toPublicUser, updateUser, validateUserInput, validateUserRole, type UserInput, type UserRecord } from "@/lib/notion/user-admin";
import { getDataSourceSchema } from "@/lib/notion/schema";
import { canManageUsers, getActiveBusinessId, isGlobalAdmin, canEditUser, canAssignBusinesses, normalizeRole } from "@/lib/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  if (!canManageUsers(session)) return forbidden();
  const { userId } = await params;
  const input = normalizeUserPatch(await request.json().catch(() => ({})));
  const validation = validateUserInput(input, true); if (validation) return badRequest(validation);
  try {
    const target = isDemoMode() ? getDemoUser(userId) : await getUserById(userId);
    if (!target) return notFound();
    if (!canEditUser(session, target, input.role)) return forbiddenBusiness();
    if (input.businessIds !== undefined && !canAssignBusinesses(session, input.businessIds.length ? input.businessIds : [getActiveBusinessId(session)])) return forbiddenBusiness();
    const scoped = scopePatch(input, session); if (scoped.error) return badRequest(scoped.error, "BUSINESS_FORBIDDEN");
    await preventLastAdmin(userId, scoped.input);
    if (isDemoMode()) return NextResponse.json({ ok: true, data: toPublicUser(updateDemoUser(userId, scoped.input)!), meta: { demo: true, message: "Guardado simulado en modo demo." } });
    if (!getEnv("USUARIOS_DATA_SOURCE_ID")) return badRequest("Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global.", "CONFIG_MISSING");
    if (scoped.input.role !== undefined) {
      const schema = await getDataSourceSchema(getEnv("USUARIOS_DATA_SOURCE_ID"));
      const roleValidation = validateUserRole(schema, scoped.input.role);
      if (roleValidation) return badRequest(roleValidation);
    }
    return NextResponse.json({ ok: true, data: toPublicUser(await updateUser(userId, scoped.input)), meta: { message: "Usuario actualizado correctamente." } });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "USER_UPDATE_ERROR", message: error instanceof Error ? error.message : "No se pudo actualizar el usuario." } }, { status: 400 }); }
}

async function preventLastAdmin(userId: string, input: { active?: boolean; role?: string }) {
  if (input.active !== false && normalizeRole(input.role || "Admin global") !== "Admin global") return;
  const users: UserRecord[] = isDemoMode() ? listDemoUsers(true) : await listUsers({ includeInactive: true });
  const target = users.find((user) => user.id === userId);
  if (target && normalizeRole(target.role) === "Admin global" && target.active !== false && users.filter((user) => normalizeRole(user.role) === "Admin global" && user.active !== false && user.id !== userId).length === 0) throw new Error("No se puede dejar el sistema sin un admin global activo.");
}
function scopePatch(input: Partial<UserInput>, session: Awaited<ReturnType<typeof requireAuth>>) { if (isGlobalAdmin(session)) return { input }; const own = getActiveBusinessId(session); if (!own) return { input, error: "Tu usuario no tiene negocio asignado." }; if (input.businessIds?.some((id) => id !== own)) return { input, error: "Solo podés administrar usuarios de tu negocio." }; return { input: { ...input, businessIds: [own] } }; }
function unauthorized() { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
function forbidden() { return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "No tenés permiso para ver esta sección." } }, { status: 403 }); }
function forbiddenBusiness() { return NextResponse.json({ ok: false, error: { code: "BUSINESS_FORBIDDEN", message: "Solo podés administrar usuarios de tu negocio." } }, { status: 403 }); }
function badRequest(message: string, code = "VALIDATION_ERROR") { return NextResponse.json({ ok: false, error: { code, message } }, { status: 400 }); }
function notFound() { return NextResponse.json({ ok: false, error: { code: "USER_NOT_FOUND", message: "No se encontró el usuario." } }, { status: 404 }); }
