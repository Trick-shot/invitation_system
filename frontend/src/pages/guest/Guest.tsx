/**
 * The guest's page: their card, how many people it admits, and how many have
 * already been scanned in. Figma: 03 Guest, "Card scan state A/B/C".
 *
 * Kept deliberately light. It imports nothing from the admin, so a guest on a
 * slow phone downloads this page and nothing else.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { PublicInvitation } from "../../api/types";
import "../../components/ui/ui.css";
import "./guest.css";

const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
const IOS = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(ua);
// Browsers inside other apps (WhatsApp, Instagram, Facebook, Android WebViews) cannot save files.
const IN_APP = /FBAN|FBAV|Instagram|Line\/|; wv\)|WhatsApp|Snapchat|TikTok|MicroMessenger/i.test(ua);

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const longDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

const Ill = ({ name }: { name: string }) => <img src={`/illustrations/${name}.png`} alt="" width={110} height={110} style={{ mixBlendMode: "multiply" }} onError={(e) => (e.currentTarget.style.visibility = "hidden")} />;
const DownloadIcon = <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ShareIcon = <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="12" cy="3.5" r="1.8" stroke="currentColor" strokeWidth="1.4" /><circle cx="4" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" /><circle cx="12" cy="12.5" r="1.8" stroke="currentColor" strokeWidth="1.4" /><path d="M5.6 7.2l4.8-2.8M5.6 8.8l4.8 2.8" stroke="currentColor" strokeWidth="1.4" /></svg>;

const Page = ({ children }: { children: ReactNode }) => <main className="guest">{children}</main>;
function Notice({ ill, title, children }: { ill: string; title: string; children: ReactNode }) {
  return <Page><div className="guest-notice"><Ill name={ill} /><h1>{title}</h1><p>{children}</p></div></Page>;
}

/**
 * Downloads the card once, reporting progress, and keeps it as a File so the
 * Save tap can hand it straight to the share sheet (Safari only allows that
 * right after a tap, with nothing to wait for).
 */
function useCard(url: string | null | undefined, token: string) {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let objectUrl = "";
    setFailed(false);
    (async () => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(String(res.status));
      const total = Number(res.headers.get("content-length")) || 0;
      let blob: Blob;
      if (res.body && total) {
        const reader = res.body.getReader();
        const parts: BlobPart[] = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value as BlobPart);
          got += value.length;
          if (alive) setPct(Math.min(99, Math.round((got / total) * 100)));
        }
        blob = new Blob(parts, { type: res.headers.get("content-type") || "image/jpeg" });
      } else {
        blob = await res.blob();
      }
      const type = blob.type || "image/jpeg";
      const ext = type.includes("png") ? "png" : "jpg";
      objectUrl = URL.createObjectURL(blob);
      // Decode before showing: the card appears whole, never painted in strips.
      const img = new Image();
      img.src = objectUrl;
      await img.decode().catch(() => {});
      if (!alive) return;
      setFile(new File([blob], `invitation-${token}.${ext}`, { type }));
      setSrc(objectUrl);
      setPct(100);
    })().catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, token, attempt]);
  return { file, src, pct, failed, retry: () => setAttempt((a) => a + 1) };
}

export default function Guest() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PublicInvitation | null>(null);
  const [offline, setOffline] = useState(false);
  const [bump, setBump] = useState(false);
  const lastCount = useRef<number | null>(null);

  const load = useCallback((poll = false) =>
    api<PublicInvitation>(`/api/i/${token}/${poll ? "?poll=1" : ""}`, { auth: false })
      .then((d) => {
        setOffline(false);
        if (lastCount.current !== null && d.admitted_count !== undefined && d.admitted_count !== lastCount.current) { setBump(true); setTimeout(() => setBump(false), 900); }
        if (d.admitted_count !== undefined) lastCount.current = d.admitted_count;
        setData(d);
      })
      .catch((e) => { if (e?.status === 404) setData({ state: "invalid" }); else if (!poll) setOffline(true); }), [token]);

  useEffect(() => { load(); }, [load]);
  // Keep the page true while the guest stands at the door: preparing cards are checked
  // often, scan progress every 15 seconds, and only while the page is on screen.
  useEffect(() => {
    if (!data) return;
    const preparing = data.state === "preparing";
    const waiting = data.state === "ready" && (data.admitted_count ?? 0) < (data.capacity ?? 0);
    if (!preparing && !waiting) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") load(!preparing); }, preparing ? 2500 : 15_000);
    const onShow = () => { if (document.visibilityState === "visible") load(true); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [data, load]);

  const card = useCard(data?.state === "ready" ? data.card_url : null, token);

  if (!data && offline) return <Notice ill="no-signal" title="No connection">Your card will appear as soon as your phone is back online. <button className="link-btn" onClick={() => load()}>Try again</button></Notice>;
  if (!data) return <Page><GuestSkeleton /></Page>;
  if (data.state === "invalid") return <Notice ill="broken-link" title="This invitation link is not valid">Check the link in your message, or ask whoever invited you to send it again.</Notice>;
  if (data.state === "preparing") return <Notice ill="hourglass" title="Your card is being prepared">This takes a few seconds. The page refreshes on its own.</Notice>;
  if (data.state === "finished") return <Notice ill="calendar" title="This event has finished">{data.event ? `${data.event.name} took place on ${longDate(data.event.date)}.` : "Thank you for coming."}</Notice>;

  const cap = data.capacity ?? 1;
  const n = data.admitted_count ?? 0;
  const left = Math.max(0, cap - n);
  const entries = data.entries ?? [];
  const lastAt = entries.length ? time(entries[entries.length - 1]) : "";
  const stage: "none" | "part" | "full" = n === 0 ? "none" : n < cap ? "part" : "full";

  return (
    <Page>
      <h1 className="guest-title">You are invited</h1>
      <div className="guest-card">
        {card.src ? (
          <img src={card.src} alt={`Invitation card for ${data.guest_name}`} className="guest-card-img" />
        ) : (
          <div className="guest-card-wait" role="status" aria-live="polite">
            {card.failed ? (
              <><b>The card did not finish loading</b><span>Your connection may be slow.</span><button className="btn btn-secondary" onClick={card.retry}>Try again</button></>
            ) : (
              <><div className="guest-progress"><span style={{ width: `${card.pct ?? 8}%` }} /></div><span>Loading your card{card.pct ? ` ${card.pct}%` : ""}</span></>
            )}
          </div>
        )}
      </div>
      <div className="guest-stub">
        <div><div className="guest-k">Admits</div><b>{people(cap)}</b></div>
        <div style={{ textAlign: "right" }}><div className="guest-k">Scanned</div><b>{n} of {cap}</b></div>
      </div>
      <div className={`guest-status ${stage} ${bump ? "bump" : ""}`} aria-live="polite">
        <div className="guest-status-head">
          {cap <= 10 && <span className="guest-dots" aria-hidden>{Array.from({ length: stage === "full" ? 1 : cap }, (_, i) => <i key={i} className={stage === "full" || i < n ? "on" : ""} />)}</span>}
          <b>{stage === "none" ? "Not scanned yet" : stage === "part" ? `${n} of ${cap} checked in` : "Already scanned"}</b>
        </div>
        <p>
          {stage === "none" && `This card lets in ${people(cap)}. ${cap === 1 ? "You are" : "Each person is"} counted when the code is scanned at the entrance.`}
          {stage === "part" && `${n === 1 ? "1 person" : `${n} people`} entered${lastAt ? `${n === 1 ? " at" : ", the last at"} ${lastAt}` : ""}. ${left} more can still enter with this card.`}
          {stage === "full" && `Checked in${lastAt ? ` at ${lastAt}` : ""}. This card admitted ${people(cap)} and cannot be used again.`}
        </p>
      </div>
      <SaveButton file={card.file} src={card.src} token={token} />
      {stage !== "full" && <ShareButton name={data.event?.name ?? "Invitation"} />}
      <p className="guest-foot">
        {stage === "none" && <>Show this at the entrance{data.event?.venue ? `, ${data.event.venue}` : ""}. This page updates when you are scanned.</>}
        {stage === "part" && `Show this at the entrance for the ${left === 1 ? "person" : "people"} still to come.`}
        {stage === "full" && "Welcome. Enjoy the celebration."}
      </p>
    </Page>
  );
}

function GuestSkeleton() {
  return (
    <div aria-hidden style={{ display: "contents" }}>
      <div className="skeleton" style={{ width: 170, height: 24, marginTop: 8 }} />
      <div className="guest-card"><div className="guest-card-wait"><div className="guest-progress"><span style={{ width: "8%" }} /></div></div></div>
      <div className="guest-stub"><div className="skeleton" style={{ width: 90, height: 30 }} /><div className="skeleton" style={{ width: 70, height: 30 }} /></div>
      <div className="skeleton" style={{ width: "100%", height: 76, borderRadius: 12 }} />
      <div className="skeleton" style={{ width: "100%", height: 56, borderRadius: 10 }} />
    </div>
  );
}

/**
 * Getting the card into the phone's gallery is different on every phone:
 *  - iPhone: the share sheet's "Save Image" puts it in Photos. A plain download only reaches Files.
 *  - Android Chrome: a download lands in Download, which the gallery shows as an album.
 *    (Android's share sheet has no "save" option, so we do not use it there.)
 *  - Browsers inside other apps cannot save files at all: show the card full screen
 *    and tell the guest to press and hold it, which works everywhere.
 *  - Computers: an ordinary download.
 */
function SaveButton({ file, src, token }: { file: File | null; src: string | null; token: string }) {
  const [hold, setHold] = useState(false);
  const [note, setNote] = useState("");
  const canShare = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const label = IOS ? "Save to Photos" : ANDROID ? "Save to gallery" : "Download card";
  const download = () => {
    const a = document.createElement("a");
    a.href = src!; a.download = file!.name; document.body.appendChild(a); a.click(); a.remove();
  };
  const save = async () => {
    if (!file || !src) return;
    if (IOS && canShare) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    if (IN_APP || (IOS && !canShare)) { setHold(true); return; }
    download();
    if (ANDROID) setNote("Saved to Downloads. Your gallery shows it in the Download album.");
  };
  return (
    <>
      <button className="btn btn-primary btn-xl btn-block" onClick={save} disabled={!file}>{file ? <>{DownloadIcon} {label}</> : <><span className="spinner" /> Preparing your card</>}</button>
      {note && <p className="guest-note" role="status">{note}</p>}
      {hold && src && (
        <div className="guest-hold" role="dialog" aria-modal aria-label="Save your card" onClick={() => setHold(false)}>
          <p>{IOS ? "Press and hold the card, then tap Save to Photos." : "Press and hold the card, then tap Download image."}</p>
          <img src={src} alt="Your invitation card" onClick={(e) => e.stopPropagation()} />
          {ANDROID && IN_APP && <a className="btn btn-secondary" href={`intent://${location.host}/i/${token}#Intent;scheme=https;package=com.android.chrome;end`} onClick={(e) => e.stopPropagation()}>Open in Chrome instead</a>}
          <button className="btn btn-secondary" onClick={() => setHold(false)}>Done</button>
        </div>
      )}
    </>
  );
}

function ShareButton({ name }: { name: string }) {
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: name, text: `${name}: ${url}`, url }); return; } catch { return; } }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${name}: ${url}`)}`, "_blank", "noopener");
  };
  return <button className="btn btn-secondary btn-xl btn-block" onClick={share}>{ShareIcon} Share on WhatsApp</button>;
}
