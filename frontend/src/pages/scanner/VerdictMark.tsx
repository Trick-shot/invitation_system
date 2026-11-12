import { motion, useReducedMotion } from "framer-motion";

/**
 * The big mark on the verdict sheet. Same construction as DoneTick: the disc
 * grows, the ring draws, then the glyph draws, then a ripple leaves. The cross
 * also gets a short shake so a rejection feels different in the hand as well
 * as to the eye.
 */
export function VerdictMark({ kind, size = 96 }: { kind: "ok" | "bad" | "warn"; size?: number }) {
  const reduce = useReducedMotion();
  const color = kind === "ok" ? "var(--verdict-admitted)" : kind === "bad" ? "var(--verdict-full)" : "var(--verdict-unknown)";
  const ease = [0.22, 1, 0.36, 1] as const;
  const glyph = kind === "ok"
    ? <motion.path d="M38 62 L53 76 L83 44" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease, delay: 0.4 }} />
    : kind === "bad"
      ? <>
          <motion.path d="M42 42 L78 78" stroke="#fff" strokeWidth="7" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease, delay: 0.4 }} />
          <motion.path d="M78 42 L42 78" stroke="#fff" strokeWidth="7" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease, delay: 0.56 }} />
        </>
      : <>
          <motion.path d="M60 34 L60 68" stroke="#fff" strokeWidth="7" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, ease, delay: 0.4 }} />
          <motion.circle cx="60" cy="84" r="4.5" fill="#fff" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.2, ease, delay: 0.62 }} style={{ transformOrigin: "60px 84px" }} />
        </>;
  return (
    <motion.svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden
      initial={reduce ? false : { scale: 0.85, opacity: 0 }}
      animate={reduce ? { opacity: 1 } : kind === "bad" ? { scale: 1, opacity: 1, x: [0, -7, 7, -5, 5, 0] } : { scale: 1, opacity: 1 }}
      transition={kind === "bad" ? { scale: { duration: 0.3, ease }, opacity: { duration: 0.2 }, x: { duration: 0.45, delay: 0.5 } } : { duration: 0.3, ease }}>
      <motion.circle cx="60" cy="60" r="52" fill={color}
        initial={reduce ? false : { scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 24, delay: 0.02 }} style={{ transformOrigin: "60px 60px" }} />
      <motion.circle cx="60" cy="60" r="56" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.55"
        initial={reduce ? false : { pathLength: 0, rotate: -90 }} animate={{ pathLength: 1, rotate: -90 }} transition={{ duration: 0.5, ease, delay: 0.08 }} style={{ transformOrigin: "60px 60px" }} />
      {glyph}
      {!reduce && (
        <motion.circle cx="60" cy="60" r="56" stroke={color} strokeWidth="2"
          initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 1.35, opacity: 0 }} transition={{ duration: 0.7, ease: "easeOut", delay: 0.7 }} style={{ transformOrigin: "60px 60px" }} />
      )}
    </motion.svg>
  );
}
