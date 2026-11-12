/**
 * Platform / Workspace detail (Figma 197:74), Change details (197:212), Delete workspace.
 * Client details are read-only here; changing them takes a reason and the client is told.
 * Open workspace starts a logged, read-only support visit.
 * Delete closes the workspace at once and removes it for good after 10 days; Restore undoes it until then.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { PlatformWorkspaceDetail } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Button, ErrorState, Field, Input, Modal, SkelPanel, SkelStats, Stat, Stagger, fmtDate, useToast } from "../../components/ui";
import { pct } from "./money";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function WorkspaceDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const q = useQuery({ queryKey: ["platform-ws", id], queryFn: () => api<PlatformWorkspaceDetail>(`/api/platform/workspaces/${id}/`) });
  const open = useMutation({
    mutationFn: () => api<{ slug: string }>(`/api/platform/workspaces/${id}/support/`, { method: "POST", body: { mode: "view" } }),
    onSuccess: async (r) => { await refresh(); nav(`/app/${r.slug}`); },
    onError: (e) => toast((e as ApiError).summary ?? "Could not open the workspace", true),
  });
  const restore = useMutation({
    mutationFn: () => api<PlatformWorkspaceDetail>(`/api/platform/workspaces/${id}/restore/`, { method: "POST" }),
    onSuccess: (d) => { qc.setQueryData(["platform-ws", id], d); qc.invalidateQueries({ queryKey: ["platform"] }); toast(`${d.name} is back. Its admins have been emailed.`); },
    onError: (e) => toast((e as ApiError).summary ?? "Could not restore the workspace", true),
  });

  if (q.isError && !q.data) return <div className="panel"><ErrorState title="This workspace did not load" onRetry={() => q.refetch()} /></div>;
  if (!q.data) return <div className="stack" aria-hidden style={{ gap: 20 }}><div className="skeleton" style={{ width: 280, height: 32 }} /><SkelStats n={5} /><SkelPanel h={220} /></div>;
  const w = q.data;
  const m = w.money;
  const closing = w.deletion.scheduled;
  const team = [w.team.admin && `${w.team.admin} admin${w.team.admin > 1 ? "s" : ""}`, w.team.coordinator && `${w.team.coordinator} coordinator${w.team.coordinator > 1 ? "s" : ""}`, w.team.door_staff && `${w.team.door_staff} door staff`].filter(Boolean).join(", ") || "Nobody has accepted yet";
  return (
    <>
      <div className="crumbs" style={{ marginBottom: -8 }}><Link to="/platform">Workspaces</Link><span>/</span><span>{w.name}</span></div>
      <div className="p-head">
        <div><h1>{w.name}</h1><p className="muted">Client since {fmtDate(w.created_at.slice(0, 10))}. {w.sends_on === "own_keys" ? "Sends on their own Beem keys, not billed by you." : "Sends on your Beem account, billed after each event."}</p></div>
        {!closing && <div className="actions"><Button onClick={() => setEditing(true)}>Change details</Button><Button variant="primary" loading={open.isPending} onClick={() => open.mutate()}>Open workspace</Button></div>}
      </div>
      {closing && (
        <div className="closing-banner" role="status">
          <div className="grow">
            <b>Being deleted. Removed for good on {fmtDate(w.deletion.delete_after!)}.</b>
            <p>Closed {w.deletion.by ? `by ${w.deletion.by} ` : ""}on {fmtDate(new Date(new Date(w.deletion.delete_after!).getTime() - w.deletion.grace_days * 864e5).toISOString())}. Nobody can sign in, scan, send or open its guest links.</p>
            {w.deletion.reason && <p>Reason: {w.deletion.reason}</p>}
          </div>
          <Button variant="ink" loading={restore.isPending} onClick={() => restore.mutate()}>Restore workspace</Button>
        </div>
      )}
      <Stagger className="stats five">
        <Stat label="Events" value={w.events_total} delta={w.events_running ? `${w.events_running} running now` : "none running"} active />
        <Stat label="SMS this month" value={m.sms_this_month} delta={m.sms_running_event ? `${m.sms_running_event.toLocaleString("en-US")} for the running event` : "nothing running"} />
        <Stat label="Billed this year, TZS" value={Math.round(m.billed_year)} delta={`${m.bills_year} bill${m.bills_year === 1 ? "" : "s"}`} />
        <Stat label="Profit this year, TZS" value={Math.round(m.profit_year)} delta={`${pct(m.profit_year, m.billed_year)} of billed`} tone="success" />
        <Stat label="Unpaid, TZS" value={Math.round(m.unpaid)} delta={m.unpaid ? `${m.unpaid_invoiced} invoiced, ${m.unpaid_open} open` : "all settled"} tone={m.unpaid_invoiced ? "danger" : "neutral"} />
      </Stagger>
      <div className="split">
        <div className="panel">
          <div className="panel-head"><h3>Details</h3></div>
          <dl className="facts">
            <div><dt>Workspace name</dt><dd>{w.name}</dd></div>
            <div><dt>Contact</dt><dd>{w.contact ? <>{w.contact.name || "No name given"} <span className="quiet">{w.contact.email}</span></> : "No admin yet"}</dd></div>
            <div><dt>Contact phone</dt><dd>{w.contact?.phone || <span className="quiet">Not given</span>}</dd></div>
            <div><dt>Country</dt><dd>{w.country_name}</dd></div>
            <div><dt>Team</dt><dd>{team}</dd></div>
          </dl>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Activity</h3><span className="quiet" style={{ fontSize: 13 }}>Also shown to the client</span></div>
          <div className="activity">
            {w.activity.length === 0 && <p className="quiet" style={{ padding: "4px 20px 16px", margin: 0 }}>No support visits or changes yet.</p>}
            {w.activity.map((a, i) => <div key={i}><time>{when(a.at)}</time><span>{a.summary}{a.reason && <small>Reason: {a.reason}</small>}</span></div>)}
          </div>
        </div>
      </div>
      {!closing && <div className="note"><b>Read-only by default</b><p>Open workspace shows it exactly as the client sees it, read-only. Every visit is logged and listed in the client's activity. Edit mode needs a reason, lasts 30 minutes, and the client is told what you changed.</p></div>}
      {!closing && (
        <div className="danger-zone">
          <div className="grow"><b>Delete this workspace</b><p>It closes at once and is removed for good after {w.deletion.grace_days} days: events, guests, cards, team. You can restore it until then.</p></div>
          <Button variant="danger" onClick={() => setDeleting(true)}>Delete workspace</Button>
        </div>
      )}
      <DeleteWorkspace w={w} open={deleting} onClose={() => setDeleting(false)} onDone={(d) => { qc.setQueryData(["platform-ws", id], d); qc.invalidateQueries({ queryKey: ["platform"] }); setDeleting(false); toast(`${d.name} is closed. It will be removed on ${fmtDate(d.deletion.delete_after!)}.`); }} />
      <ChangeDetails w={w} open={editing} onClose={() => setEditing(false)} onSaved={(d) => { qc.setQueryData(["platform-ws", id], d); qc.invalidateQueries({ queryKey: ["platform"] }); toast("Details changed. The client has been emailed."); setEditing(false); }} />
    </>
  );
}

function ChangeDetails({ w, open, onClose, onSaved }: { w: PlatformWorkspaceDetail; open: boolean; onClose: () => void; onSaved: (d: PlatformWorkspaceDetail) => void }) {
  const [f, setF] = useState({ name: w.name, contact_name: w.contact?.name ?? "", contact_phone: w.contact?.phone ?? "", reason: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => { if (open) { setF({ name: w.name, contact_name: w.contact?.name ?? "", contact_phone: w.contact?.phone ?? "", reason: "" }); setErr(null); } }, [open, w]);
  const save = useMutation({ mutationFn: () => api<PlatformWorkspaceDetail>(`/api/platform/workspaces/${w.id}/details/`, { method: "POST", body: f }), onSuccess: onSaved, onError: (e) => setErr(e as ApiError) });
  return (
    <Modal open={open} onClose={onClose} title={`Change ${w.name}'s details`} sub="Only for things the client cannot fix themselves. The change is logged with your name, and the client gets an email showing what changed and why."
      actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="ink" loading={save.isPending} disabled={f.reason.trim().length < 5} onClick={() => save.mutate()}>Save and tell the client</Button></>}>
      <div className="stack" style={{ gap: 12 }}>
        <Field label="Workspace name" error={err?.field("name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Contact name"><Input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} disabled={!w.contact} /></Field>
        <Field label="Contact phone" error={err?.field("contact_phone")}><Input value={f.contact_phone} inputMode="tel" onChange={(e) => setF({ ...f, contact_phone: e.target.value })} disabled={!w.contact} /></Field>
        <Field label="Reason for the change (required)" hint="Shown to the client in the email and kept in the change log." error={err?.field("reason") ?? (err && !err.field("name") && !err.field("contact_phone") ? err.summary : undefined)}>
          <textarea className="input" rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Client asked by phone to correct the spelling of the contact name." />
        </Field>
      </div>
    </Modal>
  );
}

function DeleteWorkspace({ w, open, onClose, onDone }: { w: PlatformWorkspaceDetail; open: boolean; onClose: () => void; onDone: (d: PlatformWorkspaceDetail) => void }) {
  const [f, setF] = useState({ reason: "", confirm: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => { if (open) { setF({ reason: "", confirm: "" }); setErr(null); } }, [open]);
  const go = useMutation({ mutationFn: () => api<PlatformWorkspaceDetail>(`/api/platform/workspaces/${w.id}/delete/`, { method: "POST", body: f }), onSuccess: onDone, onError: (e) => setErr(e as ApiError) });
  const r = w.deletion.removes;
  const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-US")} ${k === 1 ? one : many}`;
  const matches = f.confirm.trim().toLowerCase() === w.name.trim().toLowerCase();
  const day = new Date(Date.now() + w.deletion.grace_days * 864e5).toISOString();
  return (
    <Modal open={open} onClose={onClose} title={`Delete ${w.name}?`} sub={`The workspace closes now. On ${fmtDate(day)} everything in it is removed for good, and it cannot be brought back after that.`}
      actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" loading={go.isPending} disabled={!matches || f.reason.trim().length < 5} onClick={() => go.mutate()}>Delete workspace</Button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="removes">
          <div><b>{n(r.events, "event")}</b><span>with their cards and messages</span></div>
          <div><b>{n(r.guests, "guest")}</b><span>names, phone numbers, arrivals</span></div>
          <div><b>{n(r.team, "team member")}</b><span>{r.accounts === r.team ? "all their accounts close" : `${n(r.accounts, "account")} close, the rest work elsewhere`}</span></div>
        </div>
        {w.money.unpaid > 0 && <p className="warn-line">TZS {Math.round(w.money.unpaid).toLocaleString("en-US")} is still unpaid on its bills. Settle that first: the bills go with the workspace. Your earnings totals stay as they are.</p>}
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Its admins get an email today with the date. Until then, Restore on this page puts everything back as it was.</p>
        <Field label="Reason (required)" hint="Kept with the workspace until it is removed." error={err?.field("reason")}>
          <textarea className="input" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Client asked by email to close their account." />
        </Field>
        <Field label={`Type ${w.name} to confirm`} error={err?.field("confirm") ?? (err && !err.field("reason") ? err.summary : undefined)}>
          <Input value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="off" spellCheck={false} />
        </Field>
      </div>
    </Modal>
  );
}
