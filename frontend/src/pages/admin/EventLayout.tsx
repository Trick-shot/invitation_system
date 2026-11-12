import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, ev, ws } from "../../api/client";
import type { Event } from "../../api/types";
import { Badge, Button, CardThumb, ErrorState, Skel, SkelPanel, SkelRows, Tabs, fmtDate, PageTransition, useToast } from "../../components/ui";
import { Topbar, useWorkspace } from "./Shell";
import { EditEventModal } from "./Events";
import { Suspense, useEffect, useState } from "react";
import { whenIdle } from "../../lazy";
import { preloadEventTabs } from "../../pages";

export function useEvent() {
  const { slug } = useWorkspace();
  const { eventId = "" } = useParams();
  const q = useQuery({ queryKey: ["event", slug, eventId], queryFn: () => api<Event>(`${ev(slug, eventId)}/`), enabled: !!eventId });
  return { slug, eventId, event: q.data, refetch: q.refetch, isLoading: q.isLoading, error: q.error as ApiError | null };
}

/**
 * Overview renders first. Once the browser is idle, fetch the code and the first
 * screen of data for every other tab, so switching tabs shows content, not a spinner.
 */
function usePrefetchTabs(slug: string, eventId: string, ready: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!ready) return;
    whenIdle(() => {
      preloadEventTabs();
      const base = ev(slug, eventId);
      const pf = (queryKey: unknown[], url: string, allow404 = false) =>
        qc.prefetchQuery({ queryKey, staleTime: 30_000, queryFn: () => api(url).catch((e: ApiError) => { if (allow404 && e.status === 404) return null; throw e; }) });
      pf(["invitations", slug, eventId, "", "", 1], `${base}/invitations/?page=1&page_size=50&filter=&q=`);
      pf(["template", slug, eventId], `${base}/template/`, true);
      pf(["message", slug, eventId], `${base}/message/`);
      pf(["scans-grouped", slug, eventId], `${base}/scans/guests/`);
      pf(["members", slug, 1], `${ws(slug)}/members/?page=1&page_size=50`);
    }, 1500);
  }, [ready, slug, eventId, qc]);
}

/** Placeholder for a tab whose code is still arriving. Same rhythm as a real tab: a toolbar, then a panel. */
export function TabSkeleton() {
  return <div className="stack" aria-hidden><div className="row" style={{ gap: 8 }}><Skel w={220} h={36} r={8} /><Skel w={90} h={32} r={16} /><Skel w={90} h={32} r={16} /></div><div className="panel"><SkelRows rows={5} /></div></div>;
}

export default function EventLayout() {
  const { slug, eventId, event, isLoading, error, refetch } = useEvent();
  const [editing, setEditing] = useState(false);
  const nav = useNavigate();
  const toast = useToast();
  usePrefetchTabs(slug, eventId, !!event);
  const gone = error?.status === 404 || error?.status === 403;
  useEffect(() => { if (gone) toast("That event no longer exists, or you do not have access to it", true); }, [gone]); // eslint-disable-line react-hooks/exhaustive-deps
  if (gone) return <Navigate to={`/app/${slug}`} replace />;
  const base = `/app/${slug}/events/${eventId}`;
  const tabs = [{ to: base, label: "Overview", end: true }, { to: `${base}/guests`, label: "Guests" }, { to: `${base}/template`, label: "Template" }, { to: `${base}/message`, label: "Message" }, { to: `${base}/staff`, label: "Staff" }, { to: `${base}/send`, label: "Send" }, { to: `${base}/scans`, label: "Scan log" }];
  const status = event?.status === "open" ? <Badge tone="success" dot>Doors open</Badge> : event?.status === "closed" ? <Badge dot>Closed</Badge> : <Badge dot>Draft</Badge>;
  return (
    <>
      <Topbar crumbs={[{ to: `/app/${slug}`, label: "Events" }, event?.name ?? "Event"]} searchPlaceholder="Search guests, phone or card number" right={event ? status : undefined}
        onSubmit={(q) => nav(`/app/${slug}/events/${eventId}/guests${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)}
        title={event?.name ?? "Event"} sub={event ? `${fmtDate(event.date, true)}${event.venue ? `, ${event.venue}` : ""}` : undefined} back={`/app/${slug}`} />
      <div className="content" style={{ paddingBottom: 0, gap: 16 }}>
        {error && !gone ? (
          <div className="panel"><ErrorState title="This event did not load" onRetry={() => refetch()} /></div>
        ) : isLoading || !event ? (
          <div className="stack" aria-hidden>
            <div className="event-head"><Skel w={44} h={58} r={6} /><div className="grow" style={{ display: "grid", gap: 8 }}><Skel w="45%" h={26} /><Skel w="30%" h={14} /></div></div>
            <div className="readiness">{["Template", "Message", "Guests", "People", "Arrived"].map((k) => <div key={k}><div className="kicker">{k}</div><Skel w={70} h={14} style={{ marginTop: 6 }} /></div>)}</div>
          </div>
        ) : (
          <>
            <div className="event-head">
              <CardThumb />
              <div className="grow"><h1 style={{ fontSize: 28 }}>{event.name}</h1><div className="muted">{fmtDate(event.date)}{event.venue ? `, ${event.venue}` : ""}</div></div>
              <div className="row" style={{ gap: 8 }}><Button onClick={() => setEditing(true)}>Edit event</Button><ExportButton slug={slug} eventId={eventId} /></div>
            </div>
            <EditEventModal open={editing} onClose={() => setEditing(false)} event={event} />
            <div className="readiness">
              <div><div className="kicker">Template</div>{event.has_template ? "Ready" : <span style={{ color: "var(--warning-text)" }}>Not set</span>}</div>
              <div><div className="kicker">Message</div>{event.has_message ? "Ready" : "Not set"}</div>
              <div><div className="kicker">Guests</div>{event.invitation_count} invitations</div>
              <div><div className="kicker">People</div>{event.people_expected} expected</div>
              <div><div className="kicker">Arrived</div>{event.people_arrived} of {event.people_expected}</div>
            </div>
          </>
        )}
        <div className="row" style={{ gap: 8, alignItems: "stretch" }}><div className="grow" style={{ minWidth: 0 }}><Tabs items={tabs} /></div>{event && <button className="m-only btn btn-ghost btn-sm" style={{ alignSelf: "center" }} onClick={() => setEditing(true)}>Edit</button>}</div>
      </div>
      <div className="content" style={{ paddingTop: 20 }}>
        {event ? <Suspense fallback={<TabSkeleton />}><PageTransition><Outlet /></PageTransition></Suspense> : !error && <SkelPanel h={260} />}
      </div>
    </>
  );
}

function ExportButton({ slug, eventId }: { slug: string; eventId: string }) {
  const run = async () => {
    const data = await api<{ results: { name: string; phone: string; capacity: number; admitted_count: number; card_status: string; view_count: number }[] }>(`${ev(slug, eventId)}/invitations/?page_size=1000`);
    const rows = [["name", "phone", "capacity", "admitted", "card", "views"], ...data.results.map((r) => [r.name, r.phone, r.capacity, r.admitted_count, r.card_status, r.view_count])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `guests-${eventId}.csv`; a.click();
  };
  return <Button onClick={run}>Export CSV</Button>;
}
