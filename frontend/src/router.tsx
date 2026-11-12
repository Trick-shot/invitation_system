import { Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router-dom";
import { homeFor, useAuth } from "./auth/AuthProvider";
import { PageLoader } from "./components/ui/states";
import * as P from "./pages";

/** Full-screen pages wait on the branded loader; it matches the boot screen, so first load never flashes blank. */
const Page = ({ children }: { children: ReactNode }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;

function ErrorPage() {
  return (
    <div className="auth-canvas"><div className="auth-card"><h1>Something went wrong</h1><p className="muted">The page hit an error. Reload to try again; if it keeps happening, tell Trickshot what you were doing.</p><div className="row" style={{ marginTop: 16, gap: 8 }}><button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button><a className="btn btn-ghost" href="/">Go to the start</a></div></div></div>
  );
}

function Home() {
  const { me, loading } = useAuth();
  if (loading) return <PageLoader />;
  return <Navigate to={me ? homeFor(me) : "/sign-in"} replace />;
}
function RequireAuth() {
  const { me, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <PageLoader />;
  // The door team arrives at /scan; send them to their own sign-in, not the admin one.
  return me ? <Outlet /> : <Navigate to={pathname.startsWith("/scan") ? "/staff" : "/sign-in"} replace state={{ from: pathname }} />;
}
function NoWorkspace() {
  const { signOut } = useAuth();
  return <div className="auth-canvas"><div className="auth-card"><h1>No workspace yet</h1><p className="muted">Your account is not a member of any workspace. Ask the person who invited you to send a new link, or sign in with a different account.</p><div style={{ marginTop: 16 }}><button className="btn btn-secondary" onClick={signOut}>Sign out</button></div></div></div>;
}

export const router = createBrowserRouter([
  { path: "/", element: <Home />, errorElement: <ErrorPage /> },
  { path: "/sign-in", element: <Page><P.SignIn /></Page>, errorElement: <ErrorPage /> },
  { path: "/staff", element: <Page><P.SignIn staff /></Page>, errorElement: <ErrorPage /> },
  { path: "/forgot", element: <Page><P.Forgot /></Page> },
  { path: "/create-account", element: <Page><P.CreateAccount /></Page> },
  { path: "/set-password/:token", element: <Page><P.SetPassword /></Page> },
  { path: "/i/:token", element: <Page><P.Guest /></Page>, errorElement: <ErrorPage /> },
  { element: <RequireAuth />, errorElement: <ErrorPage />, children: [
    { path: "/no-workspace", element: <NoWorkspace /> },
    { path: "/scan", element: <Page><P.Scanner /></Page> },
    { path: "/platform", element: <Page><P.Platform /></Page> },
    { path: "/app/:slug/onboarding/:step", element: <Page><P.Onboarding /></Page> },
    { path: "/app/:slug/onboarding/:eventId/:step", element: <Page><P.Onboarding /></Page> },
    { path: "/app/:slug", element: <Page><P.Shell /></Page>, children: [
      { index: true, element: <P.Events /> },
      { path: "staff", element: <P.StaffPage /> },
      { path: "settings", element: <P.Settings /> },
      { path: "events/:eventId", element: <P.EventLayout />, children: [
        { index: true, element: <P.Overview /> },
        { path: "guests", element: <P.Guests /> },
        { path: "template", element: <P.Template /> },
        { path: "message", element: <P.Message /> },
        { path: "staff", element: <P.StaffPanel /> },
        { path: "send", element: <P.Send /> },
        { path: "scans", element: <P.ScanLog /> },
      ] },
    ] },
  ] },
  { path: "*", element: <Navigate to="/" replace /> },
]);
