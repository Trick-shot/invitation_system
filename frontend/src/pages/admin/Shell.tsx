import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
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
  qr: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M12 2.5h2.5a1 1 0 0 1 1 1V6M15.5 12v2.5a1 1 0 0 1-1 1H12M6 15.5H3.5a1 1 0 0 1-1-1V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><rect x="5.5" y="5.5" width="3" height="3" rx=".6" fill="currentColor" /><rect x="9.5" y="5.5" width="3" height="3" rx=".6" fill="currentColor" /><rect x="5.5" y="9.5" width="3" height="3" rx=".6" fill="currentColor" /><path d="M9.5 9.5h1.2v1.2H9.5zM11.3 11.3h1.2v1.2h-1.2z" fill="currentColor" /></svg>,
  chevron: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  menu: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  back: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>,
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
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [pathname]);
  const season = events.data ? `${events.data.results.length} event${events.data.results.length === 1 ? "" : "s"} this season` : "";

  return (
    <div className="shell">
      <AnimatePresence>{drawer && <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={() => setDrawer(false)} />}</AnimatePresence>
      <aside className={`sidebar ${drawer ? "open" : ""}`}>
        <button className="drawer-close btn btn-ghost btn-sm" onClick={() => setDrawer(false)} aria-label="Close menu">{Icon.x}</button>
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
          <Button variant="primary" block onClick={() => nav("/scan")}><span className="row" style={{ gap: 8, justifyContent: "center" }}>{Icon.qr} Open scanner</span></Button>
          <div className="user m-only"><Avatar initials={me.initials} round /><span className="grow">{me.full_name || me.email}<small>{role === "admin" ? "Admin" : "Coordinator"}</small></span><button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button></div>
        </div>
      </aside>
      <div className="main">
        <PageTransition depth={4}><Outlet context={{ events: events.data?.results ?? [], refetchEvents: events.refetch, openMenu: () => setDrawer(true) }} /></PageTransition>
      </div>
    </div>
  );
}

export function Topbar({ crumbs, right, searchPlaceholder, onSearch, title, sub, back }: { crumbs: (string | { to: string; label: string })[]; right?: React.ReactNode; searchPlaceholder?: string; onSearch?: (q: string) => void; title?: string; sub?: string; back?: string }) {
  const ctx = useOutletContext<{ openMenu?: () => void } | undefined>();
  const nav = useNavigate();
  return (
    <div className="topbar">
      <div className="m-bar">
        {back ? <button className="m-btn" aria-label="Back" onClick={() => nav(back)}>{Icon.back}</button> : <span style={{ width: 4 }} />}
        <div className="grow" style={{ minWidth: 0 }}><div className="m-title">{title ?? (typeof crumbs[crumbs.length - 1] === "string" ? (crumbs[crumbs.length - 1] as string) : (crumbs[crumbs.length - 1] as { label: string }).label)}</div>{sub && <div className="m-sub">{sub}</div>}</div>
        <button className="m-btn" aria-label="Menu" onClick={() => ctx?.openMenu?.()}>{Icon.menu}</button>
      </div>
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
      <UserMenu />
    </div>
  );
}


/** The signed-in person, top right, with a small menu. Lives in the top bar so the sidebar stays about the workspace. */
export function UserMenu() {
  const { me, signOut } = useAuth();
  const { slug, role } = useWorkspace();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("mousedown", h); document.addEventListener("keydown", k); return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); }; }, [open]);
  if (!me) return null;
  return (
    <div className="usermenu d-only" ref={ref}>
      <button className="usermenu-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar initials={me.initials} round /><span className="who"><span className="n">{me.full_name || me.email}</span><small>{role === "admin" ? "Admin" : "Coordinator"}</small></span><span className={`quiet chev ${open ? "up" : ""}`}>{Icon.chevron}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="usermenu-pop" role="menu" initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.14 }}>
            <div className="usermenu-head"><b>{me.full_name || "Your account"}</b><small>{me.email}</small></div>
            <button role="menuitem" onClick={() => { setOpen(false); nav(`/app/${slug}/settings`); }}>{Icon.settings} Workspace settings</button>
            <button role="menuitem" onClick={() => { setOpen(false); nav("/scan"); }}>{Icon.qr} Open scanner</button>
            <div className="usermenu-sep" />
            <button role="menuitem" onClick={() => { setOpen(false); signOut(); }}>Sign out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
