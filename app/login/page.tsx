"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "Admin global" | "Admin negocio" | "Vendedor negocio";
type LoginUser = { id: string; name: string; role: Role; hasPin: boolean; requiresPinSetup: boolean };
type Business = { id: string; name: string; users: LoginUser[] };
type LoginOptions = { mode: "users" | "legacy" | "demo"; globalAdmins: LoginUser[]; businesses: Business[] };

export default function LoginPage() {
  const router = useRouter();
  const [options, setOptions] = useState<LoginOptions>({ mode: "legacy", globalAdmins: [], businesses: [] });
  const [scope, setScope] = useState<"" | "global" | "business">("");
  const [businessId, setBusinessId] = useState("");
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => { fetch("/api/auth/login-options").then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok || !body.ok) throw new Error(body.error?.message || "No se pudieron cargar las opciones de acceso."); setOptions(body.data as LoginOptions); setLoadingOptions(false); }).catch((reason) => { setError(reason instanceof Error ? reason.message : "No se pudieron cargar las opciones de acceso."); setLoadingOptions(false); }); }, []);
  const selectedBusiness = useMemo(() => options.businesses.find((business) => business.id === businessId), [businessId, options.businesses]);
  const selectableUsers = scope === "global" ? options.globalAdmins : selectedBusiness?.users || [];
  const selectedUser = selectableUsers.find((user) => user.id === userId);
  function changeScope(value: "global" | "business") { setScope(value); setBusinessId(""); setUserId(""); setError(""); if (value === "global" && options.globalAdmins.length === 1) setUserId(options.globalAdmins[0].id); if (value === "business" && options.businesses.length === 1) selectBusiness(options.businesses[0].id); }
  function selectBusiness(value: string) { setBusinessId(value); const users = options.businesses.find((business) => business.id === value)?.users || []; setUserId(users.length === 1 ? users[0].id : ""); }
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); const payload = { pin, ...(options.mode === "legacy" ? {} : { userId, loginScope: scope, ...(scope === "business" ? { businessId } : {}) }) }; const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); setLoading(false); if (!response.ok || !body.ok) return setError(body.error?.message || "No se pudo iniciar sesión."); router.replace("/"); }
  const demo = options.mode === "demo";
  return <main className="login-page"><section className="login-card"><div className="brand-mark">₲</div><h1>Finanzas El Tigre</h1><p>Tu resumen financiero, movimientos y cuentas en un solo lugar.</p>{loadingOptions ? <div className="skeleton" /> : <form onSubmit={submit}>{options.mode === "legacy" ? <div className="alert info">Modo PIN global.</div> : <><div className="form-field"><label htmlFor="login-scope">Ingresar como</label><select id="login-scope" value={scope} onChange={(event) => changeScope(event.target.value as "global" | "business")} required><option value="" disabled>Seleccioná una opción</option><option value="global">Admin global</option><option value="business">Negocio</option></select></div>{scope === "global" && <div className="form-field"><label htmlFor="login-user">Usuario Admin global</label><select id="login-user" value={userId} onChange={(event) => setUserId(event.target.value)} required><option value="" disabled>Seleccioná tu usuario</option>{options.globalAdmins.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div>}{scope === "business" && <><div className="form-field"><label htmlFor="login-business">Negocio</label><select id="login-business" value={businessId} onChange={(event) => selectBusiness(event.target.value)} required><option value="" disabled>Seleccioná tu negocio</option>{options.businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></div>{businessId && <div className="form-field"><label htmlFor="login-business-user">Usuario del negocio</label><select id="login-business-user" value={userId} onChange={(event) => setUserId(event.target.value)} required><option value="" disabled>Seleccioná tu usuario</option>{selectedBusiness?.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></div>}</>}{selectedUser && !selectedUser.hasPin && <p className="small muted">Este usuario todavía no tiene PIN. El PIN que ingreses ahora quedará guardado.</p>}</>}{<div className="form-field"><label htmlFor="pin">PIN de acceso</label><input id="pin" autoFocus inputMode="numeric" type="password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Ingresá tu PIN" maxLength={12} /></div>}{error && <div className="alert error">{error}</div>}<button className="primary-btn" disabled={loading || !pin || (options.mode !== "legacy" && (!scope || !userId || (scope === "business" && !businessId)))}>{loading ? "Entrando…" : "Entrar"}</button></form>}<p className="small" style={{ margin: "18px 0 0", textAlign: "center" }}>{demo ? <>Modo demo: Admin global usa <strong>1234</strong>. Los usuarios de negocio configuran su PIN en el primer ingreso.</> : options.mode === "users" ? "Cada usuario configura su PIN en el primer ingreso." : "El PIN global se configura en el servidor."}</p></section></main>;
}
