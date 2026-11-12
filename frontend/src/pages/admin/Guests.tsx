import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, ev } from "../../api/client";
import type { ImportPreview, Invitation, Paginated, PreviewRow } from "../../api/types";
import { Avatar, Badge, Button, Chip, DoneTick, Loader, Empty, ErrorState, Field, Input, Modal, Pager, SkelRows, Track, rowNo, scrollToTable, usePageSize, useToast, CapacityPicker, useIsPhone } from "../../components/ui";
import { GuestSheet } from "./GuestSheet";
import { useEvent } from "./EventLayout";
import { Icon } from "./Shell";

type Filter = "" | "not_arrived" | "failed" | "not_sent";

export default function Guests() {
  const { slug, eventId, refetch } = useEvent();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filter") ?? "") as Filter;
  // Search lives in the URL too, so the top bar search ("?q=") and a shared link land here filtered.
  const [q, setQ0] = useState(() => params.get("q") ?? "");
  const urlQ = params.get("q") ?? "";
  useEffect(() => { setQ0(urlQ); }, [urlQ]);
  const setQ = (v: string) => { setQ0(v); };
  // The page belongs to one search and filter: change either and you are back on page 1, in the same render.
  const [paged, setPaged] = useState({ for: "", page: 1 });
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();
  const [open, setOpen] = useState<Invitation | null>(null);
  const qc = useQueryClient();
  const [size, setSize] = usePageSize("guests");
  const view = `${filter}|${q}|${size}`;
  const page = paged.for === view ? paged.page : 1;
  const setPage = (p: number) => setPaged({ for: view, page: p });
  const key = ["invitations", slug, eventId, filter, q, page, size];
  // The rows on screen stay (dimmed) while the next page loads, so paging never flashes a skeleton.
  const list = useQuery({ queryKey: key, queryFn: () => api<Paginated<Invitation>>(`${ev(slug, eventId)}/invitations/?page=${page}&page_size=${size}&filter=${filter}&q=${encodeURIComponent(q)}`), placeholderData: keepPreviousData });
  const tableTop = useRef<HTMLDivElement>(null);
  const hasPending = list.data?.results.some((g) => g.card_status === "pending" || g.card_status === "generating");
  useEffect(() => { if (!hasPending) return; const t = setInterval(() => list.refetch(), 3000); return () => clearInterval(t); }, [hasPending, list]);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["invitations", slug, eventId] }); qc.invalidateQueries({ queryKey: ["dashboard", slug, eventId] }); refetch(); };
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
        <div className="d-only row" style={{ gap: 8 }}><Button onClick={() => setImporting(true)}>Import</Button><Button variant="primary" onClick={() => setAdding(true)}>Add guest</Button></div>
      </div>
      {!empty && <div className="m-actions"><Button size="lg" onClick={() => setImporting(true)}>Import</Button><Button size="lg" variant="primary" onClick={() => setAdding(true)}>Add guest</Button></div>}
      {empty ? (
        <div className="panel"><Empty illustration="address-book" title="No guests yet" action={<div className="row"><Button onClick={() => setImporting(true)}>Import a list</Button><Button variant="primary" onClick={() => setAdding(true)}>Add one by hand</Button></div>}>Bring them in from your phone, a pasted list, or a file. We check every number before anything is sent.</Empty></div>
      ) : (
        <div className="panel">
          {list.isLoading && <SkelRows rows={8} />}
          {list.isError && !list.data && <ErrorState title="The guest list did not load" onRetry={() => list.refetch()} />}
          {list.isSuccess && total === 0 && <NoMatch q={q} filter={filter} onReset={() => { setQ(""); setParams({}); }} />}
          <div ref={tableTop} className={`paging ${list.isPlaceholderData ? "busy" : ""}`} hidden={list.isSuccess && total === 0}>
          <div className="m-list">
            {(list.data?.results ?? []).map((g) => (
              <div key={g.id} className="m-guest" onClick={() => setOpen(g)} role="button" tabIndex={0}>
                <Avatar initials={g.initials} />
                <div className="grow" style={{ minWidth: 0 }}><div className="m-name">{g.name}</div><div className="num quiet" style={{ fontSize: 13 }}>{g.phone_display}</div></div>
                <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                  {g.last_delivery ? <Badge tone={g.last_delivery.status === "failed" ? "danger" : g.last_delivery.status === "delivered" ? "success" : "neutral"} dot>{{ queued: "Queued", sent: "Sent", delivered: "Delivered", failed: "Failed" }[g.last_delivery.status]}</Badge> : <Badge dot>Not sent</Badge>}
                  <div className="row" style={{ gap: 8 }}><div style={{ width: 40 }}><Track value={g.admitted_count} max={g.capacity} tone={g.admitted_count === g.capacity ? "ok" : undefined} /></div><span className="mono" style={{ fontSize: 13, color: g.admitted_count === g.capacity ? "var(--success-text)" : undefined }}>{g.admitted_count} of {g.capacity}</span></div>
                </div>
              </div>
            ))}
          </div>
          <table className="table d-only">
            <thead><tr><th className="no">No.</th><th>Guest</th><th>Phone</th><th>Admits</th><th>Card</th><th>Delivery</th><th>Arrivals</th><th /></tr></thead>
            <tbody>
              {(list.data?.results ?? []).map((g, i) => (
                <tr key={g.id} className="clickable" onClick={() => setOpen(g)}>
                  <td className="no">{rowNo(list.data!.page, list.data!.page_size, i)}</td>
                  <td><div className="row"><Avatar initials={g.initials} /><span>{g.name}</span></div></td>
                  <td className="num">{g.phone_display}</td>
                  <td className="num">{g.capacity}</td>
                  <td>{g.card_status === "ready" ? <a href={`/i/${g.token}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Ready</a> : g.card_status === "failed" ? <span style={{ color: "var(--danger-text)" }} title={g.card_error}>Failed</span> : <span className="quiet">Building…</span>}</td>
                  <td>{g.last_delivery ? <Badge tone={g.last_delivery.status === "failed" ? "danger" : g.last_delivery.status === "delivered" ? "success" : "neutral"} dot>{{ queued: "Queued", sent: "Sent", delivered: "Delivered", failed: "Failed" }[g.last_delivery.status]}{g.last_delivery.sequence > 1 ? ` ×${g.last_delivery.sequence}` : ""}</Badge> : <Badge dot>Not sent</Badge>}</td>
                  <td><div className="row" style={{ gap: 10 }}><div style={{ width: 48 }}><Track value={g.admitted_count} max={g.capacity} tone={g.admitted_count === g.capacity ? "ok" : undefined} /></div><span className="mono" style={{ color: g.admitted_count === g.capacity ? "var(--success-text)" : undefined }}>{g.admitted_count} of {g.capacity}</span></div></td>
                  <td style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setOpen(g); }}>Details</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {list.data && <Pager page={list.data.page} pages={list.data.pages} count={total} pageSize={list.data.page_size} noun="guests" onPage={(p) => { setPage(p); scrollToTable(tableTop.current); }} onPageSize={setSize} />}
        </div>
      )}
      <AddGuestModal open={adding} onClose={() => setAdding(false)} onAdded={invalidate} />
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={invalidate} onNext={() => navigate("../send")} />
      <GuestSheet slug={slug} eventId={eventId} guest={open} onClose={() => setOpen(null)} onChanged={invalidate} />
    </>
  );
}

export function AddGuestModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const phone = useIsPhone();
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
        <Field label="Name" error={err?.field("name")}><Input ref={nameRef} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={!phone} /></Field>
        <Field label="Phone" hint="Any format. 0712 345 678 becomes +255 712 345 678." error={err?.field("phone")}><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" invalid={!!err?.field("phone")} /></Field>
        <Field label="People on this card" hint="Up to 20. The scanner counts each person in as they arrive."><CapacityPicker value={form.capacity} onChange={(n) => setForm({ ...form, capacity: n })} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

type Source = "contacts" | "paste" | "file";
export function ImportModal({ open, onClose, onDone, onNext, nextLabel }: { open: boolean; onClose: () => void; onDone: () => void; onNext?: () => void; nextLabel?: string }) {
  const { slug, eventId } = useEvent();
  const supportsContacts = typeof navigator !== "undefined" && "contacts" in navigator && "select" in (navigator as unknown as { contacts: { select?: unknown } }).contacts;
  const [source, setSource] = useState<Source>(supportsContacts ? "contacts" : "paste");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState<{ code: string; detail: string; headings?: string[] } | null>(null);
  const [done, setDone] = useState<{ created: number; skipped: number; leftBehind: number } | null>(null);
  const [over, setOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const toast = useToast();
  const base = `${ev(slug, eventId)}/invitations/import/`;
  const run = useMutation({
    mutationFn: async (input: { source: string; text?: string; file?: File; rows?: unknown[] }) => {
      const fd = new FormData(); fd.append("source", input.source);
      if (input.text) fd.append("text", input.text); if (input.file) fd.append("file", input.file);
      if (input.rows) return api<ImportPreview>(base + "preview/", { method: "POST", body: { source: "rows", rows: input.rows } });
      return api<ImportPreview>(base + "preview/", { method: "POST", form: fd });
    },
    onSuccess: (p) => { setFileError(null); setPreview(p); },
    onError: (e) => { const err = e as ApiError; const d = err.data as { code?: string; detail?: string; headings?: string[] } | null; if (d?.code) setFileError({ code: d.code, detail: d.detail ?? err.summary, headings: d.headings }); else toast(err.summary, true); },
  });
  const commit = useMutation({
    mutationFn: (rows: PreviewRow[]) => api<{ created: number; skipped: unknown[] }>(base + "commit/", { method: "POST", body: { rows: rows.map((r) => ({ name: r.name, phone: r.phone, capacity: r.capacity })) } }),
    onSuccess: (r) => { setPreview(null); setText(""); setDone({ created: r.created, skipped: r.skipped.length, leftBehind: preview?.counts.needs_attention ?? 0 }); onDone(); },
  });
  const close = () => { setPreview(null); setFileError(null); setDone(null); onClose(); };
  const pickContacts = async () => {
    try {
      const nav = navigator as unknown as { contacts: { select: (p: string[], o: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> } };
      const picked = await nav.contacts.select(["name", "tel"], { multiple: true });
      run.mutate({ source: "rows", rows: picked.map((c) => ({ name: c.name?.[0] ?? "", phone: c.tel?.[0] ?? "", capacity: 1 })) });
    } catch { /* user cancelled */ }
  };
  const onFile = (f?: File) => { if (!f) return; setFileName(f.name); const n = f.name.toLowerCase(); const kind = n.endsWith(".vcf") ? "vcard" : n.endsWith(".xlsx") || n.endsWith(".xlsm") ? "xlsx" : "csv"; run.mutate({ source: kind, file: f }); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); };
  const ready = useMemo(() => preview?.rows.filter((r) => r.status === "ready") ?? [], [preview]);
  const setCap = (i: number, cap: number) => preview && setPreview({ ...preview, rows: preview.rows.map((r, j) => (j === i ? { ...r, capacity: cap } : r)) });

  return (
    <Modal open={open} onClose={close} title={done ? `${done.created} guest${done.created === 1 ? "" : "s"} added` : preview ? (ready.length ? "Check before adding" : "Nothing can be added yet") : "Bring in your guests"} sub={done ? "Their cards are being built now. Sending is the next step." : preview ? `${preview.found} found: ${preview.counts.ready} ready, ${preview.counts.duplicate} duplicate, ${preview.counts.needs_attention} need attention` : "Nothing is saved until you confirm the list."} wide
      actions={done ? <><Button variant="ghost" onClick={close}>Back to guests</Button>{onNext && <Button variant="primary" onClick={() => { close(); onNext(); }}>{nextLabel ?? "Send invitations"}</Button>}</> : preview ? <><Button variant="ghost" onClick={() => setPreview(null)}>Fix the file and upload again</Button><Button variant="ink" loading={commit.isPending} disabled={!ready.length} onClick={() => commit.mutate(ready)}>{ready.length ? `Add ${ready.length} guest${ready.length === 1 ? "" : "s"}` : "Nothing to add"}</Button></> : <Button variant="ghost" onClick={close}>Cancel</Button>}>
      {done ? (
        <div className="empty" style={{ padding: "8px 0 0" }}>
          <DoneTick size={128} />
          <p className="muted" style={{ maxWidth: 420 }}>
            Each guest now has a card with their own QR code. Nothing has been sent yet.
            {done.skipped > 0 && <> {done.skipped} row{done.skipped === 1 ? " was" : "s were"} skipped because the number was already on the list.</>}
            {done.leftBehind > 0 && <> {done.leftBehind} row{done.leftBehind === 1 ? "" : "s"} that needed attention {done.leftBehind === 1 ? "was" : "were"} left out; fix {done.leftBehind === 1 ? "it" : "them"} in your spreadsheet and import again.</>}
          </p>
        </div>
      ) : !preview ? (
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
          {fileError && (
            <div className="panel" style={{ padding: 14, background: "var(--danger-subtle)", border: 0, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ width: 28, height: 28, borderRadius: 14, background: "var(--danger)", color: "var(--danger-on)", display: "grid", placeItems: "center", flex: "none" }}>{Icon.x}</span>
              <div className="stack" style={{ gap: 4 }}>
                <b style={{ color: "var(--danger-text)" }}>{{ unreadable: "We could not open that file", empty: "The file is empty", no_phone_column: "No phone numbers found", old_excel: "That is an old Excel format" }[fileError.code] ?? "That file did not work"}</b>
                <span className="muted" style={{ fontSize: 13 }}>{fileError.detail}</span>
                {fileError.code === "no_phone_column" && fileError.headings?.length ? <span className="quiet" style={{ fontSize: 13 }}>The headings we saw: {fileError.headings.join(", ")}. The template uses Name, Phone, Admits.</span> : null}
              </div>
            </div>
          )}
          {source === "file" && (<>
            <div className="panel" style={{ padding: 12, background: "var(--bg-accent-subtle)", border: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13 }}><b>Start from the template.</b> <span className="muted">Three columns: Name, Phone, Admits. Fill it in Excel or Google Sheets and upload it here.</span></span>
              <TemplateDownload />
            </div>
            {run.isPending ? (
              <div className="dropzone" style={{ cursor: "default" }}><Loader label={`Reading ${fileName || "your file"}`} sub="Checking every phone number before anything is saved." /></div>
            ) : (
            <label className={`dropzone ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
              <b>Drop a spreadsheet, .csv or .vcf here, or click to browse</b>
              <div className="quiet" style={{ fontSize: 13, marginTop: 4 }}>Excel or Google Sheets export: a column for names, one for phone numbers, optionally one for how many people the card admits. Any column order; we read the headings. iPhone: Contacts, select people, Share, save the .vcf.</div>
              <input type="file" accept=".xlsx,.xlsm,.vcf,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/vcard,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            )}
          </>)}
        </div>
      ) : (
        <>
        {preview.counts.needs_attention > 0 && (
          <div className="panel" style={{ padding: 12, marginBottom: 12, background: "var(--warning-subtle)", border: 0, color: "var(--warning-text)", fontSize: 13 }}>
            <b>{preview.counts.needs_attention} row{preview.counts.needs_attention === 1 ? "" : "s"} cannot be added as written.</b> Each one says why below. You can add the ready rows now and fix the rest in your spreadsheet, or fix everything and upload again.
          </div>
        )}
        <div className="panel" style={{ maxHeight: 420, overflow: "auto" }}>
          <table className="table">
            <thead><tr><th>Guest</th><th>Phone</th><th>Admits</th><th /></tr></thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i} style={{ opacity: r.status === "ready" ? 1 : 0.75 }}>
                  <td>{r.name || <span className="quiet">(no name)</span>}</td>
                  <td className="num">{r.phone_display ?? r.phone_raw}</td>
                  <td>{r.status === "ready" ? <CapacityPicker compact value={r.capacity} onChange={(n) => setCap(i, n)} /> : <span className="mono quiet">{r.capacity}</span>}</td>
                  <td style={{ textAlign: "right" }}>{r.status === "ready" ? <Badge tone="success">Ready</Badge> : r.status === "duplicate" ? <Badge tone="warning">{r.reason}</Badge> : <Badge tone="danger">{r.reason}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
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

/** Empty result for a search or a filter. Says what the empty group means, so "none failed" reads as good news. */
function NoMatch({ q, filter, onReset }: { q: string; filter: Filter; onReset: () => void }) {
  const [title, text] = q
    ? [`Nothing found for "${q}"`, "Check the spelling, or search by phone number instead."]
    : filter === "failed" ? ["No failed messages", "Every invitation sent so far reached the network. If one fails, it shows here so you can send it again."]
    : filter === "not_sent" ? ["Everyone has their invitation", "Guests you add from now on show here until you send to them."]
    : filter === "not_arrived" ? ["Everyone has arrived", "Every guest on this list has been scanned in at the door."]
    : ["No guests match", "Nobody is in this group yet."];
  return <Empty illustration="search-guests" title={title} action={<Button variant="ghost" onClick={onReset}>Show everyone</Button>}>{text}</Empty>;
}
