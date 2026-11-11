import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api, ApiError, ws } from "../../api/client";
import type { Event, EventKind } from "../../api/types";
import { Badge, Button, Chip, Empty, Field, Input, Modal, Track, fmtDate, useToast, CountUp } from "../../components/ui";
import { Topbar, useWorkspace } from "./Shell";

const statusBadge = (s: Event["status"]) => s === "open" ? <Badge tone="success" dot>Doors open</Badge> : s === "draft" ? <Badge dot>Draft</Badge> : <Badge dot>Closed</Badge>;

export default function Events() {
  const { slug, workspace } = useWorkspace();
  const { events } = useOutletContext<{ events: Event[] }>();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(`banner:${slug}`) === "1");
  const groups = [["Happening now", events.filter((e) => e.status === "open")], ["Coming up", events.filter((e) => e.status === "draft")], ["Finished", events.filter((e) => e.status === "closed")]] as const;
  const needsSetup = events.some((e) => !e.has_template);

  return (
    <>
      <Topbar crumbs={["Events"]} searchPlaceholder="Search events" right={<Button variant="primary" onClick={() => setOpen(true)}>New event</Button>} />
      <div className="content">
        <div className="page-head"><div><h1>Events</h1><p className="muted">{workspace?.name} workspace</p></div></div>
        {events.length > 0 && needsSetup && !dismissed && (
          <div className="banner">
            <div><b>An event still needs its card template</b><div className="muted" style={{ fontSize: 13 }}>Guests cannot receive invitations until the QR slot is placed.</div></div>
            <div className="row" style={{ gap: 8 }}><Button onClick={() => { const e = events.find((x) => !x.has_template); if (e) nav(`/app/${slug}/events/${e.id}/template`); }}>Finish setup</Button><Button variant="ghost" onClick={() => { localStorage.setItem(`banner:${slug}`, "1"); setDismissed(true); }}>Dismiss</Button></div>
          </div>
        )}
        {events.length === 0 ? (
          <div className="panel"><Empty illustration="empty-box" title="No events yet" action={<Button variant="primary" onClick={() => setOpen(true)}>Create your first event</Button>}>An event holds a card template, a guest list and a message. Create one and we will walk you through the rest.</Empty></div>
        ) : groups.map(([label, list]) => list.length > 0 && (
          <section key={label} className="stack">
            <div className="kicker">{label}</div>
            {list.map((e) => (
              <div key={e.id} className="event-card" onClick={() => nav(`/app/${slug}/events/${e.id}`)}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div><h3>{e.name}</h3><div className="muted">{fmtDate(e.date)}{e.venue ? `, ${e.venue}` : ""}</div></div>
                  {statusBadge(e.status)}
                </div>
                <div className="nums">
                  <div><div className="kicker">Invitations</div><div className="value"><CountUp value={e.invitation_count} /></div></div>
                  <div><div className="kicker">People expected</div><div className="value"><CountUp value={e.people_expected} /></div></div>
                  <div><div className="kicker">Arrived</div><div className="value"><CountUp value={e.people_arrived} /></div></div>
                </div>
                <Track value={e.people_arrived} max={e.people_expected} />
              </div>
            ))}
          </section>
        ))}
      </div>
      <NewEventModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function NewEventModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (e: Event) => void }) {
  const { slug } = useWorkspace();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", date: "", start_time: "", venue: "", kind: "wedding" as EventKind });
  const [err, setErr] = useState<ApiError | null>(null);
  const m = useMutation({
    mutationFn: () => api<Event>(`${ws(slug)}/events/`, { method: "POST", body: { ...form, start_time: form.start_time || null } }),
    onSuccess: (e) => { qc.invalidateQueries({ queryKey: ["events", slug] }); onClose(); toast(`${e.name} created`); onCreated ? onCreated(e) : nav(`/app/${slug}/events/${e.id}`); },
    onError: (e) => setErr(e as ApiError),
  });
  const kinds: [EventKind, string][] = [["wedding", "Wedding"], ["communion", "Communion"], ["graduation", "Graduation"], ["other", "Something else"]];
  return (
    <Modal open={open} onClose={onClose} title="New event" sub="Name, date and place. Everything else comes after."
      actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="ink" loading={m.isPending} onClick={() => m.mutate()} disabled={!form.name || !form.date}>Create event</Button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Event name" error={err?.field("name")}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kimaro Wedding" autoFocus /></Field>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <Field label="Date" error={err?.field("date")}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Start time"><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
        </div>
        <Field label="Venue"><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Kunduchi Beach Hotel" /></Field>
        <Field label="Kind of event"><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{kinds.map(([k, l]) => <Chip key={k} on={form.kind === k} onClick={() => setForm({ ...form, kind: k })}>{l}</Chip>)}</div></Field>
      </div>
    </Modal>
  );
}
