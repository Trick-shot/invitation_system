/**
 * Platform / Settings (Figma 04 Platform, "Platform settings").
 * The owner's own account, and how Trickshot shows up for clients: the support
 * address on every email, the payment details and terms on every bill.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { Paginated, PlatformSettingsData, PlatformWorkspace, SmsRatesData } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Button, ErrorState, Field, Input, SkelPanel, fmtDate, useToast } from "../../components/ui";
import { tzs } from "./money";

export default function PlatformSettings() {
  const q = useQuery({ queryKey: ["platform-settings"], queryFn: () => api<PlatformSettingsData>("/api/platform/settings/") });
  return (
    <>
      <div className="p-head"><div><h1>Settings</h1><p className="muted">Your own account, and what clients see from Trickshot on bills and emails.</p></div></div>
      <div className="settings-grid">
        <div className="stack" style={{ gap: 24 }}>
          <Account />
          <Password />
          {q.data ? <Presence s={q.data} /> : q.isError ? <div className="panel"><ErrorState title="Settings did not load" onRetry={() => q.refetch()} /></div> : <SkelPanel h={420} />}
        </div>
        <div className="stack" style={{ gap: 24 }}>
          <RatesSummary />
          <BeingDeleted />
        </div>
      </div>
    </>
  );
}

function Account() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ full_name: me?.full_name ?? "", phone: me?.phone ?? "" });
  const [err, setErr] = useState<ApiError | null>(null);
  const save = useMutation({
    mutationFn: () => api("/api/me/", { method: "PATCH", body: f }),
    onSuccess: async () => { await refresh(); setErr(null); toast("Your details are saved"); },
    onError: (e) => setErr(e as ApiError),
  });
  const dirty = f.full_name.trim() !== (me?.full_name ?? "") || f.phone.trim() !== (me?.phone ?? "");
  return (
    <section className="panel panel-pad stack" style={{ gap: 16 }}>
      <div><h4>Your account</h4><p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>Your name appears in a client's activity whenever you open or change their workspace.</p></div>
      <Field label="Name" error={err?.field("full_name")}><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoComplete="name" /></Field>
      <div className="row form-pair" style={{ alignItems: "flex-start" }}>
        <Field label="Email" hint="You sign in with this."><Input value={me?.email ?? ""} readOnly disabled /></Field>
        <Field label="Phone" optional error={err?.field("phone")}><Input value={f.phone} inputMode="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
      </div>
      <div><Button variant="primary" disabled={!dirty || !f.full_name.trim()} loading={save.isPending} onClick={() => save.mutate()}>Save</Button></div>
    </section>
  );
}

function Password() {
  const toast = useToast();
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  const change = useMutation({
    mutationFn: () => api("/api/me/password/", { method: "POST", body: { current_password: f.current, new_password: f.next } }),
    onSuccess: () => { setF({ current: "", next: "", again: "" }); setErr(null); toast("Password changed. Use the new one next time you sign in."); },
    onError: (e) => setErr(e as ApiError),
  });
  const mismatch = f.again !== "" && f.again !== f.next;
  return (
    <section className="panel panel-pad stack" style={{ gap: 16 }}>
      <h4>Password</h4>
      <Field label="Current password" error={err?.field("current_password")}><Input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" /></Field>
      <div className="row form-pair" style={{ alignItems: "flex-start" }}>
        <Field label="New password" hint="At least 8 characters, and not only numbers." error={err?.field("new_password")}><Input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="New password again" error={mismatch ? "The two new passwords do not match." : undefined}><Input type="password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} autoComplete="new-password" invalid={mismatch} /></Field>
      </div>
      <div><Button variant="ink" disabled={!f.current || !f.next || f.next !== f.again} loading={change.isPending} onClick={() => change.mutate()}>Change password</Button></div>
    </section>
  );
}

function Presence({ s }: { s: PlatformSettingsData }) {
  const qc = useQueryClient();
  const toast = useToast();
  const initial = { business_name: s.business_name, support_email: s.support_email, support_phone: s.support_phone, payment_instructions: s.payment_instructions, invoice_due_days: String(s.invoice_due_days) };
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => { setF({ business_name: s.business_name, support_email: s.support_email, support_phone: s.support_phone, payment_instructions: s.payment_instructions, invoice_due_days: String(s.invoice_due_days) }); }, [s]);
  const save = useMutation({
    mutationFn: () => api<PlatformSettingsData>("/api/platform/settings/", { method: "PATCH", body: { ...f, invoice_due_days: Number(f.invoice_due_days) } }),
    onSuccess: (d) => { qc.setQueryData(["platform-settings"], d); setErr(null); toast("Saved. Bills and emails use this from now on."); },
    onError: (e) => setErr(e as ApiError),
  });
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => f[k] !== initial[k]);
  return (
    <section className="panel panel-pad stack" style={{ gap: 16 }}>
      <div><h4>On bills and emails</h4><p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>Clients see these. The support address is at the foot of every email, and a reply to any email goes to it.</p></div>
      <div className="row form-pair" style={{ alignItems: "flex-start" }}>
        <Field label="Business name" hint="Printed on every bill." error={err?.field("business_name")}><Input value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></Field>
        <Field label="Days to pay" hint="An invoiced bill is due this many days later." error={err?.field("invoice_due_days")}><Input inputMode="numeric" value={f.invoice_due_days} onChange={(e) => setF({ ...f, invoice_due_days: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} /></Field>
      </div>
      <div className="row form-pair" style={{ alignItems: "flex-start" }}>
        <Field label="Support email" error={err?.field("support_email")}><Input type="email" value={f.support_email} onChange={(e) => setF({ ...f, support_email: e.target.value })} /></Field>
        <Field label="Support phone" optional hint="Shown on bills, for clients who would rather call." error={err?.field("support_phone")}><Input inputMode="tel" value={f.support_phone} onChange={(e) => setF({ ...f, support_phone: e.target.value })} /></Field>
      </div>
      <Field label="How clients pay" optional hint="Shown on every bill, under the amount. One way to pay per line." error={err?.field("payment_instructions")}>
        <textarea className="input" rows={4} value={f.payment_instructions} onChange={(e) => setF({ ...f, payment_instructions: e.target.value })} placeholder={"M-Pesa Lipa namba 123456, Trickshot\nCRDB account 0150 0000 0000, Trickshot Ltd"} />
      </Field>
      <div className="row" style={{ gap: 8 }}>
        <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        {dirty && <Button variant="ghost" onClick={() => { setF(initial); setErr(null); }}>Undo changes</Button>}
      </div>
    </section>
  );
}

function RatesSummary() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["rates"], queryFn: () => api<SmsRatesData>("/api/platform/rates/") });
  return (
    <section className="panel panel-pad stack" style={{ gap: 12 }}>
      <h4>SMS rates</h4>
      {q.data ? (
        <dl className="mini-facts">
          <div><dt>Beem charges you</dt><dd>TZS {tzs(q.data.cost_per_sms)}</dd></div>
          <div><dt>Clients pay</dt><dd>TZS {tzs(q.data.price_per_sms)}</dd></div>
          <div><dt>You keep per SMS</dt><dd className="accent">TZS {tzs(Number(q.data.price_per_sms) - Number(q.data.cost_per_sms))}</dd></div>
        </dl>
      ) : <div className="skeleton" style={{ height: 96 }} aria-hidden />}
      <div><Button onClick={() => nav("/platform/rates")}>Change rates</Button></div>
    </section>
  );
}

function BeingDeleted() {
  const list = useQuery({ queryKey: ["platform", "deleting"], queryFn: () => api<Paginated<PlatformWorkspace>>("/api/platform/workspaces/?status=deleting&page_size=200") });
  const rows = list.data?.results ?? [];
  return (
    <section className="panel panel-pad stack" style={{ gap: 12 }}>
      <h4>Deleting a workspace</h4>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Delete from the workspace's own page. It closes at once and is removed for good 10 days later. Until then you can restore it as it was.</p>
      {!list.data ? <div className="skeleton" style={{ height: 40 }} aria-hidden />
        : rows.length === 0 ? <p className="quiet" style={{ margin: 0, fontSize: 14 }}>No workspace is being deleted.</p>
        : <div className="deleting-list">{rows.map((w) => <Link key={w.id} to={`/platform/workspaces/${w.id}`}><b>{w.name}</b><span>Removed {w.delete_after ? fmtDate(w.delete_after, true) : "soon"}</span></Link>)}</div>}
    </section>
  );
}
