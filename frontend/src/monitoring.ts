import * as Sentry from "@sentry/react";

/**
 * Error reporting. Only active when the build was given VITE_SENTRY_DSN, so dev
 * and preview builds stay silent. No replays and no request bodies: the app
 * handles guest names and phone numbers, which have no business in Sentry.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initMonitoring() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? "production",
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Noise a user cannot cause or fix.
    ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications", "AbortError", "NotAllowedError"],
    beforeBreadcrumb(b) {
      // Breadcrumb URLs can carry invitation tokens; keep the path shape, drop the token.
      if (b.data?.url && typeof b.data.url === "string") b.data.url = b.data.url.replace(/\/i\/[A-Za-z0-9_-]+/, "/i/:token");
      return b;
    },
  });
}

export function identify(user: { id: number } | null, workspace?: string) {
  if (!dsn) return;
  Sentry.setUser(user ? { id: String(user.id) } : null);
  Sentry.setTag("workspace", workspace ?? "none");
}

export const ErrorBoundary = Sentry.ErrorBoundary;
