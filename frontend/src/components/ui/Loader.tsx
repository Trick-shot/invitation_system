import { motion, useReducedMotion } from "framer-motion";

/**
 * Same family as DoneTick: a ring whose arc chases itself. Used while a file is being
 * read or a list is being checked. Keeps the label next to the ring so the person knows
 * what is happening, not just that something is.
 */
export function Loader({ size = 56, label, sub, tone = "accent" }: { size?: number; label?: string; sub?: string; tone?: "accent" | "success" }) {
  const reduce = useReducedMotion();
  const stroke = tone === "success" ? "var(--success)" : "var(--accent)";
  return (
    <div className="loader" role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
      <motion.svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden
        animate={reduce ? undefined : { rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }} style={{ transformOrigin: "28px 28px" }}>
        <circle cx="28" cy="28" r="23" stroke="var(--border-default)" strokeWidth="4" />
        <motion.circle cx="28" cy="28" r="23" stroke={stroke} strokeWidth="4" strokeLinecap="round"
          initial={{ pathLength: 0.25 }} animate={reduce ? undefined : { pathLength: [0.15, 0.6, 0.15] }} transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }} style={{ rotate: -90, transformOrigin: "28px 28px" }} />
      </motion.svg>
      {label && <b style={{ fontSize: 15 }}>{label}</b>}
      {sub && <span className="muted" style={{ fontSize: 13, maxWidth: 360 }}>{sub}</span>}
    </div>
  );
}
