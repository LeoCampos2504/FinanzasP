"use client";

import { ReactNode, useEffect, useState } from "react";
import { AccessDenied } from "@/components/access-denied";
import { canManageAccounts, canManageProducts, canManageUsers, canViewConfig } from "@/lib/permissions";

export function PermissionGate({ permission, children, title }: { permission: "users" | "accounts" | "products" | "config"; children: ReactNode; title: string }) { const [allowed, setAllowed] = useState<boolean | null>(null); useEffect(() => { fetch("/api/auth/session").then((response) => response.json()).then((body) => { const session = body.data?.session; const result = permission === "users" ? canManageUsers(session) : permission === "accounts" ? canManageAccounts(session) : permission === "products" ? canManageProducts(session) : canViewConfig(session); setAllowed(Boolean(result)); }).catch(() => setAllowed(false)); }, [permission]); if (allowed === null) return <div className="skeleton" style={{ margin: 14 }} />; return allowed ? <>{children}</> : <AccessDenied title={title} />; }
