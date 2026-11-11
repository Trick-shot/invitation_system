import { motion, useReducedMotion } from "framer-motion";

/**
 * A tick that draws itself: the ring first, then the check, then a soft settle.
 * Stroke-drawn SVG rather than a Lottie file so it takes the theme colours, stays
 * crisp at any size, and costs nothing to load. Respects "reduce motion".
 */
export function DoneTick({ size = 120, tone = "success" }: { size?: number; tone?: "success" | "accent" }) {
  const reduce = useReducedMotion();
  const stroke = tone === "success" ? "var(--success)" : "var(--accent)";
  const fill = tone === "success" ? "var(--success-subtle)" : "var(--bg-accent-subtle)";
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden
      initial={reduce ? false : { scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3, ease }}
    >
      <motion.circle cx="60" cy="60" r="52" fill={fill}
        initial={reduce ? false : { scale: 0.6 }} animate={{ scale: 1 }} transition={{ duration: 0.45, ease, delay: 0.05 }} style={{ transformOrigin: "60px 60px" }} />
      <motion.circle cx="60" cy="60" r="52" stroke={stroke} strokeWidth="4" strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0, rotate: -90 }} animate={{ pathLength: 1, rotate: -90 }} transition={{ duration: 0.55, ease, delay: 0.1 }} style={{ transformOrigin: "60px 60px" }} />
      <motion.path d="M38 62 L53 76 L83 44" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease, delay: 0.55 }} />
      {!reduce && (
        <motion.circle cx="60" cy="60" r="52" stroke={stroke} strokeWidth="2"
          initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 1.18, opacity: 0 }} transition={{ duration: 0.6, ease: "easeOut", delay: 0.9 }} style={{ transformOrigin: "60px 60px" }} />
      )}
    </motion.svg>
  );
}
