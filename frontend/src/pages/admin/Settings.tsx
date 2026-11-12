import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError, ws } from "../../api/client";
import type { WorkspaceSettings, ActivityRow } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Button, Field, Input, Modal, useToast, ErrorState, Skel, SkelPanel } from "../../components/ui";
import { Topbar, useWorkspace } from "./Shell";

export default function Settings() {
  const { slug, role } = useWorkspace();
  const { refresh } = useAuth();
  const toast = useToast();
  const q = useQuery({ queryKey: ["settings", slug], queryFn: () => api<WorkspaceSettings>(`${ws(slug)}/settings/`), enabled: role === "admin" });
  const activity = useQuery({ queryKey: ["activity", slug], queryFn: () => api<ActivityRow[]>(`${ws(slug)}/activity/`), enabled: role === "admin" });
  const [form, setForm] = useState({ name: "", default_country: "TZ", default_language: "en", timezone: "Africa/Dar_es_Salaam" });
  const [cred, setCred] = useState({ sender_id: "", api_key: "", secret_key: "" });
  const [credOpen, setCredOpen] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => { if (q.data) setForm({ name: q.data.name, default_country: q.data.default_country, default_language: q.data.default_language, timezone: q.data.timezone }); }, [q.data]);
  const save = useMutation({ mutationFn: () => api(`${ws(slug)}/settings/`, { method: "PATCH", body: form }), onSuccess: () => { q.refetch(); refresh(); toast("Settings saved"); }, onError: (e) => setErr(e as ApiError) });
  const saveCred = useMutation({ mutationFn: () => api(`${ws(slug)}/settings/credentials/`, { method: "PUT", body: cred }), onSuccess: () => { q.refetch(); setCredOpen(false); setCred({ sender_id: "", api_key: "", secret_key: "" }); toast("Beem credentials saved"); }, onError: (e) => toast((e as ApiError).summary, true) });
  const clearCred = useMutation({ mutationFn: () => api(`${ws(slug)}/settings/credentials/`, { method: "DELETE" }), onSuccess: () => { q.refetch(); toast("Back on the platform account"); } });
  const logo = useMutation({ mutationFn: (f: File) => { const fd = new FormData(); fd.append("logo", f); return api(`${ws(slug)}/settings/`, { method: "PATCH", form: fd }); }, onSuccess: () => { q.refetch(); refresh(); toast("Logo updated"); } });
  const exportAll = async () => { const data = await api(`${ws(slug)}/export/`); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = `${slug}-export.json`; a.click(); };

  if (role === "admin" && !q.data) return (<><Topbar crumbs={["Settings"]} /><div className="content">{q.isError ? <div className="panel"><ErrorState title="Settings did not load" onRetry={() => q.refetch()} /></div> : <div className="stack" aria-hidden><Skel w={200} h={30} /><SkelPanel h={180} /><SkelPanel h={120} /></div>}</div></>);
  if (role !== "admin") return (<><Topbar crumbs={["Settings"]} /><div className="content"><h1>Settings</h1><p className="muted">Only an admin can change workspace settings.</p></div></>);
  return (
    <>
      <Topbar crumbs={["Settings"]} />
      <div className="content" style={{ maxWidth: 760 }}>
        <h1>Workspace settings</h1>
        <section className="panel panel-pad stack" style={{ gap: 16 }}>
          <h4>Workspace</h4>
          <Field label="Name" error={err?.field("name")}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <Field label="Country" hint="Used to read numbers like 0712 345 678 correctly."><select className="input" value={form.default_country} onChange={(e) => setForm({ ...form, default_country: e.target.value })}>{[["TZ", "Tanzania"], ["KE", "Kenya"], ["UG", "Uganda"], ["RW", "Rwanda"], ["ZM", "Zambia"], ["MW", "Malawi"]].map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></Field>
          </div>
          <Field label="Logo" optional><div className="row">{q.data?.logo && <img src={q.data.logo} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />}<label className="btn btn-secondary">Upload<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && logo.mutate(e.target.files[0])} /></label></div></Field>
          <div><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></div>
        </section>
        <section className="panel panel-pad stack" style={{ gap: 12 }}>
          <h4>Messaging</h4>
          {q.data?.messaging.mode === "own" ? (
            <><p className="muted">Sending from your own Beem account as <b>{q.data.messaging.sender_id}</b>. Key {q.data.messaging.api_key_masked}.</p><div className="row"><Button onClick={() => setCredOpen(true)}>Replace keys</Button><Button variant="ghost" onClick={() => clearCred.mutate()}>Use the platform account instead</Button></div></>
          ) : (
            <><p className="muted">Sending through the Trickshot platform account. Messages are metered to this workspace.</p><div><Button onClick={() => setCredOpen(true)}>Use my own Beem account</Button></div></>
          )}
        </section>
        <section className="panel panel-pad stack" style={{ gap: 12 }}>
          <h4>Your data</h4>
          <p className="muted">Everything this workspace owns, as one JSON file: events and guests with phone numbers and arrival counts.</p>
          <div className="row"><Button onClick={exportAll}>Download export</Button><span className="quiet" style={{ fontSize: 13 }}>To delete the workspace entirely, ask Trickshot; it is done by hand on purpose.</span></div>
        </section>
        <section className="panel panel-pad stack" style={{ gap: 10 }}>
          <h4>Activity</h4>
          <p className="muted">When Trickshot support opens your workspace to help, it shows here: every visit, why, and anything changed.</p>
          {!activity.data ? <div className="skeleton" style={{ height: 40 }} />
            : activity.data.length === 0 ? <p className="quiet" style={{ fontSize: 14 }}>No support visits so far.</p>
            : <div className="activity" style={{ margin: "0 -20px" }}>{activity.data.map((a, i) => <div key={i}><time>{new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time><span>{a.summary}{a.reason && <small>Reason: {a.reason}</small>}</span></div>)}</div>}
        </section>
      </div>
      <Modal open={credOpen} onClose={() => setCredOpen(false)} title="Your Beem account" sub="Keys are stored encrypted and never shown again. The sender ID must already be approved by Beem."
        actions={<><Button variant="ghost" onClick={() => setCredOpen(false)}>Cancel</Button><Button variant="ink" loading={saveCred.isPending} disabled={!cred.sender_id || !cred.api_key || !cred.secret_key} onClick={() => saveCred.mutate()}>Save keys</Button></>}>
        <div className="stack" style={{ gap: 12 }}>
          <Field label="Sender ID" hint="Up to 11 characters, as approved by Beem."><Input value={cred.sender_id} maxLength={11} onChange={(e) => setCred({ ...cred, sender_id: e.target.value })} /></Field>
          <Field label="API key"><Input value={cred.api_key} onChange={(e) => setCred({ ...cred, api_key: e.target.value })} autoComplete="off" /></Field>
          <Field label="Secret key"><Input type="password" value={cred.secret_key} onChange={(e) => setCred({ ...cred, secret_key: e.target.value })} autoComplete="off" /></Field>
        </div>
      </Modal>
    </>
  );
}
