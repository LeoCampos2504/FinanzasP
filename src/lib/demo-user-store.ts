import { hashPinSync } from "@/lib/user-pin";
import type { UserInput, UserRecord } from "@/lib/notion/user-admin";

let users: UserRecord[] = [
  { id: "demo-user-admin", name: "Admin global", role: "Admin global", businessIds: [], active: true, order: 1, notes: "Usuario demo administrador global.", hasPin: true, requiresPinSetup: false, pinHash: hashPinSync("1234") },
  { id: "demo-user-business-admin", name: "Admin negocio", role: "Admin negocio", businessIds: ["demo-business-tigre"], active: true, order: 2, notes: "Admin del negocio El Tigre.", hasPin: false, requiresPinSetup: true, pinHash: "" },
  { id: "demo-user-vendedor", name: "Vendedor negocio", role: "Vendedor negocio", businessIds: ["demo-business-tigre"], active: true, order: 3, notes: "Vendedor demo sin PIN configurado.", hasPin: false, requiresPinSetup: true, pinHash: "" },
];

export function listDemoUsers(includeInactive = false) { return users.filter((user) => includeInactive || user.active !== false).map((user) => ({ ...user })); }
export function getDemoUser(id: string) { return users.find((user) => user.id === id); }
export function createDemoUser(input: UserInput) {
  const user: UserRecord = { id: `demo-user-${Date.now()}`, ...input, hasPin: false, requiresPinSetup: true, pinHash: "" };
  users = [...users, user];
  return { ...user };
}
export function updateDemoUser(id: string, input: Partial<UserInput>) {
  users = users.map((user) => user.id === id ? { ...user, ...input } : user);
  return getDemoUser(id);
}
export function setDemoUserPin(id: string, pinHash: string) { return updateDemoUserRecord(id, { pinHash, hasPin: true, requiresPinSetup: false, lastLogin: undefined }); }
export function resetDemoUserPin(id: string) { return updateDemoUserRecord(id, { pinHash: "", hasPin: false, requiresPinSetup: true }); }
export function touchDemoUser(id: string) { return updateDemoUserRecord(id, { lastLogin: new Date().toISOString() }); }
function updateDemoUserRecord(id: string, fields: Partial<UserRecord>) { users = users.map((user) => user.id === id ? { ...user, ...fields } : user); return getDemoUser(id); }
