import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

export const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Wrap an <Outlet/> with this: each route change fades the old page out and
 * rises the new one in. Keyed on the pathname so tab switches animate too.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={pathname} style={{ display: "contents" }}
        initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4 }}
        transition={{ duration: 0.22, ease: EASE }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * A number that counts from its previous value to the new one. Used for KPI tiles so
 * the dashboard feels live rather than pasted in. Tabular figures keep the width steady.
 */
export function CountUp({ value, duration = 0.9, format }: { value: number; duration?: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const prev = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setShown(value); prev.current = value; return; }
    const ctrl = animate(prev.current, value, { duration, ease: EASE, onUpdate: (v) => setShown(v) });
    prev.current = value;
    return () => ctrl.stop();
  }, [value, duration, reduce]);
  const n = Number.isInteger(value) ? Math.round(shown) : Math.round(shown * 10) / 10;
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{format ? format(n) : n.toLocaleString()}</span>;
}

/** Staggered entrance for a list of siblings (panels, rows, cards). */
export function Stagger({ children, gap = 0.045, className, style }: { children: ReactNode; gap?: number; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} style={style} initial={reduce ? false : "hidden"} animate="show"
      variants={{ show: { transition: { staggerChildren: gap, delayChildren: 0.05 } } }}>
      {children}
    </motion.div>
  );
}
export const riseIn = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } };
export function Rise({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <motion.div className={className} style={style} variants={riseIn}>{children}</motion.div>;
}
