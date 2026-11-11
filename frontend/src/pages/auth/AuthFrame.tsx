import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** The centered auth layout from the Figma: blob above, one white card, nothing else. */
export function AuthFrame({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="auth-canvas">
      <div className="auth-wrap">
        <motion.img className="blob" src="/illustrations/blob.png" alt="" onError={(e) => e.currentTarget.classList.add("hidden")}
          initial={reduce ? false : { opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
        <motion.div className="auth-card" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}>
          {children}
        </motion.div>
      </div>
    </div>
  );
}
