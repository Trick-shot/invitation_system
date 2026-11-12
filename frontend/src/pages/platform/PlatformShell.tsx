/** The platform owner's area: Workspaces and Earnings. SMS rates hang off Earnings. */
import { Suspense } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { Avatar, Logo, PageTransition, SkelPanel } from "../../components/ui";
import "../admin/admin.css";
import "./platform.css";

export default function PlatformShell() {
  const { me, signOut } = useAuth();
  const { pathname } = useLocation();
  // Workspaces stays highlighted on a workspace's own page.
  const onWorkspaces = pathname === "/platform" || pathname.startsWith("/platform/workspaces");
  if (!me) return <Navigate to="/sign-in" replace />;
  if (!me.is_platform_owner) return <Navigate to="/" replace />;
  return (
    <div className="shell">
      <aside className="sidebar platform-side">
        <div className="brand"><Logo /><span>Trickshot<small>Platform</small></span></div>
        <nav className="nav">
          <NavLink end to="/platform" className={() => `navitem ${onWorkspaces ? "active" : ""}`}>Workspaces</NavLink>
          <NavLink to="/platform/earnings" className={({ isActive }) => `navitem ${isActive ? "active" : ""}`}>Earnings</NavLink>
        </nav>
        <div className="foot"><div className="user"><Avatar initials={me.initials} round /><span className="grow">{me.full_name || me.email}<small>Platform owner</small></span><button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button></div></div>
      </aside>
      <div className="main">
        <div className="content">
          <Suspense fallback={<SkelPanel h={300} />}><PageTransition><Outlet /></PageTransition></Suspense>
        </div>
      </div>
    </div>
  );
}
