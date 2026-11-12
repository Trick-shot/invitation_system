import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Html5Qrcode } from "html5-qrcode";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { ScanEvent, ScanSearchRow, Verdict } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Illustration, Input, fmtDate, fmtTime } from "../../components/ui";
import { Loader } from "../../components/ui/Loader";
import { VerdictMark } from "./VerdictMark";
import * as sounds from "./sounds";
import { soundEnabled, setSoundEnabled } from "./sounds";
import { Icon } from "../admin/Shell";
import "./scanner.css";

const deviceId = () => { let d = localStorage.getItem("ti.device"); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem("ti.device", d); } return d; };

export default function Scanner() {
  const { me, signOut } = useAuth();
  const nav = useNavigate();
  const [eventId, setEventId] = useState<number | null>(() => Number(localStorage.getItem("ti.scan.event")) || null);
  const events = useQuery({ queryKey: ["scan-events"], queryFn: () => api<ScanEvent[]>("/api/scan/events/"), enabled: !!me });
  if (!me) return <Navigate to="/sign-in" replace />;
  const event = events.data?.find((e) => e.id === eventId) ?? null;

  if (!event) {
    return (
      <div className="sc">
        <div className="sc-head"><div><div className="ev">Which event are you scanning for?</div><div className="gate">{me.full_name || me.email}</div></div><button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button></div>
        <div className="events-list">
          {events.data?.map((e) => <button key={e.id} type="button" className="choice" onClick={() => { localStorage.setItem("ti.scan.event", String(e.id)); setEventId(e.id); }}><span className="title" style={{ fontSize: 18 }}>{e.name}</span><span className="desc">{fmtDate(e.date)}{e.venue ? `, ${e.venue}` : ""} · {e.workspace}</span>{e.status !== "open" && <span className="badge badge-warning">Doors not open yet</span>}</button>)}
          {events.data?.length === 0 && <div className="empty"><Illustration name="scanner-phone" /><h3>Nothing to scan yet</h3><p>No open events in your workspaces. Ask the coordinator to open the doors.</p></div>}
          {me.memberships.some((m) => m.role !== "door_staff") && <Button variant="ghost" onClick={() => nav("/")}>Back to the admin</Button>}
        </div>
      </div>
    );
  }
  return <ScanScreen event={event} onChangeEvent={() => { localStorage.removeItem("ti.scan.event"); setEventId(null); }} />;
}

type State = { kind: "idle" } | { kind: "checking" } | { kind: "verdict"; v: Verdict } | { kind: "offline" } | { kind: "search" };

const toneOf = (r: Verdict["result"]) => (r === "accepted" ? "ok" : r === "exhausted" || r === "unknown" ? "bad" : "warn");

function ScanScreen({ event, onChangeEvent }: { event: ScanEvent; onChangeEvent: () => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [arrived, setArrived] = useState<number | null>(null);
  const [sound, setSound] = useState(soundEnabled);
  const [camera, setCamera] = useState<"starting" | "on" | "blocked">("starting");
  const scanner = useRef<Html5Qrcode | null>(null);
  const busy = useRef(false);
  const paused = useRef(false);           // decoding paused while a verdict is on screen
  const lastToken = useRef<{ t: string; at: number } | null>(null);
  const arrivedRef = useRef(arrived); arrivedRef.current = arrived;

  const submit = useCallback(async (body: { token?: string; invitation_id?: number }) => {
    if (busy.current) return;
    busy.current = true; paused.current = true; setState({ kind: "checking" }); sounds.tick();
    const payload = { event_id: event.id, device_id: deviceId(), scanned_at: new Date().toISOString(), ...body };
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const v = await api<Verdict>("/api/scan/", { method: "POST", body: payload });
        setArrived(v.event_arrived); setState({ kind: "verdict", v });
        const tone = toneOf(v.result);
        if (tone === "ok") sounds.admitted(); else if (tone === "bad") sounds.rejected(); else sounds.attention();
        if (navigator.vibrate) navigator.vibrate(tone === "ok" ? 40 : [60, 60, 60]);
        busy.current = false; return;
      } catch (e) {
        lastErr = e;
        if (e instanceof ApiError) break; // a real answer from the server, do not retry
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    busy.current = false;
    if (lastErr instanceof ApiError) { sounds.rejected(); setState({ kind: "verdict", v: { result: "unknown", guest_name: "", capacity: 0, admitted_count: 0, previous_scans: [], invitation_id: null, event_arrived: arrivedRef.current ?? 0 } }); }
    else setState({ kind: "offline" });
  }, [event.id]);

  // The camera starts once and stays on. Stopping it between scans is what made
  // the view go black and restart after every guest; now only the decoder pauses.
  useEffect(() => {
    const el = document.getElementById("reader"); if (!el || scanner.current) return;
    const h = new Html5Qrcode("reader", { verbose: false });
    scanner.current = h;
    setCamera("starting");
    h.start({ facingMode: "environment" }, { fps: 12, aspectRatio: 1 }, (text) => {
      if (paused.current) return;
      const m = text.match(/\/i\/([A-Za-z0-9_-]{8,})/); const token = m ? m[1] : text.trim();
      const now = Date.now();
      if (lastToken.current && lastToken.current.t === token && now - lastToken.current.at < 4000) return; // same card held in frame
      lastToken.current = { t: token, at: now };
      void submit({ token });
    }, () => {}).then(() => setCamera("on")).catch(() => setCamera("blocked"));
    return () => { try { if (h.isScanning) h.stop().catch(() => {}); } catch { /* not running */ } scanner.current = null; };
  }, [submit]);

  // iOS suspends audio until a gesture: the first tap anywhere unlocks it.
  useEffect(() => { const on = () => { void sounds.unlock(); }; window.addEventListener("pointerdown", on, { once: true }); return () => window.removeEventListener("pointerdown", on); }, []);

  useEffect(() => {
    if (state.kind !== "verdict" || state.v.result !== "accepted") return;
    const t = setTimeout(() => dismiss(), 2600);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => { const on = () => state.kind === "offline" && dismiss(); window.addEventListener("online", on); return () => window.removeEventListener("online", on); }, [state.kind]);

  function dismiss() { paused.current = false; setState({ kind: "idle" }); }
  const resumeVideo = () => { const el = document.querySelector("#reader video") as HTMLVideoElement | null; if (el && el.paused) void el.play(); };
  const tone = state.kind === "verdict" ? toneOf(state.v.result) : null;

  return (
    <div className="sc">
      <div className="sc-head">
        <button type="button" style={{ background: "none", border: 0, textAlign: "left", padding: 0 }} onClick={onChangeEvent}><div className="ev">{event.name}</div><div className="gate">{event.workspace} · change</div></button>
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label={sound ? "Mute sounds" : "Turn sounds on"} aria-pressed={sound} onClick={() => { const n = !sound; setSound(n); setSoundEnabled(n); if (n) sounds.tick(); }}>{sound ? Icon.soundOn : Icon.soundOff}</button>
          <div className="count"><b>{arrived ?? "–"}</b><span>arrived</span></div>
        </div>
      </div>
      <div className={`cam theme-dark ${state.kind}`} onClick={resumeVideo} style={{ display: state.kind === "search" ? "none" : undefined }}>
        <div id="reader" />
        <div className="reticle"><i /><i /><i /><i /><span className="scanline" /></div>
        <div className="hint">Hold the code inside the frame.<br />It scans automatically.</div>
        <AnimatePresence>
          {tone && <motion.div key={tone} className={`flash ${tone}`} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.85, 0.35] }} exit={{ opacity: 0 }} transition={{ duration: 0.5, times: [0, 0.3, 1] }} />}
        </AnimatePresence>
        {camera === "blocked" && state.kind !== "offline" && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", color: "rgba(255,255,255,.85)", padding: 24 }}><div><b>Camera not available</b><div style={{ fontSize: 13, marginTop: 6 }}>Allow camera access for this site, or find guests by name below.</div></div></div>}
        {state.kind === "checking" && <div className="checking"><Loader size={16} /> Checking</div>}
        {state.kind === "offline" && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><Illustration name="no-signal" size={120} /></div>}
      </div>
      {state.kind === "search"
        ? <SearchByName event={event} onPick={(id) => submit({ invitation_id: id })} onCancel={dismiss} />
        : <div className="sc-foot"><Button size="lg" block onClick={() => { paused.current = true; setState({ kind: "search" }); }}>Find a guest by name</Button></div>}
      <AnimatePresence>
        {state.kind === "verdict" && <VerdictSheet key="v" v={state.v} onDismiss={dismiss} onAdmitAnyway={state.v.invitation_id ? () => submit({ invitation_id: state.v.invitation_id! }) : undefined} />}
        {state.kind === "offline" && (
          <motion.div key="off" className="sheet theme-dark" style={{ background: "#262220" }} {...sheetMotion}>
            <div className="verdict"><span className="badge-big" style={{ background: "#44403c" }}>{Icon.x}</span><div><h2>No connection</h2><div className="who">Scanning is paused. Hold the queue until this clears.</div></div></div>
            <div className="sheet-actions"><Button size="lg" onClick={dismiss}>Try again</Button></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const sheetMotion = { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" }, transition: { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.9 } };

function VerdictSheet({ v, onDismiss, onAdmitAnyway }: { v: Verdict; onDismiss: () => void; onAdmitAnyway?: () => void }) {
  const ok = v.result === "accepted";
  const tone = toneOf(v.result);
  const title = { accepted: "Admitted", exhausted: "Already in", unknown: "Not recognised", wrong_event: "Wrong event", closed: "Doors not open" }[v.result];
  const sub = { accepted: v.guest_name, exhausted: v.guest_name, unknown: "This code is not an invitation for this event. Check the guest list by name.", wrong_event: `${v.guest_name} is invited to a different event.`, closed: "Ask the coordinator to open the doors before scanning." }[v.result];
  return (
    <motion.div className={`sheet ${tone}`} {...sheetMotion}>
      <div className="verdict">
        <VerdictMark kind={tone} />
        <div><h2>{title}</h2><div className="who">{sub}</div></div>
      </div>
      {(ok || v.result === "exhausted") && v.capacity > 0 && (
        <div className={`dots ${ok ? "" : "bad"}`}>
          {Array.from({ length: v.capacity }).map((_, i) => (
            <motion.i key={i} className={i < v.admitted_count ? "on" : ""}
              initial={i < v.admitted_count ? { scale: 0.4 } : false} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.5 + i * 0.07 }} />
          ))}
          <span style={{ marginLeft: 6 }}>{ok ? `${v.admitted_count} of ${v.capacity} admitted` : `All ${v.capacity} admitted`}</span>
        </div>
      )}
      {v.result === "exhausted" && v.previous_scans.length > 0 && (
        <div className="history"><div className="kicker">Already admitted</div>{v.previous_scans.map((s, i) => <div key={i} className="h"><span className="mono">{fmtTime(s.at)}</span><span className="muted">by {s.by}{s.manual ? " (by name)" : ""}</span></div>)}</div>
      )}
      <div className="sheet-actions">
        {ok ? <Button size="lg" onClick={onDismiss}>Next guest</Button> : <><Button variant="ink" size="lg" onClick={onDismiss}>Dismiss</Button>{v.result === "exhausted" && onAdmitAnyway && <Button size="lg" onClick={onAdmitAnyway}>Admit anyway</Button>}</>}
      </div>
      {ok && <motion.div className="auto-bar" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 2.6, ease: "linear" }} />}
    </motion.div>
  );
}

function SearchByName({ event, onPick, onCancel }: { event: ScanEvent; onPick: (id: number) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const res = useQuery({ queryKey: ["scan-search", event.id, q], queryFn: () => api<ScanSearchRow[]>(`/api/scan/search/?event_id=${event.id}&q=${encodeURIComponent(q)}`), enabled: q.length >= 2 });
  return (
    <div className="stack" style={{ padding: "0 20px 20px", gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>Find a guest</h3><button className="btn btn-ghost btn-sm" onClick={onCancel}>Close</button></div>
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" />
      <p className="quiet" style={{ fontSize: 13 }}>Use this only when a card is lost or will not scan. Every admission made this way is flagged in the log.</p>
      {(res.data ?? []).map((r) => (
        <button key={r.id} type="button" className="choice" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }} onClick={() => onPick(r.id)} disabled={r.admitted_count >= r.capacity}>
          <span><b>{r.name}</b><div className="quiet mono" style={{ fontSize: 12 }}>{r.phone}</div></span><span className={`badge ${r.admitted_count >= r.capacity ? "badge-danger" : ""}`}>{r.admitted_count} of {r.capacity}</span>
        </button>
      ))}
      {q.length >= 2 && res.data?.length === 0 && <div className="quiet">No one by that name on this event's list.</div>}
      <Link to="#" onClick={(e) => { e.preventDefault(); onCancel(); }} style={{ fontSize: 13 }}>Back to scanning</Link>
    </div>
  );
}
