/** Platform / Earnings (Figma 174:16) and Platform / Event bill (174:328). */
import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { BillStatus, EarningsData, EventBillData } from "../../api/types";
import { Button, ErrorState, Pager, SkelPanel, SkelStats, Stat, Stagger, fmtDate, scrollToTable, usePaged, useToast } from "../../components/ui";
import { BillBadge, pct, rateLabel, tzs } from "./money";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Earnings() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["earnings", "now"], queryFn: () => api<EarningsData>("/api/platform/earnings/") });
  const pg = usePaged(q.data?.events ?? [], 25);
  const top = useRef<HTMLDivElement>(null);
  if (q.isError && !q.data) return <div className="panel"><ErrorState title="Earnings did not load" onRetry={() => q.refetch()} /></div>;
  const e = q.data;
  const max = e ? Math.max(1, ...e.profit_by_month.map((m) => m.profit)) : 1;
  const tot = e ? e.events.reduce((a, r) => ({ sms: a.sms + r.sms, cost: a.cost + r.cost, billed: a.billed + r.billed, profit: a.profit + r.profit }), { sms: 0, cost: 0, billed: 0, profit: 0 }) : null;
  return (
    <>
      <div className="p-head">
        <div><h1>Earnings</h1><p className="muted">What SMS cost you on Beem, what clients are billed, and what is still unpaid.{e ? ` ${MONTHS_LONG[e.month - 1]} ${e.year}.` : ""}</p></div>
        <div className="actions"><Link className="btn btn-secondary" to="/platform/rates">SMS rates</Link></div>
      </div>
      {!e ? <SkelStats n={5} /> : (
        <Stagger className="stats five">
          <Stat label="SMS sent" value={e.sms} delta="segments Beem charged" active />
          <Stat label="Beem cost, TZS" value={Math.round(e.cost)} delta={`at TZS ${rateLabel(e.costs_used, e.cost_per_sms)} per SMS`} />
          <Stat label="Billed, TZS" value={Math.round(e.billed)} delta={`at TZS ${rateLabel(e.prices_used, e.price_per_sms)} per SMS`} />
          <Stat label="Profit, TZS" value={Math.round(e.profit)} delta={`${pct(e.profit, e.billed)} of what you billed`} tone="success" />
          <Stat label="Unpaid, TZS" value={Math.round(e.unpaid)} delta={e.unpaid ? `${e.unpaid_open} open, ${e.unpaid_invoiced} invoiced` : "all settled"} tone={e.unpaid_invoiced ? "danger" : "neutral"} />
        </Stagger>
      )}
      {!e ? <SkelPanel h={180} /> : (
        <div className="panel panel-pad">
          <h3 style={{ marginBottom: 12 }}>Profit by month, TZS</h3>
          <div className="bars" role="img" aria-label="Profit for the last six months">
            {e.profit_by_month.map((m, i) => (
              <div key={`${m.year}-${m.month}`} className={`bar ${i === e.profit_by_month.length - 1 ? "now" : ""}`}>
                <b>{tzs(m.profit)}</b>
                <i style={{ height: `${Math.max(2, (m.profit / max) * 130)}px`, animationDelay: `${i * 40}ms` }} />
                <span>{MONTHS[m.month - 1]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {e && tot && (
        <div ref={top} className="panel" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Event</th><th className="money">SMS</th><th className="money">Beem cost</th><th className="money">Billed</th><th className="money">Profit</th><th>Bill</th></tr></thead>
            <tbody>
              {e.events.length === 0 && <tr><td colSpan={6} className="quiet" style={{ textAlign: "center", padding: 24 }}>No SMS charged this month yet.</td></tr>}
              {pg.slice.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => nav(`/platform/earnings/${r.id}`)}>
                  <td><b>{r.name}</b><div className="quiet" style={{ fontSize: 13 }}>{r.workspace}, {fmtDate(r.date)}</div></td>
                  <td className="money">{tzs(r.sms)}</td><td className="money">{tzs(r.cost)}</td><td className="money">{tzs(r.billed)}</td><td className="money">{tzs(r.profit)}</td>
                  <td><BillBadge bill={r.bill} /></td>
                </tr>
              ))}
              {e.events.length > 0 && <tr className="total"><td>Total, {e.events.length} event{e.events.length === 1 ? "" : "s"}</td><td className="money">{tzs(tot.sms)}</td><td className="money">{tzs(tot.cost)}</td><td className="money">{tzs(tot.billed)}</td><td className="money">{tzs(tot.profit)}</td><td /></tr>}
            </tbody>
          </table>
          <Pager page={pg.page} pages={pg.pages} count={pg.count} pageSize={pg.pageSize} noun="events" onPage={(p) => { pg.setPage(p); scrollToTable(top.current); }} />
        </div>
      )}
      <div className="note"><b>Money is in TZS. Each SMS keeps the rate it was sent at</b><p>Changing your rates in SMS rates only affects messages sent afterwards, so a bill never changes after the fact. Open an event to see its bill by kind of message and mark it invoiced or paid.</p></div>
    </>
  );
}

export function PlatformEventBill() {
  const { eventId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["platform-bill", eventId], queryFn: () => api<EventBillData>(`/api/platform/events/${eventId}/bill/`) });
  const mark = useMutation({
    mutationFn: (status: BillStatus) => api<EventBillData>(`/api/platform/events/${eventId}/bill/`, { method: "POST", body: { status } }),
    onSuccess: (d) => { qc.setQueryData(["platform-bill", eventId], d); qc.invalidateQueries({ queryKey: ["earnings"] }); toast(d.bill.status === "paid" ? "Marked paid" : d.bill.status === "invoiced" ? "Marked invoiced" : "Bill reopened"); },
    onError: (e) => toast((e as ApiError).summary ?? "Could not change the bill", true),
  });
  if (q.isError && !q.data) return <div className="panel"><ErrorState title="This bill did not load" onRetry={() => q.refetch()} /></div>;
  if (!q.data) return <div className="stack" aria-hidden style={{ gap: 20 }}><div className="skeleton" style={{ width: 300, height: 32 }} /><SkelStats n={5} /><SkelPanel h={200} /></div>;
  const b = q.data;
  const next: [BillStatus, string] | null = b.bill.status === "open" ? ["invoiced", "Mark invoiced"] : b.bill.status === "invoiced" ? ["paid", "Mark paid"] : null;
  return (
    <>
      <div className="crumbs" style={{ marginBottom: -8 }}><Link to="/platform/earnings">Earnings</Link><span>/</span><span>{b.event.name}</span></div>
      <div className="p-head">
        <div><h1>{b.event.name}</h1><p className="muted">{b.event.workspace}, {fmtDate(b.event.date)}. {b.bill.status === "open" ? "Bill open while the event runs." : b.bill.status === "invoiced" ? "Invoiced, waiting for payment." : "Paid."}</p></div>
        <div className="actions">
          {b.bill.status !== "open" && <Button variant="ghost" loading={mark.isPending && mark.variables === "open"} onClick={() => mark.mutate("open")}>Reopen</Button>}
          {next && <Button variant="primary" loading={mark.isPending && mark.variables === next[0]} onClick={() => mark.mutate(next[0])}>{next[1]}</Button>}
        </div>
      </div>
      <Stagger className="stats five">
        <Stat label="SMS sent" value={b.sms} delta={`from ${b.messages.toLocaleString("en-US")} messages`} active />
        <Stat label="Beem cost, TZS" value={Math.round(b.cost ?? 0)} delta={`at TZS ${rateLabel(b.costs_used, b.cost_per_sms)} per SMS`} />
        <Stat label="Billed, TZS" value={Math.round(b.amount)} delta={`at TZS ${rateLabel(b.prices_used, b.price_per_sms)} per SMS`} />
        <Stat label="Profit, TZS" value={Math.round(b.profit ?? 0)} delta={`${pct(b.profit ?? 0, b.amount)} of the bill`} tone="success" />
        <Stat label="Bill" value={<BillBadge bill={b.bill} />} delta={b.bill.status === "open" ? "invoice when the event closes" : b.bill.status === "invoiced" ? "mark paid when the money arrives" : "settled"} />
      </Stagger>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead><tr><th>Kind of message</th><th className="money">Messages</th><th className="money">SMS</th><th className="money">Beem cost</th><th className="money">Billed</th><th className="money">Profit</th></tr></thead>
          <tbody>
            {b.by_kind.length === 0 && <tr><td colSpan={6} className="quiet" style={{ textAlign: "center", padding: 24 }}>Nothing charged on this event yet.</td></tr>}
            {b.by_kind.map((k) => <tr key={k.kind}><td>{k.label}{k.kind === "welcome" ? "s at the door" : "s"}</td><td className="money">{tzs(k.messages)}</td><td className="money">{tzs(k.sms)}</td><td className="money">{tzs(k.cost)}</td><td className="money">{tzs(k.amount)}</td><td className="money">{tzs(k.profit)}</td></tr>)}
            {b.by_kind.length > 0 && <tr className="total"><td>Total</td><td className="money">{tzs(b.messages)}</td><td className="money">{tzs(b.sms)}</td><td className="money">{tzs(b.cost)}</td><td className="money">{tzs(b.amount)}</td><td className="money">{tzs(b.profit)}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="note"><b>Open, then Invoiced, then Paid</b><p>Mark it invoiced when you send the invoice, and paid when the money arrives. The client sees the same SMS counts and the amount owed, never your Beem cost or profit. Password resets are your cost and do not appear on the bill.</p></div>
    </>
  );
}
