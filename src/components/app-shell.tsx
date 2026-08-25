"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

const nav = [{ href: "/", label: "Resumen", icon: "⌂" }, { href: "/movimientos", label: "Movimientos", icon: "↕" }, { href: "/cargar", label: "Cargar", icon: "+" }, { href: "/deudores", label: "Deudores", icon: "♙" }, { href: "/config", label: "Config", icon: "⚙" }];
export function AppShell({ title, children, demo = false, showFab = true }: { title: string; children: ReactNode; demo?: boolean; showFab?: boolean }) {
  const pathname = usePathname(); const router = useRouter();
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); }
  return <main className="app-frame mobile-width"><header className="top-header"><div className="inline-row"><div><div className="eyebrow">Finanzas El Tigre</div><h1>{title}</h1></div><button aria-label="Cerrar sesión" onClick={logout} style={{ background: "transparent", border: 0, color: "white", fontSize: 20 }}>↪</button></div></header>{demo && <div className="demo-banner">Modo demo: faltan variables de Notion</div>}<section className="page-body">{children}</section>{showFab && <button className="fab" aria-label="Cargar movimiento" onClick={() => router.push("/cargar")}>+</button>}<nav className="bottom-nav">{nav.map((item) => { const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href); return <Link href={item.href} className={`nav-item ${active ? "active" : ""}`} key={item.href}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></Link>; })}</nav></main>;
}
