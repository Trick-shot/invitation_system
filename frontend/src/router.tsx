import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { homeFor, useAuth } from "./auth/AuthProvider";
import SignIn from "./pages/auth/SignIn";
import SetPassword from "./pages/auth/SetPassword";
import Shell from "./pages/admin/Shell";
import Events from "./pages/admin/Events";
import EventLayout from "./pages/admin/EventLayout";
import Overview from "./pages/admin/Overview";
import Guests from "./pages/admin/Guests";
import Template from "./pages/admin/Template";
import Message from "./pages/admin/Message";
import { StaffPanel } from "./pages/admin/Staff";
import StaffPage from "./pages/admin/Staff";
import Send from "./pages/admin/Send";
import ScanLog from "./pages/admin/ScanLog";
import Settings from "./pages/admin/Settings";

const Onboarding = lazy(() => import("./pages/onboarding/Onboarding"));
const Scanner = lazy(() => import("./pages/scanner/Scanner"));
const Guest = lazy(() => import("./pages/guest/Guest"));
const Platform = lazy(() => import("./pages/platform/Platform"));
const Lazy = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<div style={{ display: "grid", placeItems: "center", height: "100%" }}><div className="spinner" /></div>}>{children}</Suspense>;

function ErrorPage() {
  return (
    <div className="auth-canvas"><div className="auth-card"><h1>Something went wrong</h1><p className="muted">The page hit an error. Reload to try again; if it keeps happening, tell Trickshot what you were doing.</p><div style={{ marginTop: 16 }}><button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button></div></div></div>
  );
}

function Home() {
  const { me, loading } = useAuth();
  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "100%" }}><div className="spinner" /></div>;
  return <Navigate to={me ? homeFor(me) : "/sign-in"} replace />;
}
function RequireAuth() {
  const { me, loading } = useAuth();
  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "100%" }}><div className="spinner" /></div>;
  return me ? <Outlet /> : <Navigate to="/sign-in" replace />;
}
const NoWorkspace = () => <div className="auth-canvas"><div className="auth-card"><h1>No workspace yet</h1><p className="muted">Your account is not a member of any workspace. Ask the person who invited you to send a new link.</p></div></div>;

export const router = createBrowserRouter([
  { path: "/", element: <Home />, errorElement: <ErrorPage /> },
  { path: "/sign-in", element: <SignIn /> },
  { path: "/forgot", element: <div className="auth-canvas"><div className="auth-card"><h1>Reset your password</h1><p className="muted">Ask your workspace admin to resend your invite; it sets a new password.</p></div></div> },
  { path: "/set-password/:token", element: <SetPassword /> },
  { path: "/i/:token", element: <Lazy><Guest /></Lazy> },
  { element: <RequireAuth />, errorElement: <ErrorPage />, children: [
    { path: "/no-workspace", element: <NoWorkspace /> },
    { path: "/scan", element: <Lazy><Scanner /></Lazy> },
    { path: "/platform", element: <Lazy><Platform /></Lazy> },
    { path: "/app/:slug/onboarding/:step", element: <OnboardingWrap /> },
    { path: "/app/:slug/onboarding/:eventId/:step", element: <OnboardingWrap /> },
    { path: "/app/:slug", element: <Shell />, children: [
      { index: true, element: <Events /> },
      { path: "staff", element: <StaffPage /> },
      { path: "settings", element: <Settings /> },
      { path: "events/:eventId", element: <EventLayout />, children: [
        { index: true, element: <Overview /> },
        { path: "guests", element: <Guests /> },
        { path: "template", element: <Template /> },
        { path: "message", element: <Message /> },
        { path: "staff", element: <StaffPanel /> },
        { path: "send", element: <Send /> },
        { path: "scans", element: <ScanLog /> },
      ] },
    ] },
  ] },
  { path: "*", element: <Navigate to="/" replace /> },
]);

function OnboardingWrap() { return <Lazy><Onboarding /></Lazy>; }
