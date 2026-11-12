export { PageTransition, CountUp, Stagger, Rise, riseIn, EASE } from "./motion";
export { Loader } from "./Loader";
export { DoneTick } from "./DoneTick";
export { PageLoader, ErrorState, Skel, SkelStats, SkelRows, SkelPanel, Async, WholeImage } from "./states";
export { Pager, usePaged, usePageSize, pageList, rowNo, scrollToTable } from "./Pager";
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CountUp, riseIn, EASE } from "./motion";
import { MAX_CAPACITY } from "../../api/types";
import { NavLink } from "react-router-dom";
import "./ui.css";

/* ---------- Buttons ---------- */
type Variant = "primary" | "ink" | "secondary" | "ghost" | "danger";
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: "sm" | "md" | "lg" | "xl"; block?: boolean; loading?: boolean }
export function Button({ variant = "secondary", size = "md", block, loading, className = "", children, ...rest }: BtnProps) {
  return (
    <button className={`btn btn-${variant} ${size !== "md" ? `btn-${size}` : ""} ${block ? "btn-block" : ""} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" /> : children}
    </button>
  );
}
export const Chevron = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden><path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* ---------- Fields ---------- */
interface FieldProps { label?: string; hint?: string; error?: string; children: ReactNode; optional?: boolean }
export function Field({ label, hint, error, children, optional }: FieldProps) {
  return (
    <div className="field">
      {label && <label>{label} {optional && <span className="quiet" style={{ fontWeight: 400 }}>Optional</span>}</label>}
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
export function Input({ className = "", invalid, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} className={`input ${invalid ? "is-error" : ""} ${className}`} {...rest} />;
}
export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ${className}`} {...rest} />;
}

/* ---------- Badge / chip ---------- */
export function Badge({ tone = "neutral", dot, children }: { tone?: "neutral" | "success" | "danger" | "warning" | "accent"; dot?: boolean; children: ReactNode }) {
  return <span className={`badge ${tone !== "neutral" ? `badge-${tone}` : ""}`}>{dot && <span className="dot" />}{children}</span>;
}
export function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick?: () => void }) {
  return <button type="button" className={`chip ${on ? "on" : ""}`} onClick={onClick}>{children}</button>;
}

/* ---------- Avatar / marks ---------- */
export function Avatar({ initials, round, size }: { initials: string; round?: boolean; size?: "lg" }) {
  return <span className={`avatar ${round ? "round" : ""} ${size ?? ""}`}>{initials}</span>;
}
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Trickshot Invitations">
      <path d="M4 4h16a2 2 0 0 1 2 2v3.2a2.8 2.8 0 0 0 0 5.6V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3.2a2.8 2.8 0 0 0 0-5.6V6a2 2 0 0 1 2-2z" fill="var(--accent)" />
      <rect x="6.5" y="8.5" width="6" height="6" rx="1" stroke="var(--accent-on)" strokeWidth="1.6" fill="none" />
      <rect x="8.6" y="10.6" width="1.8" height="1.8" fill="var(--accent-on)" />
      <rect x="15" y="8.5" width="3" height="1.8" rx=".6" fill="var(--accent-on)" /><rect x="15" y="12.7" width="3" height="1.8" rx=".6" fill="var(--accent-on)" />
      <circle cx="16.5" cy="17" r="1.4" fill="var(--action)" />
    </svg>
  );
}
export function CardThumb({ width = 44 }: { width?: number }) {
  const h = (width * 60) / 44;
  return (
    <svg width={width} height={h} viewBox="0 0 44 60" aria-hidden style={{ flex: "none" }}>
      <rect x=".5" y=".5" width="43" height="59" rx="4" fill="var(--bg-surface)" stroke="var(--border-default)" />
      <rect x="0" y="0" width="44" height="5" rx="2" fill="var(--accent)" />
      <rect x="11" y="10" width="22" height="2" rx="1" fill="var(--text-secondary)" /><rect x="15" y="14" width="14" height="2" rx="1" fill="var(--border-strong)" /><rect x="13" y="18" width="18" height="2" rx="1" fill="var(--border-strong)" />
      <g fill="var(--text-primary)" transform="translate(15 30) scale(2)"><path d="M0 0h3v3H0zM1 1h1v1H1zM4 0h3v3H4zM5 1h1v1H5zM0 4h3v3H0zM1 5h1v1H1zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z" /></g>
    </svg>
  );
}
export function CardStack() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <rect x="4" y="6" width="16" height="22" rx="3" fill="var(--bg-surface)" stroke="var(--border-strong)" strokeWidth="1.5" transform="rotate(-8 12 17)" />
      <rect x="10" y="3" width="16" height="22" rx="3" fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

/* ---------- Stats ---------- */
export function Stat({ label, value, delta, tone, active }: { label: string; value: ReactNode; delta?: ReactNode; tone?: "success" | "danger" | "neutral"; active?: boolean }) {
  const color = tone === "success" ? "var(--success-text)" : tone === "danger" ? "var(--danger-text)" : "var(--text-secondary)";
  const shown = typeof value === "number" ? <CountUp value={value} /> : value;
  return (
    <motion.div className={`stat ${active ? "active" : ""}`} variants={riseIn}>
      <div className="kicker">{label}</div>
      <div className="value">{shown}</div>
      {delta && <div className="delta" style={{ color }}>{delta}</div>}
    </motion.div>
  );
}
export function Track({ value, max, tone }: { value: number; max: number; tone?: "ok" | "bad" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className={`track ${tone ?? ""}`}><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: EASE }} /></div>;
}

/* ---------- Modal ---------- */
const SHEET_QUERY = "(max-width: 820px)";
export function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(SHEET_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(SHEET_QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

/* Lock the page behind an open modal. iOS ignores overflow:hidden on body, so we pin it and restore the scroll position on close. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow };
    b.position = "fixed"; b.top = `-${y}px`; b.width = "100%"; b.overflow = "hidden";
    return () => { Object.assign(b, prev); window.scrollTo(0, y); };
  }, [active]);
}

export function Modal({ open, onClose, title, sub, children, actions, wide }: { open: boolean; onClose: () => void; title: string; sub?: string; children?: ReactNode; actions?: ReactNode; wide?: boolean }) {
  const phone = useIsPhone();
  useScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  // Phones get a sheet that slides up; a scaled pop looks wrong on a box pinned to the screen edge.
  // Backdrop and panel share one duration and curve, in and out, so neither appears or
  // vanishes ahead of the other. Eased slides, not springs: nothing overshoots.
  const IN = { duration: 0.3, ease: [0.32, 0.72, 0, 1] as const };
  const OUT = { duration: 0.22, ease: [0.4, 0, 1, 1] as const };
  const motionProps = phone
    ? { initial: { y: "100%" }, animate: { y: 0, transition: IN }, exit: { y: "100%", transition: OUT } }
    : { initial: { y: 12, opacity: 0 }, animate: { y: 0, opacity: 1, transition: IN }, exit: { y: 6, opacity: 0, transition: OUT } };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: IN }} exit={{ opacity: 0, transition: OUT }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div className={`modal ${phone ? "sheet" : ""}`} style={wide && !phone ? { maxWidth: 760 } : undefined} role="dialog" aria-modal {...motionProps}>
            {phone && <div className="sheet-handle" aria-hidden />}
            {/* When the same dialog changes step (view, edit, confirm), the old content fades out before the new fades in. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={title} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.16 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
                <h2>{title}</h2>
                {sub && <p className="sub">{sub}</p>}
                <div style={{ marginTop: 20 }}>{children}</div>
                {actions && <div className="modal-actions">{actions}</div>}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Tabs ---------- */
export function Tabs({ items }: { items: { to: string; label: string; end?: boolean }[] }) {
  return (
    <nav className="tabs">
      {items.map((t) => <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? "on" : ""}`}>{({ isActive }) => <>{t.label}{isActive && <motion.span className="tab-ink" layoutId="tab-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}</>}</NavLink>)}
    </nav>
  );
}

/* ---------- Empty ---------- */
export function Empty({ illustration, title, children, action }: { illustration: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="disc"><Illustration name={illustration} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
/** 3D renders exported from the Figma Assets page into /public/illustrations/<name>.png. Missing files render nothing. */
export function Illustration({ name, size = 110 }: { name: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <span style={{ width: size, height: size, display: "block" }} />;
  const dark = name === "scanner-phone" || name === "no-signal";
  return <img src={`/illustrations/${name}.png`} alt="" width={size} height={size} style={{ objectFit: "contain", mixBlendMode: dark ? "screen" : "multiply" }} onError={() => setOk(false)} />;
}

export { ToastProvider, useToast } from "./toast";

/* ---------- helpers ---------- */
export const fmtDate = (iso: string, short = false) => new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", short ? { day: "numeric", month: "short" } : { day: "numeric", month: "long", year: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const relTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (d < 60) return "just now"; if (d < 3600) return ago(Math.floor(d / 60), "minute"); if (d < 86400) return ago(Math.floor(d / 3600), "hour");
  return ago(Math.floor(d / 86400), "day");
};


/**
 * How many people one card admits. Quick chips for the common sizes, a number box for
 * larger groups (a family table, a bus of students). Value is always 1..MAX_CAPACITY.
 */
export function CapacityPicker({ value, onChange, compact }: { value: number; onChange: (n: number) => void; compact?: boolean }) {
  const quick = compact ? [1, 2, 3] : [1, 2, 3, 4];
  const clamp = (n: number) => Math.max(1, Math.min(MAX_CAPACITY, Math.round(n) || 1));
  // Hold the raw text while typing so "12" is not applied as 1 then 2.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
      {quick.map((n) => <button key={n} type="button" className={`chip ${value === n ? "on" : ""}`} style={compact ? { padding: "2px 8px" } : undefined} onClick={() => onChange(n)}>{n}{compact ? "" : n === 1 ? " person" : " people"}</button>)}
      <label className={`chip cap-more ${value > quick.length ? "on" : ""}`} style={compact ? { padding: "0 6px 0 8px" } : { padding: "0 6px 0 10px" }}>
        {!compact && <span>More</span>}
        <input type="number" min={1} max={MAX_CAPACITY} value={draft ?? (value > quick.length ? value : "")} placeholder={compact ? "#" : "5"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && !Number.isNaN(v)) onChange(clamp(v)); setDraft(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
      </label>
    </div>
  );
}
