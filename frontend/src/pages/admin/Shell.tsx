import { useQuery } from "@tanstack/react-query";
import { NavLink, Navigate, Outlet, useNavigate, useParams } from "react-router-dom";
import { api, ws } from "../../api/client";
import type { Event } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Avatar, Button, CardStack, CardThumb, Logo, PageTransition } from "../../components/ui";
import "./admin.css";

export const Icon = {
  events: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M2.5 7h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  staff: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" /><path d="M3 13.5c.6-2.6 2.4-4 5-4s4.4 1.4 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  updown: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 6.5L8 3.5l3 3M5 9.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  download: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  filter: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 3.5h12l-4.5 5.5v4l-3-1.5V9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>,
  check: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M4 9.5l3.5 3.5L14 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  x: <svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  share: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="12" cy="3.5" r="1.8" stroke="currentColor" strokeWidth="1.4" /><circle cx="4" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" /><circle cx="12" cy="12.5" r="1.8" stroke="currentColor" strokeWidth="1.4" /><path d="M5.6 7.2l4.8-2.8M5.6 8.8l4.8 2.8" stroke="currentColor" strokeWidth="1.4" /></svg>,
};

export function useWorkspace() {
  const { slug = "" } = useParams();
  const { me } = useAuth();
  const membership = me?.memberships.find((m) => m.workspace.slug === slug) ?? null;
  return { slug, workspace: membership?.workspace ?? null, role: membership?.role ?? null, me };
}

export default function Shell() {
  const { slug, workspace, role, me } = useWorkspace();
  const { signOut } = useAuth();
  const nav = useNavigate();
  const { eventId } = useParams();
  const events = useQuery({ queryKey: ["events", slug], queryFn: () => api<{ results: Event[] }>(`${ws(slug)}/events/?page_size=100`), enabled: !!workspace });
  if (!me) return <Navigate to="/sign-in" replace />;
  if (!workspace) return <Navigate to="/" replace />;
  if (role === "door_staff") return <Navigate to="/scan" replace />;
  const current = eventId ? events.data?.results.find((e) => String(e.id) === eventId) : undefined;
  const season = events.data ? `${events.data.results.length} event${events.data.results.length === 1 ? "" : "s"} this season` : "";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Logo /><span>{workspace.name}<small>Workspace</small></span></div>
        <button className="switcher" onClick={() => nav(`/app/${slug}`)} title="All events">
          {current ? <CardThumb width={24} /> : <CardStack />}
          <span className="grow"><span className="t" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current ? current.name : "All events"}</span><span className="s">{current ? `${current.invitation_count} invitations` : season || "No events yet"}</span></span>
          <span className="quiet">{Icon.updown}</span>
        </button>
        <nav className="nav">
          <div className="kicker">Event</div>
          <NavLink to={`/app/${slug}`} end className="navitem">{Icon.events} Events</NavLink>
          <NavLink to={`/app/${slug}/staff`} className="navitem">{Icon.staff} Staff</NavLink>
          <NavLink to={`/app/${slug}/settings`} className="navitem">{Icon.settings} Settings</NavLink>
        </nav>
        <div className="foot">
          <Button variant="primary" block onClick={() => nav("/scan")}>Open scanner</Button>
          <div className="user"><Avatar initials={me.initials} round /><span className="grow">{me.full_name || me.email}<small>{role === "admin" ? "Admin" : "Coordinator"}</small></span><button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button></div>
        </div>
      </aside>
      <div className="main">
        <PageTransition><Outlet context={{ events: events.data?.results ?? [], refetchEvents: events.refetch }} /></PageTransition>
      </div>
    </div>
  );
}

export function Topbar({ crumbs, right, searchPlaceholder, onSearch }: { crumbs: (string | { to: string; label: string })[]; right?: React.ReactNode; searchPlaceholder?: string; onSearch?: (q: string) => void }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} className="row" style={{ gap: 8 }}>
            {i > 0 && <span>/</span>}
            {typeof c === "string" ? (i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>) : <NavLink to={c.to} style={{ color: "inherit" }}>{c.label}</NavLink>}
          </span>
        ))}
      </div>
      {searchPlaceholder && (
        <label className="search">{Icon.search}<input placeholder={searchPlaceholder} onChange={(e) => onSearch?.(e.target.value)} /><span className="kbd">⌘ K</span></label>
      )}
      {right}
    </div>
  );
}
