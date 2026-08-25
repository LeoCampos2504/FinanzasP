import "server-only";
import { promisify } from "util";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { scrypt } from "crypto";

const scryptAsync = promisify(scrypt);
const minPinLength = 4;
const maxPinLength = 12;
const keyLength = 64;

export function validateUserPin(pin: unknown) {
  const value = String(pin ?? "");
  if (value.length < minPinLength) return "El PIN debe tener al menos 4 números.";
  if (value.length > maxPinLength) return "El PIN no puede tener más de 12 números.";
  if (!/^\d+$/.test(value)) return "El PIN solo puede contener números.";
  return "";
}

export async function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(pin, salt, keyLength)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export function hashPinSync(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(pin, salt, keyLength);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, storedHash: string) {
  const [algorithm, salt, expectedHex] = String(storedHash || "").split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || !/^[0-9a-f]+$/i.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const derived = (await scryptAsync(pin, salt, expected.length)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
