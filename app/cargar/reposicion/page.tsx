"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProductPicker } from "@/components/product-picker";
import { ars } from "@/lib/format";
import type { Account, SellableVariant } from "@/lib/types";
const today = () => new Date().toISOString().slice(0, 10);
export default function ReplenishmentPage() {
  const router = useRouter();
  const [variants, setVariants] = useState<SellableVariant[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({
    variantId: "",
    quantity: "1",
    accountId: "",
    date: today(),
    unitCost: "",
    origin: "",
    description: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const initial =
      new URLSearchParams(window.location.search).get("variant") || "";
    setForm((f) => ({ ...f, variantId: initial }));
    Promise.all([fetch("/api/variantes"), fetch("/api/cuentas")]).then(
      async ([v, a]) => {
        const vb = await v.json();
        const ab = await a.json();
        if (vb.ok) setVariants(vb.data);
        if (ab.ok) {
          setAccounts(ab.data);
          setForm((f) => ({
            ...f,
            accountId: f.accountId || ab.data[0]?.id || "",
          }));
        }
      },
    );
  }, []);
  const selected = variants.find((item) => item.id === form.variantId);
  const total = useMemo(
    () =>
      Math.round(
        Number(form.quantity || 0) *
          Number(form.unitCost || selected?.replacementCost || 0) *
          100,
      ) / 100,
    [form.quantity, form.unitCost, selected],
  );
  useEffect(() => {
    if (selected && !form.unitCost)
      setForm((f) => ({
        ...f,
        unitCost: selected.replacementCost
          ? String(selected.replacementCost)
          : "",
      }));
  }, [selected, form.unitCost]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const b = await fetch("/api/movimientos/reposicion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        quantity: Number(form.quantity),
        unitCost: Number(form.unitCost),
      }),
    }).then((r) => r.json());
    setSaving(false);
    if (!b.ok) {
      const partial = b.error?.details?.movementId
        ? ` Movimiento creado: ${b.error.details.movementId}.`
        : "";
      return setError(
        (b.error?.message || "No se pudo guardar la reposición.") + partial,
      );
    }
    setMessage(b.meta?.message || "Reposición guardada correctamente.");
    setTimeout(() => router.push("/productos"), 900);
  }
  return (
    <AppShell title="Reposición" showFab={false}>
      <form className="card form-card" onSubmit={submit}>
        <ProductPicker
          variants={variants}
          value={form.variantId}
          onChange={(variantId) => setForm({ ...form, variantId })}
        />
        {selected && (
          <div className="selected-product">
            <strong>{selected.name}</strong>
            <span>Stock actual: {selected.currentStock}</span>
            <span>Costo sugerido: {ars(selected.replacementCost)}</span>
          </div>
        )}
        <div className="form-field">
          <label htmlFor="replenishment-quantity">Cantidad comprada</label>
          <input
            id="replenishment-quantity"
            required
            min="1"
            step="1"
            type="number"
            inputMode="numeric"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label htmlFor="replenishment-cost">Costo unitario</label>
          <input
            id="replenishment-cost"
            required
            min="1"
            step="1"
            type="number"
            value={form.unitCost}
            onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label htmlFor="replenishment-account">Cuenta de salida</label>
          <select
            id="replenishment-account"
            required
            value={form.accountId}
            onChange={(e) => setForm({ ...form, accountId: e.target.value })}
          >
            <option value="">Seleccionar cuenta</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          {!accounts.length && (
            <p className="small muted">
              Tu negocio no tiene cuentas activas para recibir el dinero. Pedile al
              Admin negocio que cree o active una cuenta.
            </p>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="replenishment-origin">Origen del dinero</label>
          <select
            id="replenishment-origin"
            required
            value={form.origin}
            onChange={(e) => setForm({ ...form, origin: e.target.value })}
          >
            <option value="">Seleccionar origen</option>
            <option>Fondo reposición</option>
            <option>Ganancias</option>
            <option>Inversión / capital</option>
            <option>No aplica</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="replenishment-date">Fecha</label>
          <input
            id="replenishment-date"
            required
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label htmlFor="replenishment-description">
            Descripción <span className="muted">(opcional)</span>
          </label>
          <textarea
            id="replenishment-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="total-preview">
          <span>Total reposición</span>
          <strong>{ars(total)}</strong>
        </div>
        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}
        <button className="primary-btn" disabled={saving}>
          {saving ? "Guardando…" : "Guardar reposición"}
        </button>
      </form>
    </AppShell>
  );
}
