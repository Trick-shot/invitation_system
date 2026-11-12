/** Platform / SMS rates (Figma 174:215). The return panel updates as you type. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { SmsRatesData } from "../../api/types";
import { Button, ErrorState, Field, Input, SkelPanel, useToast } from "../../components/ui";
import { tzs } from "./money";

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
      <div className="p-head"><div><h1>SMS rates</h1><p className="muted">Two numbers. Each SMS copies them when it is sent, so changing them never rewrites a past bill.</p></div></div>
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
      <div className="note"><b>Billing</b><p>Clients are billed after each event, from the event's own SMS. Prepaid credit or per-client prices can come later without touching old bills.</p></div>
    </>
  );
}
