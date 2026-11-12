import { lazy, type ComponentType } from "react";

/**
 * React.lazy with a .preload() handle, so a page's code can be fetched before
 * anyone clicks (idle time, hover, the next onboarding step).
 *
 * After a deploy, a tab that was already open still points at the old chunk
 * names, which no longer exist. That import fails; we reload once to pick up
 * the new build instead of showing an error.
 */
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Failed to fetch/i;

export function lazyPage<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  let p: Promise<{ default: T }> | null = null;
  const load = () =>
    (p ??= factory().catch((e: Error) => {
      p = null;
      const last = Number(sessionStorage.getItem("ti.reloaded") || 0);
      if (STALE.test(String(e?.message)) && Date.now() - last > 15_000) {
        sessionStorage.setItem("ti.reloaded", String(Date.now()));
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw e;
    }));
  const C = lazy(load) as ReturnType<typeof lazy<T>> & { preload: () => Promise<unknown> };
  C.preload = () => load().catch(() => {});
  return C;
}

/** Run when the browser is idle, or soon after on Safari which has no requestIdleCallback. */
export function whenIdle(fn: () => void, timeout = 2000) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout }); else setTimeout(fn, 600);
}
