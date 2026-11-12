import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { Paginated, PlatformWorkspace } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Avatar, Badge, Button, Field, Input, Logo, Modal, Stat, relTime, useToast, ErrorState, SkelStats } from "../../components/ui";
import "../admin/admin.css";

export default function Platform() {
  const { me, signOut } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", default_country: "TZ", admin_email: "", admin_name: "", admin_phone: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  const list = useQuery({ queryKey: ["platform"], queryFn: () => api<Paginated<PlatformWorkspace>>("/api/platform/workspaces/?page_size=200"), enabled: !!me?.is_platform_owner });
  const create = useMutation({ mutationFn: () => api<PlatformWorkspace>("/api/platform/workspaces/", { method: "POST", body: form }), onSuccess: (w) => { qc.invalidateQueries({ queryKey: ["platform"] }); setOpen(false); toast(`${w.name} created. Invite sent to ${form.admin_email}.`); setForm({ name: "", default_country: "TZ", admin_email: "", admin_name: "", admin_phone: "" }); }, onError: (e) => setErr(e as ApiError) });
  if (!me) return <Navigate to="/sign-in" replace />;
  if (!me.is_platform_owner) return <Navigate to="/" replace />;
  const rows = list.data?.results ?? [];
  const totals = { ws: rows.length, msgs: rows.reduce((a, r) => a + r.messages_this_month, 0), open: rows.reduce((a, r) => a + r.events_open, 0), stalled: rows.filter((r) => r.setup !== "complete").length };
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Logo /><span>Trickshot<small>Platform</small></span></div>
        <nav className="nav"><a className="navitem active">Workspaces</a></nav>
        <div className="foot"><div className="user"><Avatar initials={me.initials} round /><span className="grow">{me.full_name || me.email}<small>Platform owner</small></span><button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button></div></div>
      </aside>
      <div className="main">
        <div className="content">
          <div className="page-head"><div><h1>Workspaces</h1><p className="muted">Counts and usage only. Guest lists belong to each workspace and are not readable from here.</p></div><Button variant="primary" onClick={() => setOpen(true)}>New workspace</Button></div>
          {list.data ? (
            <div className="stats"><Stat label="Workspaces" value={totals.ws} active /><Stat label="Messages this month" value={totals.msgs} delta="across all workspaces" /><Stat label="Events running" value={totals.open} delta="doors open now" /><Stat label="Setup stalled" value={totals.stalled} delta={totals.stalled ? "needs a call" : "all set"} tone={totals.stalled ? "danger" : "neutral"} /></div>
          ) : list.isError ? <div className="panel"><ErrorState title="Workspaces did not load" onRetry={() => list.refetch()} /></div> : <SkelStats />}
          <div className="panel">
            <table className="table">
              <thead><tr><th>Workspace</th><th>Country</th><th>Members</th><th>Events</th><th>Messages</th><th>Setup</th><th>Created</th></tr></thead>
              <tbody>{!list.data && !list.isError && [0, 1, 2].map((i) => <tr key={i} aria-hidden><td colSpan={7}><div className="skeleton" style={{ height: 18 }} /></td></tr>)}{list.data && rows.length === 0 && <tr><td colSpan={7} className="quiet" style={{ textAlign: "center", padding: 24 }}>No workspaces yet. Create the first one with New workspace.</td></tr>}{rows.map((w) => <tr key={w.id}><td><b>{w.name}</b><div className="quiet mono" style={{ fontSize: 12 }}>{w.slug}</div></td><td>{w.default_country}</td><td className="num">{w.members}</td><td className="num">{w.events_open} of {w.events}</td><td className="num">{w.messages_this_month}</td><td>{w.setup === "complete" ? <Badge tone="success" dot>Complete</Badge> : w.setup === "no_events" ? <Badge tone="warning" dot>No events yet</Badge> : <Badge tone="danger" dot>Invite not accepted</Badge>}</td><td className="quiet">{relTime(w.created_at)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="panel panel-pad" style={{ background: "var(--bg-inset)", border: 0 }}><b>You cannot open a workspace's guest list from here</b><p className="muted">You are hosting other people's guests' phone numbers. Being unable to read them is deliberate, and it is what you tell a client who asks.</p></div>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="New workspace" sub="Creates the workspace and emails its first admin a set-password link."
        actions={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="ink" loading={create.isPending} disabled={!form.name || !form.admin_email} onClick={() => create.mutate()}>Create and invite</Button></>}>
        <div className="stack" style={{ gap: 12 }}>
          <Field label="Workspace name" error={err?.field("name")}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label="Country"><select className="input" value={form.default_country} onChange={(e) => setForm({ ...form, default_country: e.target.value })}>{[["TZ", "Tanzania"], ["KE", "Kenya"], ["UG", "Uganda"], ["RW", "Rwanda"]].map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></Field>
          <div className="hairline" />
          <Field label="First admin's name"><Input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} /></Field>
          <Field label="Their email" error={err?.field("admin_email")}><Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} /></Field>
          <Field label="Their phone" optional hint="The invite also goes by SMS if given."><Input value={form.admin_phone} onChange={(e) => setForm({ ...form, admin_phone: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
