import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Error reporting, logs, metrics, profiles and replays. Only active when the build
 * was given VITE_SENTRY_DSN, so dev and preview builds stay silent.
 *
 * The app handles guest names and phone numbers, which have no business in Sentry:
 * no request bodies, replays mask every piece of text and every input and block
 * images and video, and logs and metrics carry ids and outcomes only. Replays are
 * kept only when an error happens (the free plan has room for few), so a replay
 * shows the minute before something broke, not people browsing.
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
// Logs and metrics raised before Sentry has loaded wait here (a few, then oldest dropped).
const pending: ((S: SentryMod) => void)[] = [];
const later = (fn: (S: SentryMod) => void) => { if (sentry) { try { fn(sentry); } catch { /* best-effort */ } } else if (dsn) { pending.push(fn); if (pending.length > 50) pending.shift(); } };
const TOKEN = /\/i\/[A-Za-z0-9_-]{6,}/g;

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
      integrations: [
        S.browserTracingIntegration(),
        // Profiles need the page to be served with "Document-Policy: js-profiling" (nginx); Chrome and Edge only.
        S.browserProfilingIntegration(),
        S.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
        // console.warn and console.error become searchable Sentry Logs.
        S.consoleLoggingIntegration({ levels: ["warn", "error"] }),
      ],
      tracesSampleRate: 0.1,
      profileSessionSampleRate: 1.0,
      profileLifecycle: "trace",
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      beforeSendLog(log) {
        if (typeof log.message === "string") log.message = log.message.replace(TOKEN, "/i/:token");
        return log;
      },
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
    pending.splice(0).forEach((fn) => { try { fn(S); } catch { /* best-effort */ } });
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

type Attrs = Record<string, string | number | boolean>;

/** How many times something happened (Sentry metrics). Ids and outcomes only, never names or phones. */
export function count(name: string, value = 1, attributes?: Attrs) { later((S) => S.metrics.count(name, value, { attributes })); }
/** How long something took, in milliseconds (Sentry metrics, with percentiles). */
export function timing(name: string, ms: number, attributes?: Attrs) { later((S) => S.metrics.distribution(name, ms, { unit: "millisecond", attributes })); }
/** One line in Sentry Logs, for things worth reading later in order. */
export function logInfo(message: string, attributes?: Attrs) { later((S) => S.logger.info(message, attributes)); }
export function logWarn(message: string, attributes?: Attrs) { later((S) => S.logger.warn(message, attributes)); }

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
