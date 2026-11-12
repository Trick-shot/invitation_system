/**
 * Admin / Billing (Figma 181:477) and Admin / Event bill (181:730).
 * What the client pays for SMS, event by event. Never shows Beem cost or profit.
 */
import { useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, tokens, ws } from "../../api/client";
import type { BillingData, EventBillData, HowToPay as HowToPayData } from "../../api/types";
import { Button, ErrorState, Pager, SkelPanel, SkelStats, Stat, Stagger, fmtDate, rowNo, scrollToTable, usePageSize, usePaged } from "../../components/ui";
import { BillBadge, rateChanged, rateLabel, tzs } from "../platform/money";
import "../platform/platform.css";
import { Topbar, useWorkspace } from "./Shell";

/** CSV downloads need the auth header, so fetch and save rather than link. */
async function download(url: string, name: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.access}` } });
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Billing() {
  const { slug, role } = useWorkspace();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["billing", slug], queryFn: () => api<BillingData>(`${ws(slug)}/billing/`), enabled: role === "admin" });
  const b = q.data;
  const invoiced = b?.events.find((e) => e.bill.status === "invoiced");
  const running = b?.events.find((e) => e.bill.status === "open");
  const paidCount = b?.events.filter((e) => e.bill.status === "paid").length ?? 0;
  const total = b ? b.events.reduce((a, e) => ({ sms: a.sms + e.sms, amount: a.amount + e.amount }), { sms: 0, amount: 0 }) : null;
  const [size, setSize] = usePageSize("billing");
  const pg = usePaged(b?.events ?? [], size);
  const top = useRef<HTMLDivElement>(null);
  return (
    <>
      <Topbar crumbs={["Billing"]} />
      <div className="content">
        <div className="p-head">
          <div><h1>Billing</h1><p className="muted">What you pay for SMS, event by event.{b ? (rateChanged(b.prices_used, b.price_per_sms) ? ` New SMS are TZS ${tzs(b.price_per_sms)} each; SMS already sent keep the price they were sent at. Each event is billed after it closes.` : ` Every SMS is TZS ${tzs(b.price_per_sms)}, and each event is billed after it closes.`) : ""}</p></div>
          {b && b.events.length > 0 && <Button onClick={() => download(`${ws(slug)}/billing/?download=csv`, `${slug}-statement.csv`)}>Download statement</Button>}
        </div>
        {role !== "admin" ? <div className="panel"><div className="empty" style={{ padding: 32 }}><h3>Only an admin can see billing</h3><p>Ask an admin in your workspace.</p></div></div>
          : q.isError && !b ? <div className="panel"><ErrorState title="Billing did not load" onRetry={() => q.refetch()} /></div>
          : !b ? <><SkelStats /><SkelPanel h={200} /></>
          : (
            <>
              <Stagger className="stats">
                <Stat label="To pay now, TZS" value={Math.round(b.to_pay_now)} delta={invoiced ? `${invoiced.name}, invoiced${invoiced.bill.invoiced_at ? ` ${fmtDate(invoiced.bill.invoiced_at.slice(0, 10))}` : ""}` : "nothing invoiced"} tone={b.to_pay_now ? "danger" : "neutral"} active />
                <Stat label="Running, TZS" value={Math.round(b.running)} delta={running ? `${running.name}, billed when it closes` : "no event running"} />
                <Stat label="Paid this year, TZS" value={Math.round(b.paid_this_year)} delta={`${paidCount} event${paidCount === 1 ? "" : "s"}`} />
                <Stat label="SMS used" value={b.sms_this_year} delta={`at TZS ${rateLabel(b.prices_used, b.price_per_sms)} each`} />
              </Stagger>
              <div className="panel" style={{ overflowX: "auto" }} ref={top}>
                <table className="table">
                  <thead><tr><th>Event</th><th>Date</th><th className="money">SMS</th><th className="money">Price per SMS</th><th className="money">Amount, TZS</th><th>Bill</th></tr></thead>
                  <tbody>
                    {b.events.length === 0 && <tr><td colSpan={6} className="quiet" style={{ textAlign: "center", padding: 24 }}>No SMS sent yet. Bills appear here once invitations go out.</td></tr>}
                    {pg.slice.map((e) => (
                      <tr key={e.id} className="clickable" onClick={() => nav(`/app/${slug}/billing/${e.id}`)}>
                        <td><b>{e.name}</b></td><td>{fmtDate(e.date)}</td><td className="money">{tzs(e.sms)}</td><td className="money">{rateLabel(e.prices_used)}</td><td className="money">{tzs(e.amount)}</td><td><BillBadge bill={e.bill} /></td>
                      </tr>
                    ))}
                    {total && b.events.length > 0 && <tr className="total"><td>Total, {b.events.length} event{b.events.length === 1 ? "" : "s"}</td><td /><td className="money">{tzs(total.sms)}</td><td /><td className="money">{tzs(total.amount)}</td><td /></tr>}
                  </tbody>
                </table>
                <Pager page={pg.page} pages={pg.pages} count={pg.count} pageSize={pg.pageSize} noun="events" onPage={(p) => { pg.setPage(p); scrollToTable(top.current); }} onPageSize={(n) => { setSize(n); pg.setPage(1); }} />
              </div>
              {b.to_pay_now > 0 && <HowToPay pay={b.how_to_pay} amount={b.to_pay_now} due={invoiced?.bill.due_at ?? null} />}
              <div className="note"><b>How the amount is worked out</b><p>{rateChanged(b.prices_used, b.price_per_sms) ? `Each SMS is charged at the price on the day it was sent: TZS ${rateLabel(b.prices_used)} so far, TZS ${tzs(b.price_per_sms)} from now on. ` : `Every SMS costs TZS ${tzs(b.price_per_sms)}. `}A message up to 160 characters is 1 SMS, longer ones are 2 or more, and an emoji or curly quote lowers the limit to 70. Open a bill to see every message it charges for, or download it as a spreadsheet.</p></div>
            </>
          )}
      </div>
    </>
  );
}

export function EventBillPage() {
  const { slug } = useWorkspace();
  const { eventId = "" } = useParams();
  const [page, setPage] = useState(1);
  const [size, setSize] = usePageSize("bill-messages", 50);
  const chargesTop = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ["event-bill", slug, eventId, page, size], queryFn: () => api<EventBillData>(`${ws(slug)}/events/${eventId}/bill/?page=${page}&page_size=${size}`), placeholderData: keepPreviousData });
  const b = q.data;
  return (
    <>
      <Topbar crumbs={[{ to: `/app/${slug}/billing`, label: "Billing" }, b?.event.name ?? "Bill"]} back={`/app/${slug}/billing`} />
      <div className="content">
        {q.isError && !b ? <div className="panel"><ErrorState title="This bill did not load" onRetry={() => q.refetch()} /></div>
          : !b ? <><div className="skeleton" style={{ width: 320, height: 32 }} /><SkelStats /><SkelPanel h={200} /></>
          : (
            <>
              <div className="p-head">
                <div><h1>{b.event.name}</h1><p className="muted">Bill for {fmtDate(b.event.date)}. {b.bill.status === "open" ? "Open: it is billed when the event closes." : b.bill.status === "invoiced" ? "Invoiced." : "Paid."} Every SMS is TZS {tzs(b.price_per_sms)}.</p></div>
                {b.messages > 0 && <Button onClick={() => download(`${ws(slug)}/events/${eventId}/bill/?download=csv`, `${slug}-${eventId}-bill.csv`)}>Download bill</Button>}
              </div>
              <Stagger className="stats">
                <Stat label="Amount so far, TZS" value={Math.round(b.amount)} delta={`${tzs(b.sms)} SMS at TZS ${rateLabel(b.prices_used, b.price_per_sms)}`} active />
                <Stat label="Messages sent" value={b.messages} delta={b.by_kind.map((k) => k.label.toLowerCase() + "s").join(", ") || "none yet"} />
                <Stat label="Still to come" value={b.still_to_come.welcome_texts ? `About ${b.still_to_come.welcome_texts}` : "None"} delta={b.still_to_come.welcome_texts ? `welcome texts, about TZS ${tzs(b.still_to_come.amount)}` : "no welcome texts expected"} />
                <Stat label="Bill" value={<BillBadge bill={b.bill} />} delta={b.bill.status === "open" ? "invoice when the event closes" : b.bill.status === "invoiced" ? "please pay by the due date" : "thank you"} />
              </Stagger>
              <div className="panel" style={{ overflowX: "auto" }}>
                <div className="panel-head"><h3>By kind of message</h3></div>
                <table className="table">
                  <thead><tr><th>What was sent</th><th className="money">Messages</th><th className="money">SMS</th><th className="money">Price per SMS</th><th className="money">Amount, TZS</th></tr></thead>
                  <tbody>
                    {b.by_kind.length === 0 && <tr><td colSpan={5} className="quiet" style={{ textAlign: "center", padding: 24 }}>Nothing charged yet.</td></tr>}
                    {b.by_kind.map((k) => <tr key={k.kind}><td>{k.label}{k.kind === "welcome" ? "s at the door" : "s"}</td><td className="money">{tzs(k.messages)}</td><td className="money">{tzs(k.sms)}</td><td className="money">{rateLabel(k.prices_used, b.price_per_sms)}</td><td className="money">{tzs(k.amount)}</td></tr>)}
                    {b.by_kind.length > 0 && <tr className="total"><td>Total</td><td className="money">{tzs(b.messages)}</td><td className="money">{tzs(b.sms)}</td><td /><td className="money">{tzs(b.amount)}</td></tr>}
                  </tbody>
                </table>
              </div>
              {b.charges.length > 0 && (
                <div className="panel" style={{ overflowX: "auto" }} ref={chargesTop}>
                  <div className="panel-head"><h3>Every message charged</h3><Button size="sm" onClick={() => download(`${ws(slug)}/events/${eventId}/bill/?download=csv`, `${slug}-${eventId}-bill.csv`)}>Download all</Button></div>
                  <table className={`table paging ${q.isPlaceholderData ? "busy" : ""}`}>
                    <thead><tr><th className="no">No.</th><th>Sent to</th><th>What</th><th className="money">SMS</th><th className="money">Price per SMS</th><th className="money">Amount, TZS</th><th>When</th></tr></thead>
                    <tbody>{b.charges.map((c, i) => <tr key={i}><td className="no">{rowNo(b.charges_page.page, b.charges_page.page_size, i)}</td><td>{c.recipient || <span className="quiet">Unknown</span>}</td><td>{c.label}</td><td className="money">{c.sms}</td><td className="money">{tzs(c.price_per_sms)}</td><td className="money">{tzs(c.amount)}</td><td className="quiet">{when(c.at)}</td></tr>)}</tbody>
                  </table>
                  <Pager page={b.charges_page.page} pages={b.charges_page.pages} count={b.charges_page.count} pageSize={b.charges_page.page_size} noun="messages" onPage={(p) => { setPage(p); scrollToTable(chargesTop.current); }} onPageSize={(n) => { setSize(n); setPage(1); }} />
                </div>
              )}
              {b.bill.status === "invoiced" && b.how_to_pay && <HowToPay pay={b.how_to_pay} amount={b.amount} due={b.bill.due_at} />}
              <div className="note"><b>This bill only grows while the event runs</b><p>Each line is an SMS that Beem accepted. Messages that failed to send are not charged. When the event closes we send the invoice; until then the amount here is the live total.</p></div>
              <Link to={`/app/${slug}/billing`} className="quiet">Back to billing</Link>
            </>
          )}
      </div>
    </>
  );
}

/** Shown once a bill is invoiced: the amount, the due date, and how to pay, from the owner's platform settings. */
function HowToPay({ pay, amount, due }: { pay: HowToPayData; amount: number; due: string | null }) {
  const lines = pay.instructions.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="panel panel-pad pay-panel">
      <div>
        <h3>How to pay</h3>
        <p className="muted" style={{ margin: "4px 0 0" }}>TZS {tzs(amount)} to {pay.business_name}{due ? `, by ${fmtDate(due)}` : ""}.</p>
      </div>
      {lines.length > 0 ? <ul className="pay-lines">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="muted" style={{ margin: 0 }}>Ask {pay.business_name} for the payment details.</p>}
      <p className="quiet" style={{ margin: 0, fontSize: 14 }}>Questions about this bill: <a href={`mailto:${pay.support_email}`}>{pay.support_email}</a>{pay.support_phone && <>, or call <a href={`tel:${pay.support_phone}`}>{pay.support_phone}</a></>}.</p>
    </div>
  );
}
