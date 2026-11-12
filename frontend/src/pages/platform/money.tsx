import { Badge } from "../../components/ui";
import type { BillState } from "../../api/types";

/** Whole shillings with thousands separators. Money is always labelled with its currency next to it, never a symbol. */
export const tzs = (n: number | null | undefined) => Math.round(Number(n) || 0).toLocaleString("en-US");
/**
 * The rates an amount was actually worked out at: "35", "35 and 85", "30 to 85".
 * Each SMS keeps the price of the day it was sent, so never label an amount with today's rate.
 * Falls back to `today` only when nothing has been charged yet.
 */
export const rateLabel = (used: (number | string)[] | undefined, today?: number | string) => {
  const r = (used ?? []).map(Number).sort((a, b) => a - b);
  if (!r.length) return tzs(Number(today));
  if (r.length === 1) return tzs(r[0]);
  return r.length === 2 ? `${tzs(r[0])} and ${tzs(r[1])}` : `${tzs(r[0])} to ${tzs(r[r.length - 1])}`;
};
/** True when something on the bill was charged at a rate other than today's. */
export const rateChanged = (used: (number | string)[] | undefined, today: number | string) => (used ?? []).some((p) => Number(p) !== Number(today));
export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");
const short = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

/** Open, then Invoiced, then Paid. The client and owner see the same words. */
export function BillBadge({ bill }: { bill: BillState }) {
  if (bill.status === "paid") return <Badge tone="success" dot>Paid{bill.paid_at ? ` ${short(bill.paid_at)}` : ""}</Badge>;
  if (bill.status === "invoiced") return <Badge tone="warning" dot>Invoiced{bill.due_at ? `, due ${short(bill.due_at)}` : ""}</Badge>;
  return <Badge dot>Open</Badge>;
}
