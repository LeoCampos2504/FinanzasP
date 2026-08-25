import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

const cookieName = "finanzas_session";
const demoPin = "1234";
function secret() { return getEnv("APP_SECRET") || "finanzas-demo-secret"; }
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("hex"); }
export function validatePin(pin: string) { return pin === (getEnv("APP_PIN") || demoPin); }
export async function createSessionCookie() {
  const value = `authenticated.${sign("authenticated")}`;
  (await cookies()).set(cookieName, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14 });
}
export async function clearSessionCookie() { (await cookies()).delete(cookieName); }
export async function verifySessionCookie() {
  const value = (await cookies()).get(cookieName)?.value || "";
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  try { return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); } catch { return false; }
}
export async function requireAuth() {
  if (!(await verifySessionCookie())) throw new Error("UNAUTHORIZED");
}
