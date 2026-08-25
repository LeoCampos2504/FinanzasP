"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export function AccessDenied({ title = "Acceso denegado" }: { title?: string }) { const router = useRouter(); return <AppShell title={title} showFab={false}><div className="card dashboard-card"><div className="alert error">No tenés permiso para ver esta sección.</div><button className="secondary-btn" onClick={() => router.push("/")}>Volver al inicio</button></div></AppShell>; }
