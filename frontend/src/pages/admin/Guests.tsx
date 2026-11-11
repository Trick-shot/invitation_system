import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, ApiError, ev } from "../../api/client";
import type { ImportPreview, Invitation, Paginated, PreviewRow } from "../../api/types";
import { Avatar, Badge, Button, Chip, Empty, Field, Input, Modal, Track, useToast } from "../../components/ui";
import { useEvent } from "./EventLayout";
import { Icon } from "./Shell";

type Filter = "" | "not_arrived" | "failed" | "not_sent";

export default function Guests() {
  const { slug, eventId, refetch } = useEvent();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filter") ?? "") as Filter;
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<Invitation | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["invitations", slug, eventId, filter, q, page];
  const list = useQuery({ queryKey: key, queryFn: () => api<Paginated<Invitation>>(`${ev(slug, eventId)}/invitations/?page=${page}&page_size=50&filter=${filter}&q=${encodeURIComponent(q)}`) });
  const hasPending = list.data?.results.some((g) => g.card_status === "pending" || g.card_status === "generating");
  useEffect(() => { if (!hasPending) return; const t = setInterval(() => list.refetch(), 3000); return () => clearInterval(t); }, [hasPending, list]);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["invitations", slug, eventId] }); qc.invalidateQueries({ queryKey: ["dashboard", slug, eventId] }); refetch(); };
  const remove = useMutation({ mutationFn: (g: Invitation) => api(`${ev(slug, eventId)}/invitations/${g.id}/`, { method: "DELETE" }), onSuccess: () => { setRemoving(null); invalidate(); toast("Guest removed"); } });
  const total = list.data?.count ?? 0;
  const empty = !list.isLoading && total === 0 && !q && !filter;

  return (
    <>
      <div className="toolbar">
        <div className="search" style={{ width: 260 }}>{Icon.search}<input placeholder="Search name or number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <div className="filters">
          {([["", "All"], ["not_arrived", "Not arrived"], ["failed", "Failed"], ["not_sent", "Not sent"]] as [Filter, string][]).map(([f, l]) => <Chip key={f} on={filter === f} onClick={() => { setParams(f ? { filter: f } : {}); setPage(1); }}>{l}</Chip>)}
        </div>
        <div className="grow" />
        <Button onClick={() => setImporting(true)}>Import</Button>
        <Button variant="primary" onClick={() => setAdding(true)}>Add guest</Button>
      </div>
      {empty ? (
        <div className="panel"><Empty illustration="address-book" title="No guests yet" action={<div className="row"><Button onClick={() => setImporting(true)}>Import a list</Button><Button variant="primary" onClick={() => setAdding(true)}>Add one by hand</Button></div>}>Bring them in from your phone, a pasted list, or a file. We check every number before anything is sent.</Empty></div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead><tr><th>Guest</th><th>Phone</th><th>Admits</th><th>Card</th><th>Delivery</th><th>Arrivals</th><th /></tr></thead>
            <tbody>
              {(list.data?.results ?? []).map((g) => (
                <tr key={g.id}>
                  <td><div className="row"><Avatar initials={g.initials} /><span>{g.name}</span></div></td>
                  <td className="num">{g.phone_display}</td>
                  <td className="num">{g.capacity}</td>
                  <td>{g.card_status === "ready" ? <a href={g.card ?? "#"} target="_blank" rel="noreferrer">Ready</a> : g.card_status === "failed" ? <span style={{ color: "var(--danger-text)" }} title={g.card_error}>Failed</span> : <span className="quiet">Building…</span>}</td>
                  <td>{g.last_delivery ? <Badge tone={g.last_delivery.status === "failed" ? "danger" : g.last_delivery.status === "delivered" ? "success" : "neutral"} dot>{{ queued: "Queued", sent: "Sent", delivered: "Delivered", failed: "Failed" }[g.last_delivery.status]}{g.last_delivery.sequence > 1 ? ` ×${g.last_delivery.sequence}` : ""}</Badge> : <Badge dot>Not sent</Badge>}</td>
                  <td><div className="row" style={{ gap: 10 }}><div style={{ width: 48 }}><Track value={g.admitted_count} max={g.capacity} tone={g.admitted_count === g.capacity ? "ok" : undefined} /></div><span className="mono" style={{ color: g.admitted_count === g.capacity ? "var(--success-text)" : undefined }}>{g.admitted_count} of {g.capacity}</span></div></td>
                  <td style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" onClick={() => setRemoving(g)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 50 && <div className="row panel-pad" style={{ justifyContent: "space-between" }}><span className="quiet">{total} guests</span><div className="row" style={{ gap: 6 }}><Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" disabled={!list.data?.next} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
        </div>
      )}
      <AddGuestModal open={adding} onClose={() => setAdding(false)} onAdded={invalidate} />
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={invalidate} />
      <Modal open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name}?`} sub="Their card and any link already sent will stop working. The number is freed for a new invitation."
        actions={<><Button variant="ghost" onClick={() => setRemoving(null)}>Keep</Button><Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>Remove guest</Button></>} />
    </>
  );
}

export function AddGuestModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { slug, eventId } = useEvent();
  const [form, setForm] = useState({ name: "", phone: "", capacity: 1 });
  const [err, setErr] = useState<ApiError | null>(null);
  const [count, setCount] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api<Invitation>(`${ev(slug, eventId)}/invitations/`, { method: "POST", body: form }),
    onSuccess: (g) => { setCount((c) => c + 1); setForm({ name: "", phone: "", capacity: 1 }); setErr(null); onAdded(); toast(`${g.name} added`); nameRef.current?.focus(); },
    onError: (e) => setErr(e as ApiError),
  });
  return (
    <Modal open={open} onClose={onClose} title="Add a guest" sub="Press Enter to add and keep going."
      actions={<><span className="quiet grow" style={{ alignSelf: "center" }}>{count ? `${count} added this session` : ""}</span><Button variant="ghost" onClick={onClose}>Done</Button><Button variant="ink" loading={m.isPending} onClick={() => m.mutate()} disabled={!form.name || !form.phone}>Add guest</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (form.name && form.phone) m.mutate(); }} className="stack" style={{ gap: 14 }}>
        <Field label="Name" error={err?.field("name")}><Input ref={nameRef} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
        <Field label="Phone" hint="Any format. 0712 345 678 becomes +255 712 345 678." error={err?.field("phone")}><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" invalid={!!err?.field("phone")} /></Field>
        <Field label="People on this card"><div className="row" style={{ gap: 6 }}>{[1, 2, 3].map((n) => <Chip key={n} on={form.capacity === n} onClick={() => setForm({ ...form, capacity: n })}>{n} {n === 1 ? "person" : "people"}</Chip>)}</div></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

type Source = "contacts" | "paste" | "file";
export function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { slug, eventId } = useEvent();
  const supportsContacts = typeof navigator !== "undefined" && "contacts" in navigator && "select" in (navigator as unknown as { contacts: { select?: unknown } }).contacts;
  const [source, setSource] = useState<Source>(supportsContacts ? "contacts" : "paste");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [over, setOver] = useState(false);
  const toast = useToast();
  const base = `${ev(slug, eventId)}/invitations/import/`;
  const run = useMutation({
    mutationFn: async (input: { source: string; text?: string; file?: File; rows?: unknown[] }) => {
      const fd = new FormData(); fd.append("source", input.source);
      if (input.text) fd.append("text", input.text); if (input.file) fd.append("file", input.file);
      if (input.rows) return api<ImportPreview>(base + "preview/", { method: "POST", body: { source: "rows", rows: input.rows } });
      return api<ImportPreview>(base + "preview/", { method: "POST", form: fd });
    },
    onSuccess: setPreview,
    onError: (e) => toast((e as ApiError).summary, true),
  });
  const commit = useMutation({
    mutationFn: (rows: PreviewRow[]) => api<{ created: number; skipped: unknown[] }>(base + "commit/", { method: "POST", body: { rows: rows.map((r) => ({ name: r.name, phone: r.phone, capacity: r.capacity })) } }),
    onSuccess: (r) => { toast(`${r.created} guests added`); setPreview(null); setText(""); onDone(); onClose(); },
  });
  const pickContacts = async () => {
    try {
      const nav = navigator as unknown as { contacts: { select: (p: string[], o: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> } };
      const picked = await nav.contacts.select(["name", "tel"], { multiple: true });
      run.mutate({ source: "rows", rows: picked.map((c) => ({ name: c.name?.[0] ?? "", phone: c.tel?.[0] ?? "", capacity: 1 })) });
    } catch { /* user cancelled */ }
  };
  const onFile = (f?: File) => { if (!f) return; const n = f.name.toLowerCase(); const kind = n.endsWith(".vcf") ? "vcard" : n.endsWith(".xlsx") || n.endsWith(".xlsm") ? "xlsx" : "csv"; run.mutate({ source: kind, file: f }); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); };
  const ready = useMemo(() => preview?.rows.filter((r) => r.status === "ready") ?? [], [preview]);
  const setCap = (i: number, cap: number) => preview && setPreview({ ...preview, rows: preview.rows.map((r, j) => (j === i ? { ...r, capacity: cap } : r)) });

  return (
    <Modal open={open} onClose={() => { setPreview(null); onClose(); }} title={preview ? "Check before adding" : "Bring in your guests"} sub={preview ? `${preview.found} found, ${preview.counts.ready} ready, ${preview.counts.duplicate} duplicate, ${preview.counts.needs_attention} need attention` : "Three ways in. Nothing is saved until you confirm the list."} wide
      actions={preview ? <><Button variant="ghost" onClick={() => setPreview(null)}>Back</Button><Button variant="ink" loading={commit.isPending} disabled={!ready.length} onClick={() => commit.mutate(ready)}>Add {ready.length} guests</Button></> : <Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      {!preview ? (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 6 }}>
            {supportsContacts && <Chip on={source === "contacts"} onClick={() => setSource("contacts")}>From my phone</Chip>}
            <Chip on={source === "paste"} onClick={() => setSource("paste")}>Paste a list</Chip>
            <Chip on={source === "file"} onClick={() => setSource("file")}>Upload a file</Chip>
          </div>
          {source === "contacts" && <div className="dropzone" onClick={pickContacts}><b>Pick guests from your contacts</b><div className="quiet" style={{ fontSize: 13 }}>Opens your phone's contact picker. Choose as many as you like.</div></div>}
          {source === "paste" && <>
            <Field label="One guest per line" hint="Name, phone. Add a number at the end for how many people the card admits, e.g. “Joseph Mwita, 0755 111 222, 2”.">
              <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Amina Hassan, 0712 345 678\nJoseph Mwita, 0755 111 222, 2"} />
            </Field>
            <div><Button variant="ink" loading={run.isPending} disabled={!text.trim()} onClick={() => run.mutate({ source: "paste", text })}>Check the list</Button></div>
          </>}
          {source === "file" && (<>
            <div className="panel" style={{ padding: 12, background: "var(--bg-accent-subtle)", border: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13 }}><b>Start from the template.</b> <span className="muted">Three columns: Name, Phone, Admits. Fill it in Excel or Google Sheets and upload it here.</span></span>
              <TemplateDownload />
            </div>
            <label className={`dropzone ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
              <b>Drop a spreadsheet, .csv or .vcf here, or click to browse</b>
              <div className="quiet" style={{ fontSize: 13, marginTop: 4 }}>Excel or Google Sheets export: a column for names, one for phone numbers, optionally one for how many people the card admits. Any column order; we read the headings. iPhone: Contacts, select people, Share, save the .vcf.</div>
              <input type="file" accept=".xlsx,.xlsm,.vcf,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/vcard,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              {run.isPending && <div className="spinner" style={{ margin: "12px auto 0" }} />}
            </label>
          </>)}
        </div>
      ) : (
        <div className="panel" style={{ maxHeight: 420, overflow: "auto" }}>
          <table className="table">
            <thead><tr><th>Guest</th><th>Phone</th><th>Admits</th><th /></tr></thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i} style={{ opacity: r.status === "ready" ? 1 : 0.75 }}>
                  <td>{r.name || <span className="quiet">(no name)</span>}</td>
                  <td className="num">{r.phone_display ?? r.phone_raw}</td>
                  <td><div className="row" style={{ gap: 4 }}>{[1, 2, 3].map((n) => <button key={n} type="button" className={`chip ${r.capacity === n ? "on" : ""}`} style={{ padding: "2px 8px" }} disabled={r.status !== "ready"} onClick={() => setCap(i, n)}>{n}</button>)}</div></td>
                  <td style={{ textAlign: "right" }}>{r.status === "ready" ? <Badge tone="success">Ready</Badge> : r.status === "duplicate" ? <Badge tone="warning">{r.reason}</Badge> : <Badge tone="danger">{r.reason}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Fetches the .xlsx with the auth header (a plain <a href> would not carry the JWT) and triggers a download. */
export function TemplateDownload({ label = "Download template" }: { label?: string }) {
  const { slug, eventId } = useEvent();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { tokens } = await import("../../api/client");
      const res = await fetch(`${ev(slug, eventId)}/invitations/import/template/`, { headers: { Authorization: `Bearer ${tokens.access}` } });
      const blob = await res.blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "guest-list-template.xlsx"; a.click(); URL.revokeObjectURL(a.href);
    } finally { setBusy(false); }
  };
  return <Button size="sm" variant="ink" loading={busy} onClick={run}>{label}</Button>;
}
