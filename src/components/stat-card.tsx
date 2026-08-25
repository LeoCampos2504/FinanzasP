import { ars } from "@/lib/format";
export function StatCard({ label, value, tone = "" }: { label: string; value: number; tone?: string }) { return <div className="summary-item"><span>{label}</span><strong className={`money ${tone}`}>{ars(value)}</strong></div>; }
