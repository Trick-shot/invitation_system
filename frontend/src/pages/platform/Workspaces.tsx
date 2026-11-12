/** Platform / Workspaces (Figma 34:2). Counts only; a row opens the workspace detail. */
import { useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { EarningsData, Paginated, PlatformSummary, PlatformWorkspace } from "../../api/types";
import { Badge, Button, ErrorState, Field, Input, Modal, Pager, SkelStats, Stat, Stagger, fmtDate, relTime, scrollToTable, useToast } from "../../components/ui";
import { tzs } from "./money";

const setupBadge = (s: PlatformWorkspace["setup"], w?: PlatformWorkspace) =>
  w?.status === "deleting" ? <Badge tone="danger" dot>Removed {w.delete_after ? fmtDate(w.delete_after, true) : "soon"}</Badge>
  : s === "complete" ? <Badge tone="success" dot>Complete</Badge> : s === "no_events" ? <Badge tone="warning" dot>No events yet</Badge> : <Badge tone="danger" dot>Invite not accepted</Badge>;

export default function Workspaces() {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", default_country: "TZ", admin_email: "", admin_name: "", admin_phone: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  const [q, setQ] = useState("");
  const [paged, setPaged] = useState({ for: "", page: 1 });
  const page = paged.for === q ? paged.page : 1;
  const top = useRef<HTMLDivElement>(null);
  // One page at a time; the tiles come from the server's totals so they count every workspace, not just this page.
  const list = useQuery({
    queryKey: ["platform", "list", q, page],
    queryFn: () => api<Paginated<PlatformWorkspace> & { summary: PlatformSummary }>(`/api/platform/workspaces/?page=${page}&page_size=50&q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });
  const earn = useQuery({ queryKey: ["earnings", "now"], queryFn: () => api<EarningsData>("/api/platform/earnings/") });
  const create = useMutation({
    mutationFn: () => api<PlatformWorkspace>("/api/platform/workspaces/", { method: "POST", body: form }),
    onSuccess: (w) => { qc.invalidateQueries({ queryKey: ["platform"] }); setOpen(false); toast(`${w.name} created. Invite sent to ${form.admin_email}.`); setForm({ name: "", default_country: "TZ", admin_email: "", admin_name: "", admin_phone: "" }); },
    onError: (e) => setErr(e as ApiError),
  });
  const rows = list.data?.results ?? [];
  const totals = list.data?.summary;
  return (
    <>
      <div className="p-head"><div><h1>Workspaces</h1><p className="muted">Counts and usage only. Guest lists belong to each workspace and are not readable from here.</p></div><Button variant="primary" onClick={() => setOpen(true)}>New workspace</Button></div>
      {totals ? (
        <Stagger className="stats">
          <Stat label="Workspaces" value={totals.workspaces} delta={`${totals.active_this_month} active this month`} active />
          <Stat label="SMS this month" value={totals.sms_this_month} delta={earn.data ? <Link to="/platform/earnings">TZS {tzs(earn.data.profit)} profit, see Earnings</Link> : "across all workspaces"} />
          <Stat label="Events running" value={totals.events_open} delta="doors open now" />
          <Stat label="Setup stalled" value={totals.setup_stalled} delta={totals.setup_stalled ? "needs a call" : "all set"} tone={totals.setup_stalled ? "danger" : "neutral"} />
        </Stagger>
      ) : list.isError ? <div className="panel"><ErrorState title="Workspaces did not load" onRetry={() => list.refetch()} /></div> : <SkelStats />}
      <div className="toolbar"><div className="search" style={{ width: 300 }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg><input placeholder="Search workspace, admin name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      <div className="panel" style={{ overflowX: "auto" }} ref={top}>
        <table className={`table paging ${list.isPlaceholderData ? "busy" : ""}`}>
          <thead><tr><th>Workspace</th><th>Contact</th><th>Sends on</th><th className="money">SMS this month</th><th>Setup</th><th>Last active</th></tr></thead>
          <tbody>
            {!list.data && !list.isError && [0, 1, 2].map((i) => <tr key={i} aria-hidden><td colSpan={6}><div className="skeleton" style={{ height: 18 }} /></td></tr>)}
            {list.data && rows.length === 0 && <tr><td colSpan={6} className="quiet" style={{ textAlign: "center", padding: 24 }}>{q ? `No workspace matches "${q}".` : "No workspaces yet. Create the first one with New workspace."}</td></tr>}
            {rows.map((w) => (
              <tr key={w.id} className="clickable" onClick={() => nav(`/platform/workspaces/${w.id}`)}>
                <td><b>{w.name}</b><div className="mono quiet" style={{ fontSize: 12 }}>{w.slug}</div></td>
                <td>{w.contact ? (w.contact.name || w.contact.email) : <span className="quiet">None yet</span>}</td>
                <td>{w.sends_on === "own_keys" ? "Their Beem keys" : "Your Beem, billed"}</td>
                <td className="money">{(w.sms_this_month ?? 0).toLocaleString("en-US")}</td>
                <td>{setupBadge(w.setup, w)}</td>
                <td className="quiet">{w.last_active ? relTime(w.last_active) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pager page={list.data.page} pages={list.data.pages} count={list.data.count} pageSize={list.data.page_size} noun="workspaces" onPage={(p) => { setPaged({ for: q, page: p }); scrollToTable(top.current); }} />}
      </div>
      <div className="note"><b>Opening a workspace is logged and visible to the client</b><p>You can open any workspace read-only to help a client. Each visit appears in their activity. Changing anything needs edit mode: a reason, 30 minutes, and a summary sent to the client.</p></div>
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
    </>
  );
}
