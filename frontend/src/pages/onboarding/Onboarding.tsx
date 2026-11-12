/**
 * The coordinator's first run. One centered card per step, each step saves
 * through the same endpoints the admin pages use, so nothing here is a
 * second code path. Steps 3 and 4 reuse the real editors.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, ev, ws } from "../../api/client";
import type { Event, EventKind, GuestBand, Invitation, MessageTemplate, Paginated, SendProgress, WorkspaceSettings } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Button, Chevron, Field, Illustration, Input, Skel, fmtDate, fmtTime, useToast } from "../../components/ui";
import { Confetti } from "./Confetti";
import { ImportModal, TemplateDownload } from "../admin/Guests";
import Message from "../admin/Message";
import Template from "../admin/Template";
import { useWorkspace } from "../admin/Shell";
import { Icon } from "../admin/Shell";
import "./onboarding.css";

function Card({ step, title, sub, hero, children, next, onNext, nextDisabled, nextLoading, back, later }: { step?: string; title: ReactNode; sub?: ReactNode; hero?: string; children?: ReactNode; next?: string; onNext?: () => void; nextDisabled?: boolean; nextLoading?: boolean; back?: () => void; later?: () => void }) {
  return (
    <div className="ob-canvas">
      <div className="ob-wrap">
      <img className="ob-blob" src="/illustrations/blob.png" alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      <div className="ob-card">
        <div className="ob-head">{hero && <Illustration name={hero} size={96} />}{step && <div className="step">{step}</div>}<h1 className="display-xl">{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
        {children}
        {next && <Button variant="primary" size="lg" block onClick={onNext} disabled={nextDisabled} loading={nextLoading}>{next}</Button>}
        {back && <button className="ob-later" onClick={back}>Previous step</button>}
        {later && <button className="ob-later" onClick={later}>Save and finish later</button>}
      </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { slug } = useWorkspace();
  const { step = "1", eventId } = useParams();
  const nav = useNavigate();
  const go = (s: number, id = eventId) => nav(id ? `/app/${slug}/onboarding/${id}/${s}` : `/app/${slug}/onboarding/${s}`);
  const exit = () => nav(eventId ? `/app/${slug}/events/${eventId}` : `/app/${slug}`);
  const n = Number(step);
  // Seven steps, then the Ready screen. Same order as the Figma "Onboarding flow" section.
  if (n === 1) return <Step1 onDone={(id) => go(2, String(id))} later={exit} />;
  if (n === 2) return <StepGuestsExpected onDone={() => go(3)} back={() => go(1)} later={exit} />;
  if (n === 3) return <Step2 onDone={() => go(4)} back={() => go(2)} later={exit} />;
  if (n === 4) return <Card step="Step 4 of 7" title={<>Put the QR code<br />on your card</>} sub="Drag the box to where the code should sit. A real code renders inside it, so you can see whether it will actually scan at that size." next="Continue" onNext={() => go(5)} back={() => go(3)} later={exit}><div style={{ width: "100%" }}><Template /></div></Card>;
  if (n === 5) return <Card step="Step 5 of 7" title={<>What will guests<br />receive?</>} next="Continue" onNext={() => go(6)} back={() => go(4)} later={exit}><div style={{ width: "100%" }}><Message /></div></Card>;
  if (n === 6) return <Step5 onDone={() => go(7)} back={() => go(5)} later={exit} />;
  if (n === 7) return <Step6 onDone={() => go(8)} back={() => go(6)} later={exit} />;
  return <Ready exit={exit} />;
}

function Step1({ onDone, later }: { onDone: (id: number) => void; later: () => void }) {
  const { slug } = useWorkspace();
  const [kind, setKind] = useState<EventKind>("wedding");
  const [form, setForm] = useState({ name: "", date: "", venue: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  const m = useMutation({ mutationFn: () => api<Event>(`${ws(slug)}/events/`, { method: "POST", body: { ...form, kind } }), onSuccess: (e) => onDone(e.id), onError: (e) => setErr(e as ApiError) });
  const kinds: [EventKind, string, string, string][] = [["wedding", "Wedding", "A formal card with the couple's names.", "wedding-envelope"], ["communion", "First communion", "Family and church friends. Often several per card.", "church"], ["graduation", "Graduation", "Often two or three people per card.", "graduation"], ["other", "Something else", "You write the message yourself.", "note-pencil"]];
  return (
    <Card step="Step 1 of 7" title={<>What kind of event<br />is this?</>} sub="This sets the starting text of your invitation message. You can change every word of it later." next="Continue" onNext={() => m.mutate()} nextDisabled={!form.name || !form.date} nextLoading={m.isPending} later={later}>
      <div className="ob-grid">
        {kinds.map(([k, t, d, ill]) => (
          <button key={k} type="button" className={`choice ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
            <div className="top"><Illustration name={ill} size={56} /><span className={`radio ${kind === k ? "on" : ""}`} /></div>
            <span className="title">{t}</span><span className="desc">{d}</span>
          </button>
        ))}
      </div>
      <div className="ob-form">
        <Field label="Event name" error={err?.field("name")}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kimaro Wedding" /></Field>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <Field label="Date" error={err?.field("date")}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Venue"><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Kunduchi Beach Hotel" /></Field>
        </div>
      </div>
    </Card>
  );
}

const BANDS: [GuestBand, string, string, number, number][] = [
  ["under_100", "Under 100", "A family gathering. Up to about 300 SMS.", 1, 99],
  ["100_300", "100 to 300", "Most weddings and communions. About 300 to 900 SMS.", 100, 300],
  ["300_1000", "300 to 1,000", "Big weddings and graduations. About 900 to 3,000 SMS.", 301, 1000],
  ["over_1000", "More than 1,000", "Conferences and public events. We will call you to plan it.", 1001, Number.MAX_SAFE_INTEGER],
];

/** Step 2. Tells Trickshot how big events are getting, so SMS volume can be planned. Figma: "Onboarding / 2 Guests expected". */
function StepGuestsExpected({ onDone, back, later }: { onDone: () => void; back: () => void; later: () => void }) {
  const { slug } = useWorkspace();
  const { eventId = "" } = useParams();
  const e = useQuery({ queryKey: ["event", slug, eventId], queryFn: () => api<Event>(`${ev(slug, eventId)}/`), enabled: !!eventId });
  const [band, setBand] = useState<GuestBand | "">("");
  const [num, setNum] = useState("");
  useEffect(() => { if (e.data) { setBand(e.data.guests_estimate_band || ""); setNum(e.data.guests_estimate ? String(e.data.guests_estimate) : ""); } }, [e.data]);
  const typed = (v: string) => {
    const clean = v.replace(/[^0-9]/g, "").slice(0, 6);
    setNum(clean);
    const n = Number(clean);
    if (n > 0) { const hit = BANDS.find(([, , , lo, hi]) => n >= lo && n <= hi); if (hit) setBand(hit[0]); }
  };
  const m = useMutation({ mutationFn: () => api(`${ev(slug, eventId)}/`, { method: "PATCH", body: { guests_estimate_band: band, guests_estimate: num ? Number(num) : null } }), onSuccess: onDone });
  return (
    <Card step="Step 2 of 7" title={<>How many guests are<br />you expecting?</>} hero="guests" next="Continue" onNext={() => m.mutate()} nextDisabled={!band} nextLoading={m.isPending} back={back} later={later}>
      <div className="ob-grid">
        {BANDS.map(([k, t, d, lo, hi]) => (
          <button key={k} type="button" className={`choice ${band === k ? "on" : ""}`} onClick={() => { setBand(k); const n = Number(num); if (num && (n < lo || n > hi)) setNum(""); }}>
            <span className="title">{t}</span><span className="desc">{d}</span>
          </button>
        ))}
      </div>
      <div className="ob-form"><Field label="Know the number? Type it" optional><Input inputMode="numeric" value={num} onChange={(ev_) => typed(ev_.target.value)} placeholder="250" /></Field></div>
    </Card>
  );
}

function Step2({ onDone, back, later }: { onDone: () => void; back: () => void; later: () => void }) {
  const { slug } = useWorkspace();
  const { refresh } = useAuth();
  const q = useQuery({ queryKey: ["settings", slug], queryFn: () => api<WorkspaceSettings>(`${ws(slug)}/settings/`) });
  const [form, setForm] = useState({ name: "", default_country: "TZ" });
  const [logo, setLogo] = useState<File | null>(null);
  useEffect(() => { if (q.data) setForm({ name: q.data.name, default_country: q.data.default_country }); }, [q.data]);
  const m = useMutation({
    mutationFn: async () => { await api(`${ws(slug)}/settings/`, { method: "PATCH", body: form }); if (logo) { const fd = new FormData(); fd.append("logo", logo); await api(`${ws(slug)}/settings/`, { method: "PATCH", form: fd }); } await refresh(); },
    onSuccess: onDone,
  });
  return (
    <Card step="Step 3 of 7" title={<>What should we call<br />this workspace?</>} sub="This is the name your team sees. Everything you create lives inside it." hero="storefront" next="Continue" onNext={() => m.mutate()} nextLoading={m.isPending} nextDisabled={!form.name} back={back} later={later}>
      <div className="ob-form">
        <Field label="Workspace name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
          <Field label="Country" hint="We read numbers like 0712 345 678 correctly, and set your timezone."><select className="input" value={form.default_country} onChange={(e) => setForm({ ...form, default_country: e.target.value })}>{[["TZ", "Tanzania"], ["KE", "Kenya"], ["UG", "Uganda"], ["RW", "Rwanda"]].map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></Field>
          <Field label="Logo" optional><label className="dropzone" style={{ padding: 14 }}><span style={{ color: "var(--text-accent)", fontWeight: 500 }}>{logo ? logo.name : "Drop an image or browse"}</span><div className="quiet" style={{ fontSize: 12 }}>PNG or SVG, at least 128px</div><input type="file" accept="image/*" hidden onChange={(e) => setLogo(e.target.files?.[0] ?? null)} /></label></Field>
        </div>
      </div>
    </Card>
  );
}

function Step5({ onDone, back, later }: { onDone: () => void; back: () => void; later: () => void }) {
  const { slug } = useWorkspace();
  const { eventId = "" } = useParams();
  const [importing, setImporting] = useState(false);
  const list = useQuery({ queryKey: ["invitations", slug, eventId, "ob"], queryFn: () => api<Paginated<Invitation>>(`${ev(slug, eventId)}/invitations/?page_size=6`) });
  const count = list.data?.count ?? 0;
  const routes: [string, string, string][] = [["phone-contacts", "From my phone", "Pick guests straight from your contacts. Android only for now."], ["clipboard", "Paste a list", "Names and numbers from WhatsApp or a note. We sort out the format."], ["spreadsheet", "Upload a spreadsheet", "Excel, Google Sheets export, .csv or an iPhone .vcf. We read the headings."]];
  return (
    <Card step="Step 6 of 7" title="Who is coming?" sub="Add a few to get going. You can bring in the full list any time after setup." next={count ? `Continue with ${count} guest${count === 1 ? "" : "s"}` : "Continue"} onNext={onDone} back={back} later={later}>
      <div className="ob-grid three">
        {routes.map(([ill, t, d]) => <button key={t} type="button" className="choice" onClick={() => setImporting(true)}><div className="top"><Illustration name={ill} size={56} /></div><span className="title">{t}</span><span className="desc">{d}</span></button>)}
      </div>
      <div className="row" style={{ width: "100%", justifyContent: "center", gap: 10, fontSize: 13 }}><span className="muted">Have a list in Excel? Fill in the template and upload it.</span><TemplateDownload /></div>
      {count > 0 && (
        <div className="panel" style={{ width: "100%" }}>
          {list.data!.results.map((g, i) => <div key={g.id} className="row" style={{ padding: "10px 16px", borderTop: i ? "1px solid var(--border-subtle)" : 0, justifyContent: "space-between" }}><span>{g.name}</span><span className="mono muted">{g.phone_display}</span><span className="muted">Admits {g.capacity}</span><span style={{ color: "var(--success-text)", fontWeight: 500 }}>Ready</span></div>)}
          {count > 6 && <div className="quiet" style={{ padding: "10px 16px", fontSize: 13 }}>and {count - 6} more</div>}
        </div>
      )}
      <OnboardingImport open={importing} onClose={() => setImporting(false)} onDone={() => list.refetch()} />
    </Card>
  );
}
// ImportModal expects the event route context; give it the same params it reads.
function OnboardingImport(props: { open: boolean; onClose: () => void; onDone: () => void }) { return <ImportModal {...props} onNext={props.onClose} nextLabel="Continue" />; }

function Step6({ onDone, back, later }: { onDone: () => void; back: () => void; later: () => void }) {
  const { slug, me } = useWorkspace();
  const { eventId = "" } = useParams();
  const toast = useToast();
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);
  const [err, setErr] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      const inv = await api<Invitation>(`${ev(slug, eventId)}/invitations/`, { method: "POST", body: { name: `Test: ${me?.full_name || "me"}`, phone, capacity: 1 } }).catch(async (e: ApiError) => {
        if (e.field("phone")?.includes("already")) { const l = await api<Paginated<Invitation>>(`${ev(slug, eventId)}/invitations/?q=${encodeURIComponent(phone.replace(/\s/g, ""))}`); return l.results[0]; }
        throw e;
      });
      setStage(1);
      for (let i = 0; i < 10 && (await api<Invitation>(`${ev(slug, eventId)}/invitations/${inv.id}/`)).card_status !== "ready"; i++) await new Promise((r) => setTimeout(r, 1000));
      await api(`${ev(slug, eventId)}/invitations/send/`, { method: "POST", body: { invitation_ids: [inv.id] } });
      setStage(2);
      for (let i = 0; i < 15; i++) { const p = await api<SendProgress>(`${ev(slug, eventId)}/invitations/send/progress/`); const row = p.recent.find((r) => r.invitation_id === inv.id); if (row && row.status !== "queued") { if (row.status === "failed") throw new Error(row.error || "Delivery failed"); break; } await new Promise((r) => setTimeout(r, 1000)); }
      setStage(3);
      sessionStorage.setItem(`ob-test:${eventId}`, new Date().toISOString());
    },
    onError: (e) => { setErr(e instanceof ApiError ? e.summary : (e as Error).message); setStage(0); toast("The test did not go through", true); },
  });
  const rows = [["Queued with Beem", 1], ["Sent to network", 2], ["Delivered to your phone", 3]] as const;
  return (
    <Card step="Step 7 of 7" title={<>Send one to<br />yourself first</>} sub="Before you spend anything on real guests, prove the whole chain works on your own phone." hero="paper-plane" next="Finish setup" onNext={onDone} nextDisabled={stage < 2} back={back} later={later}>
      <div className="row" style={{ width: "100%", alignItems: "flex-end" }}>
        <Field label="Your number" error={err}><Input className="mono" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0712 345 678" /></Field>
        <Button variant="ink" size="lg" loading={send.isPending} disabled={!phone} onClick={() => send.mutate()}>Send me a test invitation</Button>
      </div>
      <div className="ob-timeline">{rows.map(([l, s]) => <div key={l} className="trow"><span className={`ob-check ${stage >= s ? "" : "wait"}`}>{stage >= s ? Icon.check : null}</span><span className="grow" style={{ fontWeight: 500 }}>{l}</span><span className="quiet mono" style={{ fontSize: 12 }}>{stage >= s ? new Date().toLocaleTimeString("en-GB") : ""}</span></div>)}</div>
      <div className="ob-tip"><h4>Now check your phone</h4><p className="muted">Open the link in the message. You should see your card. Try scanning the QR code with your normal camera app. If nothing arrived, check your Beem credentials, sender ID approval, then account credit.</p></div>
    </Card>
  );
}

/** After step 7. Figma: "Onboarding / 8 Ready". Confetti once, then what exists and what to do next. */
function Ready({ exit }: { exit: () => void }) {
  const { slug } = useWorkspace();
  const { eventId = "" } = useParams();
  const nav = useNavigate();
  const e = useQuery({ queryKey: ["event", slug, eventId], queryFn: () => api<Event>(`${ev(slug, eventId)}/`) });
  const msg = useQuery({ queryKey: ["message", slug, eventId], queryFn: () => api<MessageTemplate>(`${ev(slug, eventId)}/message/`), retry: false });
  const tested = sessionStorage.getItem(`ob-test:${eventId}`);
  const x = e.data;
  const items: [string, string, boolean][] = x ? [
    ["Event created", [x.name, fmtDate(x.date), x.venue].filter(Boolean).join(", "), true],
    ["Template and QR slot", x.has_template ? "Placed. Every guest's card is built from it." : "Not placed yet. Guests cannot be sent until it is.", x.has_template],
    ["Message", msg.data ? `${msg.data.segments.characters} characters, ${msg.data.segments.segments} SMS per guest.` : "Not written yet.", !!x.has_message],
    ["Test invitation", tested ? `Delivered to your phone at ${fmtTime(tested)}.` : "Not sent yet. Send one from the Send tab when you are ready.", !!tested],
  ] : [];
  const nextSteps: [string, string, string][] = [["Add the rest of your guests", "Import a .vcf or paste a list. Takes a minute.", `/app/${slug}/events/${eventId}/guests`], ["Add door staff", "They need their own account to scan at the gate.", `/app/${slug}/events/${eventId}/staff`]];
  return (
    <>
      <Confetti />
      <Card title="Your event is ready" sub="Here is what exists now, and the two things worth doing next." hero="check-badge" next="Go to my event" onNext={exit}>
        <div className="ob-list">
          {!x && [0, 1, 2, 3].map((i) => <div key={i} className="ob-item" aria-hidden><Skel w={22} h={22} r={11} /><div className="grow" style={{ display: "grid", gap: 6 }}><Skel w="40%" h={14} /><Skel w="70%" h={12} /></div></div>)}
          {items.map(([t, d, ok]) => <div key={t} className="ob-item"><span className={`ob-check ${ok ? "" : "wait"}`}>{ok ? Icon.check : null}</span><div><div className="row" style={{ gap: 8 }}><b>{t}</b><span style={{ fontSize: 12, fontWeight: 600, color: ok ? "var(--success-text)" : "var(--warning-text)" }}>{ok ? "Done" : "Later"}</span></div><div className="muted" style={{ fontSize: 13 }}>{d}</div></div></div>)}
          {nextSteps.map(([t, d, to]) => <button key={t} type="button" className="ob-item next" style={{ border: 0, textAlign: "left", cursor: "pointer", width: "100%" }} onClick={() => nav(to)}><span className="ob-check next"><Chevron /></span><div><div className="row" style={{ gap: 8 }}><b>{t}</b><span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-accent)" }}>Next</span></div><div className="muted" style={{ fontSize: 13 }}>{d}</div></div></button>)}
        </div>
      </Card>
    </>
  );
}
