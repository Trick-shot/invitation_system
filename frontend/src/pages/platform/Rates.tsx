/**
 * Platform / SMS rates (Figma 174:215). The return panel updates as you type.
 * New rates apply to SMS sent from then on. Bills still open can be charged at the
 * new price on purpose, with a preview, a confirm, and the client told.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { OpenBills, SmsRatesData } from "../../api/types";
import { Button, ErrorState, Field, Input, Modal, SkelPanel, useToast } from "../../components/ui";
import { rateLabel, tzs } from "./money";

export default function Rates() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["rates"], queryFn: () => api<SmsRatesData>("/api/platform/rates/") });
  const [f, setF] = useState({ cost: "", price: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => { if (q.data) setF({ cost: String(Number(q.data.cost_per_sms)), price: String(Number(q.data.price_per_sms)) }); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api<SmsRatesData>("/api/platform/rates/", { method: "PUT", body: { cost_per_sms: f.cost, price_per_sms: f.price } }),
    onSuccess: (d) => { qc.setQueryData(["rates"], d); qc.invalidateQueries({ queryKey: ["earnings"] }); toast("Rates saved. They apply to SMS sent from now on."); setErr(null); },
    onError: (e) => setErr(e as ApiError),
  });
  if (q.isError && !q.data) return <div className="panel"><ErrorState title="Rates did not load" onRetry={() => q.refetch()} /></div>;
  const cost = Number(f.cost) || 0, price = Number(f.price) || 0;
  const profit = price - cost;
  const valid = f.cost !== "" && f.price !== "" && price > cost && cost >= 0;
  const dirty = q.data && (Number(q.data.cost_per_sms) !== cost || Number(q.data.price_per_sms) !== price);
  return (
    <>
      <div className="crumbs" style={{ marginBottom: -8 }}><Link to="/platform/earnings">Earnings</Link><span>/</span><span>SMS rates</span></div>
      <div className="p-head"><div><h1>SMS rates</h1><p className="muted">Two numbers. Each SMS copies them when it is sent, so a change only reaches SMS already sent if you charge an open bill at the new price below.</p></div></div>
      {!q.data ? <SkelPanel h={260} /> : (
        <div className="rates">
          <div className="panel panel-pad stack" style={{ gap: 16 }}>
            <h3>Per SMS, in TZS</h3>
            <Field label="Beem charges you" hint="From your Beem dashboard. It drops on bigger bundles; update it when you top up." error={err?.field("cost_per_sms")}>
              <Input inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/[^0-9.]/g, "") })} />
            </Field>
            <Field label="You charge clients" hint="Same for every client for now. Applies to SMS sent from now on. Must be above what Beem charges." error={err?.field("price_per_sms") ?? (f.price !== "" && !valid ? "Must be above what Beem charges, or every SMS loses money." : undefined)}>
              <Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^0-9.]/g, "") })} invalid={f.price !== "" && !valid} />
            </Field>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => nav("/platform/earnings")}>Cancel</Button>
              <Button variant="primary" disabled={!valid || !dirty} loading={save.isPending} onClick={() => save.mutate()}>Save rates</Button>
            </div>
          </div>
          <div className="return-card">
            <h3 style={{ marginBottom: 8 }}>Your return at these rates</h3>
            <div className="row"><span>Beem charges you</span><b>TZS {tzs(cost)}</b></div>
            <div className="row"><span>You charge clients</span><b>TZS {tzs(price)}</b></div>
            <div className="hairline" style={{ margin: "8px 0" }} />
            <div className="row"><span>Profit per SMS</span><span className="big">TZS {tzs(profit)}</span></div>
            <div className="row"><span>Margin</span><b>{price ? `${((profit / price) * 100).toFixed(1)}%` : "0%"}</b></div>
            <div className="row"><span>Markup</span><b>{cost ? `${((profit / cost) * 100).toFixed(1).replace(/\.0$/, "")}%` : "0%"}</b></div>
            <div className="row"><span>Per 1,000 SMS you keep</span><b>TZS {tzs(profit * 1000)}</b></div>
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Margin is profit as a share of what the client pays. Markup is profit as a share of what Beem charges. Both update as you type.</p>
          </div>
        </div>
      )}
      {q.data && <OpenBillsPanel bills={q.data.open_bills} unsaved={!!dirty} onDone={(open_bills) => qc.setQueryData(["rates"], { ...q.data!, open_bills })} />}
      <div className="note"><b>Billing</b><p>Clients are billed after each event, from the event's own SMS. Each SMS keeps the price of the day it was sent unless you charge an open bill at the new price above. Invoiced and paid bills never change.</p></div>
    </>
  );
}

function OpenBillsPanel({ bills, unsaved, onDone }: { bills: OpenBills; unsaved: boolean; onDone: (b: OpenBills) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [notify, setNotify] = useState(true);
  const price = tzs(bills.price_per_sms);
  const workspaces = new Set(bills.events.map((e) => e.workspace_id)).size;
  const go = useMutation({
    mutationFn: () => api<{ changed: OpenBills; open_bills: OpenBills }>("/api/platform/rates/reprice/", { method: "POST", body: { notify } }),
    onSuccess: (r) => {
      onDone(r.open_bills); setConfirm(false);
      qc.invalidateQueries({ queryKey: ["earnings"] }); qc.invalidateQueries({ queryKey: ["platform"] });
      const n = r.changed.events.length;
      const w = new Set(r.changed.events.map((e) => e.workspace_id)).size;
      toast(`${n} open bill${n === 1 ? "" : "s"} now at TZS ${price} per SMS.${notify ? (w === 1 ? " The client has been emailed." : " The clients have been emailed.") : ""}`);
    },
    onError: (e) => toast((e as ApiError).summary ?? "Could not change the bills", true),
  });
  return (
    <section className="panel" style={{ overflowX: "auto" }}>
      <div className="panel-head"><h3>Open bills at an older price</h3><span className="quiet" style={{ fontSize: 13 }}>Invoiced and paid bills never change</span></div>
      {bills.events.length === 0 ? <p className="quiet" style={{ padding: "0 20px 18px", margin: 0 }}>Every open bill is already at TZS {price} per SMS.</p> : (
        <>
          <table className="table">
            <thead><tr><th>Event</th><th>Workspace</th><th className="money">SMS</th><th className="money">Charged at</th><th className="money">Now, TZS</th><th className="money">At TZS {price}, TZS</th></tr></thead>
            <tbody>
              {bills.events.map((e) => <tr key={e.id}><td><b>{e.name}</b></td><td>{e.workspace}</td><td className="money">{tzs(e.sms)}</td><td className="money">{rateLabel(e.prices_used)}</td><td className="money">{tzs(e.amount_now)}</td><td className="money">{tzs(e.amount_after)}</td></tr>)}
              {bills.events.length > 1 && <tr className="total"><td>Total</td><td /><td /><td /><td className="money">{tzs(bills.amount_now)}</td><td className="money">{tzs(bills.amount_after)}</td></tr>}
            </tbody>
          </table>
          <div className="row" style={{ justifyContent: "space-between", padding: "14px 20px", gap: 12, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 14, maxWidth: 560 }}>{unsaved ? "Save the new rates first. This list uses the saved price." : `Charges the SMS already sent on these bills at TZS ${price}. What Beem charged you stays as it was.`}</span>
            <Button variant="primary" disabled={unsaved} onClick={() => setConfirm(true)}>Charge at TZS {price}</Button>
          </div>
        </>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} title={`Charge open bills at TZS ${price}?`}
        sub={`${bills.events.length} event${bills.events.length === 1 ? "" : "s"} in ${workspaces} workspace${workspaces === 1 ? "" : "s"}: TZS ${tzs(bills.amount_now)} becomes TZS ${tzs(bills.amount_after)}. Each client sees the change in their activity, with your name.`}
        actions={<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="ink" loading={go.isPending} onClick={() => go.mutate()}>Charge at TZS {price}</Button></>}>
        <label className="switch-row">
          <span><b>Email each client what changed</b><span className="muted" style={{ display: "block", fontSize: 13 }}>Their admins get the old and new total for each bill.</span></span>
          <input type="checkbox" className="switch" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        </label>
      </Modal>
    </section>
  );
}
