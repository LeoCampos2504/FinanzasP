"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";

type Variable = { name: string; configured: boolean };
type SchemaStatus = {
  key: string;
  label: string;
  configured: boolean;
  queried: boolean;
  properties: { name: string; type: string }[];
  missingRequired: string[];
  missingOptional: string[];
  writeRequired?: string[];
  writeSupported?: boolean;
  error?: string;
};

export default function ConfigPage() {
  const router = useRouter();
  const [variables, setVariables] = useState<Variable[]>([]);
  const [schemas, setSchemas] = useState<SchemaStatus[]>([]);
  const [demo, setDemo] = useState(false);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/config/status").then(async (response) => {
      const body = await response.json();
      if (body.ok) { setVariables(body.data.variables); setSchemas(body.data.schemas || []); setDemo(body.data.demoMode); }
    });
  }, []);

  async function test() {
    setLoading(true); setResult("");
    const body = await fetch("/api/config/test-notion", { method: "POST" }).then((response) => response.json());
    setLoading(false); setResult(body.ok ? body.data.message : body.error?.message || "No se pudo probar la conexión.");
  }

  return <AppShell title="Configuración" demo={demo} showFab={false}>
    <div className="section-title"><h2>Estado de conexión</h2></div>
    <div className="card dashboard-card">
      <p className="small muted" style={{ marginTop: 0 }}>Las variables se muestran solo como estado; los secretos nunca se exponen.</p>
      {variables.map((item) => <div className="setting-row" key={item.name}><span className="setting-name">{item.name}</span><span className={`status-pill ${item.configured ? "ok" : "missing"}`}>{item.configured ? "Configurado" : "Falta"}</span></div>)}
      <button className="secondary-btn" style={{ marginTop: 16 }} onClick={test} disabled={loading}>{loading ? "Probando…" : "Probar conexión"}</button>
      {result && <div className="alert info">{result}</div>}
    </div>

    <div className="section-title"><h2>Propiedades detectadas</h2></div>
    {schemas.map((schema) => <div className="card dashboard-card" style={{ marginBottom: 12 }} key={schema.key}>
      <div className="inline-row"><h3 style={{ margin: 0, fontSize: 15 }}>{schema.label}</h3><span className={`status-pill ${schema.queried ? "ok" : "missing"}`}>{schema.queried ? "Consultado" : schema.configured ? "No consultado" : "Sin ID"}</span></div>
      {schema.error && <div className="alert error">{schema.error}</div>}
      {schema.queried && <>
        <p className="small muted" style={{ marginBottom: 8 }}>{schema.properties.length} propiedades detectadas</p>
        <div className="small" style={{ lineHeight: 1.7 }}>{schema.properties.map((property) => <span key={`${schema.key}-${property.name}`} className="badge" style={{ margin: "0 5px 5px 0", background: "#eef3fb", color: "#52617a" }}>{property.name} · {property.type}</span>)}</div>
        {schema.missingRequired.length > 0 && <div className="alert error"><strong>Faltan obligatorias:</strong> {schema.missingRequired.join(", ")}</div>}
        {schema.missingOptional.length > 0 && <div className="alert info"><strong>Opcionales no detectadas:</strong> {schema.missingOptional.join(", ")}. Se omiten al guardar.</div>}
        {schema.writeRequired && schema.writeRequired.length > 0 && <div className="alert error"><strong>Escritura no soportada:</strong> faltan {schema.writeRequired.join(", ")}.</div>}
        {schema.writeSupported && <div className="alert success">Propiedades necesarias para crear y editar detectadas.</div>}
      </>}
    </div>)}

    <div className="section-title"><h2>Administración</h2></div><div className="card dashboard-card"><p className="small muted" style={{ marginTop: 0 }}>Las cuentas y billeteras son creadas por vos. No hay billeteras reales predefinidas en la app.</p><button className="primary-btn" onClick={() => router.push("/cuentas")}>Administrar cuentas</button></div>

    <div className="section-title"><h2>PWA</h2></div><div className="card dashboard-card"><p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>Instalá esta app desde el menú del navegador para acceder rápidamente desde tu celular. Funciona como una app independiente.</p></div>
    <div className="section-title"><h2>Seguridad</h2></div><div className="card dashboard-card"><p className="small muted" style={{ margin: 0, lineHeight: 1.55 }}>El token de Notion se usa únicamente en el servidor. La sesión se protege con una cookie httpOnly firmada.</p></div>
  </AppShell>;
}
