"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AccessDenied } from "@/components/access-denied";
import { ars } from "@/lib/format";
import type { CashRegisterSummary } from "@/lib/types";

export default function CashRegisterPage() {
  const router = useRouter(); const [summary, setSummary] = useState<CashRegisterSummary | null>(null); const [loaded, setLoaded] = useState(false); const [demo, setDemo] = useState(false); const [error, setError] = useState(""); const [denied, setDenied] = useState(false);
  async function load() { const response = await fetch("/api/caja/actual"); const body = await response.json().catch(() => ({})); if (response.status === 401) return router.replace("/login"); if (response.status === 403) setDenied(true); else if (!body.ok) setError(body.error?.message || "No se pudo cargar la caja."); else { setSummary(body.data); setDemo(Boolean(body.meta?.demo)); setError(""); } setLoaded(true); }
  useEffect(() => { load(); }, []);
  if (denied) return <AccessDenied title="Caja" />;
  if (!loaded) return <AppShell title="Caja"><div className="skeleton" style={{ marginTop: 14 }} /><div className="skeleton" style={{ marginTop: 12 }} /></AppShell>;
  const caja = summary?.cashRegister;
  return <AppShell title="Caja" demo={demo} showFab={false}>
    {error && <div className="alert error">{error}</div>}
    {!caja ? <div className="card dashboard-card"><h2 style={{ marginTop: 0 }}>No hay una caja abierta</h2><p className="small muted">Abrí un turno para registrar ventas y calcular el arqueo.</p><button className="primary-btn" onClick={() => router.push("/caja/abrir")}>Abrir caja</button></div> : <>
      <div className="card dashboard-card"><div className="inline-row"><div><span className="small muted">Estado</span><h2 style={{ margin: "4px 0" }}>Caja abierta</h2></div><span className="status-pill ok">Abierta</span></div><p className="small muted">{caja.openedAt ? new Date(caja.openedAt).toLocaleString("es-AR") : ""} · turno de {caja.openedByUserId || "usuario actual"}</p><div className="summary-grid"><div className="summary-item"><span>Efectivo inicial</span><strong>{ars(caja.initialCash)}</strong></div><div className="summary-item"><span>Total ventas</span><strong>{ars(summary.totalSales)}</strong></div><div className="summary-item"><span>Esperado efectivo</span><strong>{ars(summary.expectedCash)}</strong></div></div></div>
      {summary.warnings.map((warning) => <div className="alert info" key={warning}>{warning}</div>)}
      <div className="admin-actions"><button className="primary-btn" onClick={() => router.push("/pos")}>Ir a POS</button><button className="secondary-btn" onClick={() => router.push(`/caja/${caja.id}/cerrar`)}>Cerrar caja</button></div>
      <div className="card dashboard-card"><h3 style={{ marginTop: 0 }}>Ventas por cuenta</h3>{summary.salesByAccount.length ? summary.salesByAccount.map((sale) => <div className="setting-row" key={sale.accountId || sale.accountName}><span className="setting-name">{sale.accountName}{sale.isCash ? " · efectivo" : " · no efectivo"}</span><strong>{ars(sale.total)}</strong></div>) : <p className="small muted">Todavía no hay ventas en este turno.</p>}</div>
    </>}
    <div className="admin-actions"><button className="secondary-btn" onClick={() => router.push("/cajas")}>Ver historial de cajas</button><button className="secondary-btn" onClick={() => router.push("/pos")}>Abrir POS</button></div>
  </AppShell>;
}
