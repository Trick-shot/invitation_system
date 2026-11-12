import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * Toasts live at the app root, so they are part of the first download for every
 * page. Animated with CSS rather than framer-motion to keep that download small;
 * framer-motion only loads with the pages that use it.
 */
interface Toast { id: number; text: string; err?: boolean; leaving?: boolean }
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, err?: boolean) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, err }]);
    // Problems stay up longer: they usually carry a reason worth reading.
    const ms = err ? 7000 : 3300;
    setTimeout(() => setList((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t))), ms);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), ms + 250);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map((t) => <div key={t.id} className={`toast toast-css ${t.err ? "err" : ""} ${t.leaving ? "leaving" : ""}`} role={t.err ? "alert" : "status"}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
