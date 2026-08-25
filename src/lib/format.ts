export const ars = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value || 0);
export const dateLabel = (value: string) => { if (!value) return "—"; const [y,m,d] = value.slice(0,10).split("-"); return `${d}/${m}/${y}`; };
