import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { isGlobalAdmin, normalizeRole, type AppRole } from "@/lib/permissions";

const cookieName = "finanzas_session";
const demoPin = "1234";
export type AuthMode = "legacy" | "users" | "demo";
export type SessionData = { userId?: string; userName: string; role: AppRole; authMode: AuthMode; businessIds?: string[]; activeBusinessId?: string };
function secret() { return getEnv("APP_SECRET") || "finanzas-demo-secret"; }
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("hex"); }
export function validatePin(pin: string) { return pin === (getEnv("APP_PIN") || demoPin); }
function encode(payload: string) { return Buffer.from(payload, "utf8").toString("base64url"); }
function decode(payload: string) { return Buffer.from(payload, "base64url").toString("utf8"); }
export async function createSessionCookie(session: SessionData = { userName: "Admin", role: "Admin global", authMode: "legacy", activeBusinessId: getEnv("DEFAULT_NEGOCIO_PAGE_ID") || undefined }) {
  const payload = encode(JSON.stringify(session));
  const value = `${payload}.${sign(payload)}`;
  (await cookies()).set(cookieName, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14 });
}
export async function clearSessionCookie() { (await cookies()).delete(cookieName); }
export async function getSession(): Promise<SessionData | null> {
  const value = (await cookies()).get(cookieName)?.value || "";
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    if (payload === "authenticated") return { userName: "Admin", role: "Admin global", authMode: "legacy", activeBusinessId: getEnv("DEFAULT_NEGOCIO_PAGE_ID") || undefined };
    const parsed = JSON.parse(decode(payload)) as Partial<SessionData> & { role?: string };
    if ((parsed.authMode === "legacy" || parsed.authMode === "users" || parsed.authMode === "demo") && parsed.userName && parsed.role) return { ...parsed, role: normalizeRole(parsed.role) } as SessionData;
    return null;
  } catch { return null; }
}
export async function verifySessionCookie() { return Boolean(await getSession()); }
export async function requireAuth() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}
export async function requireAdmin() {
  const session = await requireAuth();
  if (!isGlobalAdmin(session)) throw new Error("FORBIDDEN");
  return session;
}
