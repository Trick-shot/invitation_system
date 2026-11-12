import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Error reporting. Only active when the build was given VITE_SENTRY_DSN, so dev
 * and preview builds stay silent. No replays and no request bodies: the app
 * handles guest names and phone numbers, which have no business in Sentry.
 *
 * Sentry is loaded after the first paint, in its own chunk, so it never delays
 * the page a guest or a coordinator is waiting for. Errors raised before it
 * arrives are queued and sent once it is ready.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
type SentryMod = typeof import("@sentry/react");
let sentry: SentryMod | null = null;
const queue: unknown[] = [];
let who: { user: { id: number } | null; workspace?: string } | null = null;

const early = (e: ErrorEvent | PromiseRejectionEvent) => { if (!sentry) queue.push("reason" in e ? e.reason : e.error ?? e.message); };

export function initMonitoring() {
  if (!dsn) return;
  addEventListener("error", early);
  addEventListener("unhandledrejection", early);
  const start = () => import("@sentry/react").then((S) => {
    S.init({
      dsn,
      environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? "production",
      release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
      integrations: [S.browserTracingIntegration()],
      tracesSampleRate: 0.1,
      // Noise a user cannot cause or fix.
      ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications", "AbortError", "NotAllowedError"],
      beforeBreadcrumb(b) {
        // Breadcrumb URLs can carry invitation tokens; keep the path shape, drop the token.
        if (b.data?.url && typeof b.data.url === "string") b.data.url = b.data.url.replace(/\/i\/[A-Za-z0-9_-]+/, "/i/:token");
        return b;
      },
    });
    sentry = S;
    removeEventListener("error", early);
    removeEventListener("unhandledrejection", early);
    if (who) applyIdentity();
    queue.splice(0).forEach((e) => S.captureException(e));
  }).catch(() => { /* reporting is best-effort */ });
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(start, { timeout: 5000 }); else setTimeout(start, 2500);
}

function applyIdentity() {
  if (!sentry || !who) return;
  sentry.setUser(who.user ? { id: String(who.user.id) } : null);
  sentry.setTag("workspace", who.workspace ?? "none");
}

export function identify(user: { id: number } | null, workspace?: string) {
  if (!dsn) return;
  who = { user, workspace };
  applyIdentity();
}

export function report(err: unknown) {
  if (!dsn) return;
  if (sentry) sentry.captureException(err); else queue.push(err);
}

/** Catches render errors anywhere below it, reports them, and shows the fallback instead of a white page. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { report(Object.assign(error, { componentStack: info.componentStack })); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
