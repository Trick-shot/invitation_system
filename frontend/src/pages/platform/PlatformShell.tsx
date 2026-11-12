/** The platform owner's area: Workspaces, Earnings, Settings. SMS rates open from Earnings and Settings. */
import { Suspense, useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { Avatar, Logo, PageTransition, SkelPanel, useScrollLock } from "../../components/ui";
import { Icon } from "../admin/Shell";
import "../admin/admin.css";
import "./platform.css";

const titleOf = (p: string) => (p.startsWith("/platform/earnings") ? "Earnings" : p === "/platform/rates" ? "SMS rates" : p === "/platform/settings" ? "Settings" : "Workspaces");

export default function PlatformShell() {
  const { me, signOut } = useAuth();
  const { pathname } = useLocation();
  // On a phone the sidebar is a drawer, opened from the bar at the top, exactly as in a workspace.
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [pathname]);
  useScrollLock(drawer);
  // Workspaces stays highlighted on a workspace's own page.
  const onWorkspaces = pathname === "/platform" || pathname.startsWith("/platform/workspaces");
  if (!me) return <Navigate to="/sign-in" replace />;
  if (!me.is_platform_owner) return <Navigate to="/" replace />;
  return (
    <div className="shell">
      <div className={`drawer-scrim ${drawer ? "open" : ""}`} aria-hidden onClick={() => setDrawer(false)} />
      <aside className={`sidebar platform-side ${drawer ? "open" : ""}`}>
        <button className="drawer-close btn btn-ghost btn-sm" onClick={() => setDrawer(false)} aria-label="Close menu">{Icon.x}</button>
        <div className="brand"><Logo /><span>Trickshot<small>Platform</small></span></div>
        <nav className="nav">
          <NavLink end to="/platform" className={() => `navitem ${onWorkspaces ? "active" : ""}`}>Workspaces</NavLink>
          <NavLink to="/platform/earnings" className={({ isActive }) => `navitem ${isActive || pathname === "/platform/rates" ? "active" : ""}`}>Earnings</NavLink>
          <NavLink to="/platform/settings" className={({ isActive }) => `navitem ${isActive ? "active" : ""}`}>Settings</NavLink>
        </nav>
        <div className="foot"><div className="user"><Avatar initials={me.initials} round /><span className="grow">{me.full_name || me.email}<small>Platform owner</small></span><button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button></div></div>
      </aside>
      <div className="main">
        <div className="topbar m-only">
          <div className="m-bar">
            <span style={{ width: 4 }} />
            <div className="grow" style={{ minWidth: 0 }}><div className="m-title">{titleOf(pathname)}</div><div className="m-sub">Trickshot platform</div></div>
            <button className="m-btn" aria-label="Menu" onClick={() => setDrawer(true)}>{Icon.menu}</button>
          </div>
        </div>
        <div className="content">
          <Suspense fallback={<SkelPanel h={300} />}><PageTransition><Outlet /></PageTransition></Suspense>
        </div>
      </div>
    </div>
  );
}
