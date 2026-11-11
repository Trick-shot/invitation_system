import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { api, ev } from "../../api/client";
import type { Event } from "../../api/types";
import { Badge, Button, CardThumb, Tabs, fmtDate, PageTransition } from "../../components/ui";
import { Topbar, useWorkspace } from "./Shell";

export function useEvent() {
  const { slug } = useWorkspace();
  const { eventId = "" } = useParams();
  const q = useQuery({ queryKey: ["event", slug, eventId], queryFn: () => api<Event>(`${ev(slug, eventId)}/`), enabled: !!eventId });
  return { slug, eventId, event: q.data, refetch: q.refetch, isLoading: q.isLoading, error: q.error };
}

export default function EventLayout() {
  const { slug, eventId, event, isLoading, error } = useEvent();
  if (error) return <Navigate to={`/app/${slug}`} replace />;
  const base = `/app/${slug}/events/${eventId}`;
  const tabs = [{ to: base, label: "Overview", end: true }, { to: `${base}/guests`, label: "Guests" }, { to: `${base}/template`, label: "Template" }, { to: `${base}/message`, label: "Message" }, { to: `${base}/staff`, label: "Staff" }, { to: `${base}/send`, label: "Send" }, { to: `${base}/scans`, label: "Scan log" }];
  const status = event?.status === "open" ? <Badge tone="success" dot>Doors open</Badge> : event?.status === "closed" ? <Badge dot>Closed</Badge> : <Badge dot>Draft</Badge>;
  return (
    <>
      <Topbar crumbs={[{ to: `/app/${slug}`, label: "Events" }, event?.name ?? "…"]} searchPlaceholder="Search guests, phone or card number" right={status}
        title={event?.name ?? "…"} sub={event ? `${fmtDate(event.date, true)}${event.venue ? `, ${event.venue}` : ""}` : undefined} back={`/app/${slug}`} />
      <div className="content" style={{ paddingBottom: 0, gap: 16 }}>
        {isLoading || !event ? (
          <div className="stack"><div className="skeleton" style={{ height: 36, width: 380 }} /><div className="skeleton" style={{ height: 62 }} /></div>
        ) : (
          <>
            <div className="event-head">
              <CardThumb />
              <div className="grow"><h1 style={{ fontSize: 28 }}>{event.name}</h1><div className="muted">{fmtDate(event.date)}{event.venue ? `, ${event.venue}` : ""}</div></div>
              <ExportButton slug={slug} eventId={eventId} />
            </div>
            <div className="readiness">
              <div><div className="kicker">Template</div>{event.has_template ? "Ready" : <span style={{ color: "var(--warning-text)" }}>Not set</span>}</div>
              <div><div className="kicker">Message</div>{event.has_message ? "Ready" : "Not set"}</div>
              <div><div className="kicker">Guests</div>{event.invitation_count} invitations</div>
              <div><div className="kicker">People</div>{event.people_expected} expected</div>
              <div><div className="kicker">Arrived</div>{event.people_arrived} of {event.people_expected}</div>
            </div>
          </>
        )}
        <Tabs items={tabs} />
      </div>
      <div className="content" style={{ paddingTop: 20 }}>
        <PageTransition><Outlet /></PageTransition>
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
