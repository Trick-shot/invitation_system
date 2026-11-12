/**
 * Loading, error and empty-ish states shared by every page, so each screen
 * answers the same three questions the same way: is it coming, did it fail,
 * and what can I do about it.
 *
 * Rule from the Figma loading frame: numbers are never shown as zero while
 * loading. A zero reads as real data, so loading shows grey bars instead.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

/** Full-screen loader. Same markup and classes as the boot screen in index.html, so the hand-over is seamless. */
export function PageLoader() {
  return (
    <div className="boot" role="status" aria-label="Loading">
      <div className="boot-in">
        <svg className="boot-mark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h16a2 2 0 0 1 2 2v3.2a2.8 2.8 0 0 0 0 5.6V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3.2a2.8 2.8 0 0 0 0-5.6V6a2 2 0 0 1 2-2z" fill="#6341a8" />
          <rect x="6.5" y="8.5" width="6" height="6" rx="1" stroke="#fff" strokeWidth="1.6" fill="none" />
          <rect x="8.6" y="10.6" width="1.8" height="1.8" fill="#fff" />
          <rect x="15" y="8.5" width="3" height="1.8" rx=".6" fill="#fff" /><rect x="15" y="12.7" width="3" height="1.8" rx=".6" fill="#fff" />
          <circle cx="16.5" cy="17" r="1.4" fill="#d8ee3f" />
        </svg>
        <div className="boot-bar" />
        <div className="boot-name">Trickshot Invitations</div>
      </div>
    </div>
  );
}

const useOnline = () => {
  const [on, setOn] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => { const u = () => setOn(true), d = () => setOn(false); addEventListener("online", u); addEventListener("offline", d); return () => { removeEventListener("online", u); removeEventListener("offline", d); }; }, []);
  return on;
};

/** Something failed to load. Always says what, and always offers a way forward. */
export function ErrorState({ title = "This did not load", onRetry, compact, children }: { title?: string; onRetry?: () => void; compact?: boolean; children?: ReactNode }) {
  const online = useOnline();
  // Coming back online is the most common fix; retry for them.
  useEffect(() => { if (online && onRetry) onRetry(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="state-error" role="alert" style={compact ? { padding: 20 } : undefined}>
      <div className="state-icon" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="M11 6.5v5.5M11 15.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </div>
      <h3>{online ? title : "You are offline"}</h3>
      <p>{online ? (children ?? "Check your connection and try again. Nothing you saved is lost.") : "This will load again by itself as soon as your connection is back."}</p>
      {onRetry && online && <button className="btn btn-secondary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export const Skel = ({ w, h = 14, r, style }: { w?: number | string; h?: number; r?: number; style?: CSSProperties }) => (
  <div className="skeleton" style={{ width: w ?? "100%", height: h, borderRadius: r, ...style }} />
);

/** Stat tiles: label bar plus a big value bar, never a zero. */
export function SkelStats({ n = 4 }: { n?: number }) {
  return <div className="stats">{Array.from({ length: n }, (_, i) => <div key={i} className="stat"><Skel w="45%" h={12} /><Skel w="35%" h={30} style={{ marginTop: 12 }} /><Skel w="70%" h={11} style={{ marginTop: 10 }} /></div>)}</div>;
}

/** A table-shaped placeholder: avatar + name, then short cells. */
export function SkelRows({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="skel-rows" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row">
          {avatar && <Skel w={32} h={32} r={16} />}
          <div className="grow" style={{ display: "grid", gap: 6 }}><Skel w={`${50 - (i % 3) * 8}%`} h={13} /><Skel w="30%" h={10} /></div>
          <Skel w={64} h={20} r={10} />
        </div>
      ))}
    </div>
  );
}

export function SkelPanel({ h = 220, title = true }: { h?: number; title?: boolean }) {
  return <div className="panel panel-pad" aria-hidden>{title && <Skel w={180} h={16} style={{ marginBottom: 16 }} />}<Skel h={h} r={8} /></div>;
}

/**
 * Renders a query's three states. Keeps showing old data while refetching, so a
 * background refresh never flashes the skeleton again.
 */
export function Async<T>({ q, skeleton, error, children }: { q: UseQueryResult<T>; skeleton: ReactNode; error?: string; children: (data: T) => ReactNode }) {
  if (q.data !== undefined) return <>{children(q.data)}</>;
  if (q.isError) return <ErrorState title={error} onRetry={() => q.refetch()} />;
  return <>{skeleton}</>;
}

/**
 * An image that appears whole or not at all. Big JPEGs otherwise paint in
 * strips from the top on a slow phone connection, which looks broken. Space
 * is reserved with the known aspect ratio, a loader sits in it, and the image
 * fades in once it is fully downloaded and decoded.
 */
export function WholeImage({ src, alt, ratio, label, className = "", style, imgStyle, draggable }: { src: string; alt: string; ratio?: number; label?: string; className?: string; style?: CSSProperties; imgStyle?: CSSProperties; draggable?: boolean }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setReady(false); setFailed(false); }, [src]);
  const shown = (img: HTMLImageElement) => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).finally(() => setReady(true)); };
  const url = attempt ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt}` : src;
  return (
    <div className={`whole-img ${className}`} style={{ position: "relative", aspectRatio: ratio ? String(ratio) : undefined, ...style }}>
      {!ready && (
        <div className="whole-img-wait" aria-live="polite">
          {failed
            ? <><span>The image did not load.</span><button className="btn btn-secondary btn-sm" onClick={() => { setFailed(false); setAttempt((a) => a + 1); }}>Try again</button></>
            : <><div className="spinner" />{label && <span>{label}</span>}</>}
        </div>
      )}
      <img key={url} src={url} alt={alt} draggable={draggable} className={`img-wait ${ready ? "img-ready" : ""}`} style={{ display: "block", width: "100%", height: ratio ? "100%" : undefined, ...imgStyle }}
        ref={(el) => { if (el && el.complete && el.naturalWidth && !ready) shown(el); }}
        onLoad={(e) => shown(e.currentTarget)} onError={() => setFailed(true)} />
    </div>
  );
}
