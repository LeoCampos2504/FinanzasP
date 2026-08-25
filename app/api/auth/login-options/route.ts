import { NextResponse } from "next/server";
import { getEnv, isDemoMode } from "@/lib/env";
import { listDemoUsers } from "@/lib/demo-user-store";
import { listBusinesses } from "@/lib/notion/business-service";
import { listUsers, userDataSourceId, userSchemaForClient, type UserRecord } from "@/lib/notion/user-admin";
import { getDataSourceSchema } from "@/lib/notion/schema";
import { normalizeRole } from "@/lib/permissions";

export async function GET() {
  try {
    if (!isDemoMode() && !userDataSourceId()) return NextResponse.json({ ok: true, data: { mode: "legacy", globalAdmins: [], businesses: [] }, meta: { demo: false, warnings: ["Falta configurar USUARIOS_DATA_SOURCE_ID. Se usa PIN global."] } });
    const demo = isDemoMode();
    const users: UserRecord[] = demo ? listDemoUsers(false) : await listUsers();
    const globalAdmins = users.filter((user) => normalizeRole(user.role) === "Admin global").map(toLoginUser);
    const warnings: string[] = [];
    let businessRelation = true;
    if (!demo) {
      const schema = await getDataSourceSchema(userDataSourceId());
      businessRelation = Boolean(userSchemaForClient(schema).businessProperty);
      if (!businessRelation) warnings.push("Usuarios no tiene relación a Negocios. Se usa negocio por defecto.");
    }
    const businessSession = { role: "Admin global", businessIds: [] as string[] };
    let businesses = await listBusinesses(businessSession, demo);
    const fallbackId = getEnv("DEFAULT_NEGOCIO_PAGE_ID") || (demo ? "demo-business-tigre" : "");
    if (!businesses.length && fallbackId) businesses = [{ id: fallbackId, name: getEnv("DEFAULT_NEGOCIO_NAME") || (demo ? "El Tigre" : "Negocio por defecto"), active: true }];
    if (!businessRelation && fallbackId && !businesses.some((business) => business.id === fallbackId)) businesses = [{ id: fallbackId, name: getEnv("DEFAULT_NEGOCIO_NAME") || "Negocio por defecto", active: true }, ...businesses];
    const businessData = businesses.map((business) => ({ ...business, users: users.filter((user) => normalizeRole(user.role) !== "Admin global" && (!businessRelation || user.businessIds?.includes(business.id) || (!user.businessIds?.length && business.id === fallbackId))).map(toLoginUser) }));
    return NextResponse.json({ ok: true, data: { mode: demo ? "demo" : "users", globalAdmins, businesses: businessData }, meta: { demo, warnings } });
  } catch (error) { return NextResponse.json({ ok: false, error: { code: "LOGIN_OPTIONS_ERROR", message: error instanceof Error ? error.message : "No se pudieron cargar las opciones de acceso." } }, { status: 503 }); }
}

function toLoginUser(user: UserRecord) { return { id: user.id, name: user.name, role: normalizeRole(user.role), hasPin: user.hasPin, requiresPinSetup: user.requiresPinSetup }; }
