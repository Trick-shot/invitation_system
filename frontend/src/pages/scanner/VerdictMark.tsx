import { motion, useReducedMotion } from "framer-motion";

/**
 * The big mark on the verdict sheet. The disc fades in once the sheet has
 * arrived, then the glyph draws. Nothing shakes, bounces or ripples: the door
 * person reads it at a glance, and motion that keeps going reads as a glitch.
 */
export function VerdictMark({ kind, size = 96 }: { kind: "ok" | "bad" | "warn"; size?: number }) {
  const reduce = useReducedMotion();
  const color = kind === "ok" ? "var(--verdict-admitted)" : kind === "bad" ? "var(--verdict-full)" : "var(--verdict-unknown)";
  const ease = [0.22, 1, 0.36, 1] as const;
  const D = 0.42; // the sheet finishes sliding in at about 0.48 s
  const glyph = kind === "ok"
    ? <motion.path d="M38 62 L53 76 L83 44" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease, delay: D + 0.12 }} />
    : kind === "bad"
      ? <>
          <motion.path d="M42 42 L78 78" stroke="#fff" strokeWidth="7" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.2, ease, delay: D + 0.12 }} />
          <motion.path d="M78 42 L42 78" stroke="#fff" strokeWidth="7" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.2, ease, delay: D + 0.26 }} />
        </>
      : <>
          <motion.path d="M60 34 L60 68" stroke="#fff" strokeWidth="7" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease, delay: D + 0.12 }} />
          <motion.circle cx="60" cy="84" r="4.5" fill="#fff" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.18, ease, delay: D + 0.3 }} style={{ transformOrigin: "60px 84px" }} />
        </>;
  return (
    <motion.svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden
      initial={reduce ? false : { scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.22, ease, delay: reduce ? 0 : D - 0.1 }}>
      <circle cx="60" cy="60" r="52" fill={color} />
      {glyph}
    </motion.svg>
  );
}
