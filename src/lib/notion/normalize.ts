type NotionPage = { id?: string; properties?: Record<string, any> };

function property(page: NotionPage, name: string) {
  return page.properties?.[name];
}

export function getTitle(page: NotionPage, name = "Nombre") {
  const p = property(page, name);
  return p?.title?.map((x: any) => x.plain_text || x.text?.content || "").join("") || p?.rich_text?.[0]?.plain_text || "";
}
export function getNumber(page: NotionPage, name: string) { return Number(property(page, name)?.number ?? 0); }
export function getSelect(page: NotionPage, name: string) { return property(page, name)?.select?.name || ""; }
export function getDate(page: NotionPage, name: string) { return property(page, name)?.date?.start || ""; }
export function getRichText(page: NotionPage, name: string) { return property(page, name)?.rich_text?.map((x: any) => x.plain_text || "").join("") || ""; }
export function getCheckbox(page: NotionPage, name: string) { return Boolean(property(page, name)?.checkbox); }
export function getFormulaNumber(page: NotionPage, name: string) { return Number(property(page, name)?.formula?.number ?? 0); }
export function getFormulaString(page: NotionPage, name: string) { return property(page, name)?.formula?.string || ""; }
export function getRollupNumber(page: NotionPage, name: string) { return Number(property(page, name)?.rollup?.number ?? 0); }
export function getRelationIds(page: NotionPage, name: string) { return (property(page, name)?.relation || []).map((x: any) => x.id).filter(Boolean); }
export function getRelationId(page: NotionPage, name: string) { return getRelationIds(page, name)[0] || ""; }

export function getFirstNumber(page: NotionPage, names: readonly string[]) {
  for (const name of names) {
    const p = property(page, name);
    const value = p?.number ?? p?.formula?.number ?? p?.rollup?.number;
    if (value !== null && value !== undefined) return Number(value);
  }
  return 0;
}

export function hasNumberProperty(page: NotionPage, names: readonly string[]) {
  return names.some((name) => {
    const p = property(page, name);
    return p?.number !== undefined || p?.formula?.number !== undefined || p?.rollup?.number !== undefined;
  });
}

export function getFirstSelect(page: NotionPage, names: readonly string[]) {
  for (const name of names) {
    const selected = getSelect(page, name);
    if (selected) return selected;
    const formula = getFormulaString(page, name);
    if (formula) return formula;
  }
  return "";
}

export function getFirstCheckbox(page: NotionPage, names: readonly string[]) {
  for (const name of names) if (property(page, name)?.checkbox !== undefined) return getCheckbox(page, name);
  return false;
}
