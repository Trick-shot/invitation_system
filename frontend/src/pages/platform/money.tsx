import { Badge } from "../../components/ui";
import type { BillState } from "../../api/types";

/** Whole shillings with thousands separators. Money is always labelled with its currency next to it, never a symbol. */
export const tzs = (n: number | null | undefined) => Math.round(Number(n) || 0).toLocaleString("en-US");
export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");
const short = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

/** Open, then Invoiced, then Paid. The client and owner see the same words. */
export function BillBadge({ bill }: { bill: BillState }) {
  if (bill.status === "paid") return <Badge tone="success" dot>Paid{bill.paid_at ? ` ${short(bill.paid_at)}` : ""}</Badge>;
  if (bill.status === "invoiced") return <Badge tone="warning" dot>Invoiced{bill.due_at ? `, due ${short(bill.due_at)}` : ""}</Badge>;
  return <Badge dot>Open</Badge>;
}
