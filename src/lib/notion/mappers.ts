import { getDate, getNumber, getRelationId, getRichText, getSelect, getTitle } from "@/lib/notion/normalize";
import type { Movement } from "@/lib/types";

export function mapMovement(page: any, lookup?: { accounts?: Map<string, string>; debtors?: Map<string, string>; categories?: Map<string, string> }): Movement {
  const accountId = getRelationId(page, "Cuenta");
  const debtorId = getRelationId(page, "Deudor");
  const categoryId = getRelationId(page, "Categoría");
  return {
    id: page.id,
    name: getTitle(page),
    date: getDate(page, "Fecha") || page.created_time?.slice(0, 10) || "",
    type: (getSelect(page, "Tipo") || "Ajuste") as Movement["type"],
    subtype: getSelect(page, "Subtipo") || "Otro",
    amount: getNumber(page, "Monto"),
    account: lookup?.accounts?.get(accountId) || accountId,
    category: lookup?.categories?.get(categoryId) || categoryId,
    debtor: lookup?.debtors?.get(debtorId) || debtorId,
    description: getRichText(page, "Descripción"),
    review: getSelect(page, "Revisión"),
    scope: getSelect(page, "Ámbito"),
  };
}

export function mapPageName(page: any) { return { id: page.id, name: getTitle(page) }; }
