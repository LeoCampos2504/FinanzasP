"use client";
import { useMemo, useState } from "react";
import type { SellableVariant } from "@/lib/types";

export function ProductPicker({ variants, value, onChange }: { variants: SellableVariant[]; value: string; onChange: (value: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => { const q = search.toLowerCase(); return variants.filter((variant) => `${variant.name} ${variant.variant || ""} ${variant.presentation || ""}`.toLowerCase().includes(q)); }, [search, variants]);
  return <><div className="form-field"><label htmlFor="product-search">Buscar variante</label><input id="product-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, variante o presentación" /></div><div className="form-field"><label htmlFor="product-variant">Variante / ítem</label><select id="product-variant" required value={value} onChange={(e) => onChange(e.target.value)}><option value="">Seleccionar variante</option>{filtered.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · stock {variant.currentStock}</option>)}</select></div></>;
}
