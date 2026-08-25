import { demoAccounts } from "@/lib/demo-data";
import type { Account, AccountInput } from "@/lib/types";

let accounts: Account[] = demoAccounts.map((account) => ({ ...account }));

export function listDemoAccounts(includeInactive = false) {
  return accounts.filter((account) => includeInactive || account.active !== false);
}

export function getDemoAccount(id: string) {
  return accounts.find((account) => account.id === id);
}

export function createDemoAccount(input: AccountInput) {
  const initialBalance = input.initialBalance || 0;
  const account: Account = { id: `demo-account-${Date.now()}`, name: input.name, type: input.type || null, initialBalance, expectedBalance: initialBalance, balance: initialBalance, active: input.active !== false, isMainCash: input.isMainCash === true, order: input.order ?? null, notes: input.notes ?? null };
  accounts = [...accounts, account];
  return account;
}

export function updateDemoAccount(id: string, input: Partial<AccountInput>) {
  accounts = accounts.map((account) => {
    if (account.id !== id) return account;
    const next = { ...account, ...input };
    const balance = input.initialBalance !== undefined ? input.initialBalance || 0 : account.balance;
    return { ...next, type: next.type ?? null, notes: next.notes ?? null, initialBalance: input.initialBalance !== undefined ? input.initialBalance || 0 : account.initialBalance, expectedBalance: balance, balance };
  });
  return getDemoAccount(id);
}
