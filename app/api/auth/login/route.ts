import { NextResponse } from "next/server";
import { createSessionCookie, validatePin } from "@/lib/auth";
import { getEnv, isDemoMode } from "@/lib/env";
import { getDemoUser, setDemoUserPin, touchDemoUser } from "@/lib/demo-user-store";
import { getUserById, setUserPin, updateLastLogin } from "@/lib/notion/user-admin";
import { hashPin, validateUserPin, verifyPin } from "@/lib/user-pin";
import { normalizeRole } from "@/lib/permissions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin || "");
  const userId = String(body.userId || "");
  const loginScope = body.loginScope === "global" || body.loginScope === "business" ? body.loginScope : undefined;
  const businessId = body.businessId ? String(body.businessId) : "";
  if (isDemoMode() && userId) {
    const user = getDemoUser(userId);
    if (!user) return error("USER_NOT_FOUND", "No se encontró el usuario seleccionado.", 404);
    const scopeError = validateLoginScope(user, loginScope, businessId, true); if (scopeError.code) return error(scopeError.code, scopeError.message || "No podés ingresar con ese ámbito.", scopeError.status || 400);
    return loginUser(user, pin, true, scopeError.activeBusinessId);
  }
  if (getEnv("USUARIOS_DATA_SOURCE_ID")) {
    if (!userId) return error("USER_REQUIRED", "Seleccioná un usuario.", 400);
    try { const user = await getUserById(userId); const scopeError = validateLoginScope(user, loginScope, businessId, false); if (scopeError.code) return error(scopeError.code, scopeError.message || "No podés ingresar con ese ámbito.", scopeError.status || 400); return loginUser(user, pin, false, scopeError.activeBusinessId); } catch (error) { return errorResponse(error, "No se pudieron cargar los usuarios."); }
  }
  if (!validatePin(pin)) return error("INVALID_PIN", "El PIN no es correcto.", 401);
  await createSessionCookie({ userName: "Admin", role: "Admin global", authMode: "legacy", activeBusinessId: getEnv("DEFAULT_NEGOCIO_PAGE_ID") || (isDemoMode() ? "demo-business-tigre" : undefined) });
  return NextResponse.json({ ok: true, data: { demoMode: isDemoMode(), authMode: "legacy" } });
}

async function loginUser(user: { id: string; name: string; role: string; active: boolean; hasPin: boolean; pinHash?: string; businessIds?: string[] }, pin: string, demo: boolean, scopedBusinessId?: string) {
  if (user.active === false) return error("USER_INACTIVE", "Usuario inactivo.", 403);
  const pinError = validateUserPin(pin);
  if (pinError) return error("INVALID_PIN_FORMAT", pinError, 400);
  const firstPinSet = !user.pinHash;
  if (firstPinSet) {
    const hashed = await hashPin(pin);
    if (demo) setDemoUserPin(user.id, hashed); else await setUserPin(user.id, hashed);
  } else if (!(await verifyPin(pin, user.pinHash || ""))) {
    return error("INVALID_PIN", "PIN incorrecto.", 401);
  }
  if (demo) touchDemoUser(user.id); else await updateLastLogin(user.id).catch(() => undefined);
  await createSessionCookie({ userId: user.id, userName: user.name, role: normalizeRole(user.role), authMode: demo ? "demo" : "users", businessIds: user.businessIds || [], activeBusinessId: scopedBusinessId || user.businessIds?.[0] || getEnv("DEFAULT_NEGOCIO_PAGE_ID") || (demo ? "demo-business-tigre" : undefined) });
  return NextResponse.json({ ok: true, data: { demoMode: demo, authMode: demo ? "demo" : "users", firstPinSet } });
}

function error(code: string, message: string, status: number) { return NextResponse.json({ ok: false, error: { code, message } }, { status }); }
function errorResponse(errorValue: unknown, fallback: string) { const code = errorValue && typeof errorValue === "object" && "code" in errorValue ? String((errorValue as { code: string }).code) : "USER_ERROR"; const message = errorValue instanceof Error ? errorValue.message : fallback; return error(code, message, code === "USER_NOT_FOUND" ? 404 : 503); }

function validateLoginScope(user: { role: string; businessIds?: string[] }, scope: "global" | "business" | undefined, businessId: string, demo: boolean): { activeBusinessId?: string; code?: string; message?: string; status?: number } {
  const role = normalizeRole(user.role);
  const fallback = getEnv("DEFAULT_NEGOCIO_PAGE_ID") || (demo ? "demo-business-tigre" : "");
  if (!scope) return { activeBusinessId: businessId || user.businessIds?.[0] || fallback };
  if (scope === "global" && role !== "Admin global") return { activeBusinessId: undefined, code: "LOGIN_SCOPE_FORBIDDEN", message: "Este usuario no es Admin global.", status: 403 };
  if (scope === "business" && role === "Admin global") return { activeBusinessId: undefined, code: "LOGIN_SCOPE_FORBIDDEN", message: "Admin global debe ingresar desde el ámbito global.", status: 403 };
  if (scope === "business" && !businessId) return { activeBusinessId: undefined, code: "BUSINESS_REQUIRED", message: "Seleccioná un negocio.", status: 400 };
  if (scope === "business") {
    const assigned = user.businessIds || [];
    if (assigned.length ? !assigned.includes(businessId) : businessId !== fallback) return { activeBusinessId: undefined, code: "BUSINESS_FORBIDDEN", message: "El usuario no pertenece al negocio seleccionado.", status: 403 };
  }
  return { activeBusinessId: businessId || user.businessIds?.[0] || fallback };
}
