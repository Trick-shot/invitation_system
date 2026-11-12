import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { ToastProvider } from "./components/ui";
import { router } from "./router";
import "./styles/base.css";
import { ErrorBoundary, initMonitoring } from "./monitoring";

initMonitoring();

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallback={<CrashScreen />}>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

function CrashScreen() {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 360 }}>
        <h2>Something went wrong on this page</h2>
        <p className="muted" style={{ margin: "8px 0 20px" }}>We have been told about it. Reload to carry on; nothing you saved is lost.</p>
        <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>Reload</button>
      </div>
    </div>
  );
}
