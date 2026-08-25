import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode, getEnv } from "@/lib/env";
import { createDemoUser, listDemoUsers } from "@/lib/demo-user-store";
import { createUser, listUsers, normalizeUserInput, toPublicUser, userSchemaForClient, validateUserInput, validateUserRole, type UserInput, type UserRecord } from "@/lib/notion/user-admin";
import { getDataSourceSchema } from "@/lib/notion/schema";
import { canManageUsers, canViewUsers, isGlobalAdmin, getActiveBusinessId, filterManagedUsers, canCreateUserWithRole, canAssignBusinesses } from "@/lib/permissions";

export async function GET(request: Request) {
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  if (!canViewUsers(session)) return forbidden();
  if (isDemoMode()) { const demoUsers = listDemoUsers(includeInactive); const visible = filterManagedUsers(session, demoUsers); return NextResponse.json({ ok: true, data: visible.map(toPublicUser), meta: { demo: true, configured: true, mode: "demo", schema: demoUserSchema() } }); }
  if (!getEnv("USUARIOS_DATA_SOURCE_ID")) return NextResponse.json({ ok: true, data: [], meta: { demo: false, configured: false, mode: "legacy", message: "Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global." } });
  try {
    const users = await listUsers({ includeInactive });
    const visible = filterManagedUsers(session, users as UserRecord[]);
    const schema = await getDataSourceSchema(getEnv("USUARIOS_DATA_SOURCE_ID"));
    return NextResponse.json({ ok: true, data: visible.map(toPublicUser), meta: { demo: false, configured: true, mode: "users", schema: userSchemaForClient(schema) } });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "USERS_LOAD_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar los usuarios." } }, { status: 503 }); }
}

export async function POST(request: Request) {
  let session; try { session = await requireAuth(); } catch { return unauthorized(); }
  if (!canManageUsers(session)) return forbidden();
  const input = normalizeUserInput(await request.json().catch(() => ({})));
  const validation = validateUserInput(input);
  if (validation) return badRequest(validation);
  if (!canCreateUserWithRole(session, input.role)) return forbidden("No podés crear usuarios con ese rol.", "ROLE_FORBIDDEN");
  if (!canAssignBusinesses(session, input.businessIds.length ? input.businessIds : [getActiveBusinessId(session)])) return forbidden("Solo podés asignar usuarios a tu negocio.", "BUSINESS_FORBIDDEN");
  const scoped = scopeUserInput(input, session);
  if (scoped.error) return badRequest(scoped.error, "BUSINESS_FORBIDDEN");
  if (isDemoMode()) return NextResponse.json({ ok: true, data: toPublicUser(createDemoUser(scoped.input)), meta: { demo: true, message: "Guardado simulado en modo demo." } });
  if (!getEnv("USUARIOS_DATA_SOURCE_ID")) return badRequest("Falta configurar USUARIOS_DATA_SOURCE_ID. Se usará PIN global.", "CONFIG_MISSING");
  try {
    const schema = await getDataSourceSchema(getEnv("USUARIOS_DATA_SOURCE_ID"));
    const roleValidation = validateUserRole(schema, scoped.input.role);
    if (roleValidation) return badRequest(roleValidation);
    const page = await createUser(scoped.input);
    return NextResponse.json({ ok: true, data: { id: page.id }, meta: { message: "Usuario creado. Configurará su PIN en el primer ingreso." } });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "USER_CREATE_ERROR", message: error instanceof Error ? error.message : "No se pudo crear el usuario." } }, { status: 400 }); }
}

function scopeUserInput(input: UserInput, session: Awaited<ReturnType<typeof requireAuth>>) { if (isGlobalAdmin(session)) return { input }; const own = getActiveBusinessId(session); if (!own) return { input, error: "Tu usuario no tiene negocio asignado." }; if (input.businessIds.length && input.businessIds.some((id) => id !== own)) return { input, error: "Solo podés administrar usuarios de tu negocio." }; return { input: { ...input, businessIds: [own] } }; }
function unauthorized() { return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Sesión requerida." } }, { status: 401 }); }
function forbidden(message = "No tenés permiso para ver esta sección.", code = "FORBIDDEN") { return NextResponse.json({ ok: false, error: { code, message } }, { status: 403 }); }
function badRequest(message: string, code = "VALIDATION_ERROR") { return NextResponse.json({ ok: false, error: { code, message } }, { status: 400 }); }
function demoUserSchema() { return { roleField: { name: "Rol", type: "select", options: ["Admin global", "Admin negocio", "Vendedor negocio"] }, activeProperty: "Activo", pendingPinProperty: "PIN pendiente", orderProperty: "Orden", notesProperty: "Notas", lastLoginProperty: "Último acceso", businessProperty: "Negocio" }; }
