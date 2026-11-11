export { Loader } from "./Loader";
export { DoneTick } from "./DoneTick";
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  return (
    <div className={`stat ${active ? "active" : ""}`}>
      <div className="kicker">{label}</div>
      <div className="value">{value}</div>
      {delta && <div className="delta" style={{ color }}>{delta}</div>}
    </div>
  );
}
export function Track({ value, max, tone }: { value: number; max: number; tone?: "ok" | "bad" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className={`track ${tone ?? ""}`}><i style={{ width: `${pct}%` }} /></div>;
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, sub, children, actions, wide }: { open: boolean; onClose: () => void; title: string; sub?: string; children?: ReactNode; actions?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div className="modal" style={wide ? { maxWidth: 760 } : undefined} role="dialog" aria-modal initial={{ y: 12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: 0.98 }} transition={{ duration: 0.18 }}>
            <h2>{title}</h2>
            {sub && <p className="sub">{sub}</p>}
            <div style={{ marginTop: 20 }}>{children}</div>
            {actions && <div className="modal-actions">{actions}</div>}
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
      {items.map((t) => <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? "on" : ""}`}>{t.label}</NavLink>)}
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

/* ---------- Toasts ---------- */
interface Toast { id: number; text: string; err?: boolean }
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, err?: boolean) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, err }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        <AnimatePresence>
          {list.map((t) => <motion.div key={t.id} className={`toast ${t.err ? "err" : ""}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{t.text}</motion.div>)}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- helpers ---------- */
export const fmtDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const relTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now"; if (d < 3600) return `${Math.floor(d / 60)} minutes ago`; if (d < 86400) return `${Math.floor(d / 3600)} hours ago`;
  return `${Math.floor(d / 86400)} days ago`;
};
