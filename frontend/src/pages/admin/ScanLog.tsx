import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { api, ev } from "../../api/client";
import type { ScanAttempt, ScanGuestLog, ScanLogGrouped, StaffRef } from "../../api/types";
import { Badge, Chip, Empty, fmtTime } from "../../components/ui";
import { useEvent } from "./EventLayout";
import { Icon } from "./Shell";

/**
 * Scan log, grouped by guest. The row answers "where is this guest now";
 * the attempts behind it are one tap away. A full card that was scanned again
 * is flagged, because that is the case a coordinator actually wants to see.
 */
const attemptLabel: Record<string, [string, "success" | "danger" | "warning" | "neutral"]> = {
  accepted: ["Let in", "success"], exhausted: ["Refused, card already used", "danger"], unknown: ["Code not recognised", "danger"],
  wrong_event: ["Card for another event", "warning"], closed: ["Refused, doors not open", "warning"],
};

type Filter = "" | "partial" | "reused" | "manual";

export default function ScanLog() {
  const { slug, eventId } = useEvent();
  const q = useQuery({ queryKey: ["scans-grouped", slug, eventId], queryFn: () => api<ScanLogGrouped>(`${ev(slug, eventId)}/scans/guests/`), refetchInterval: 15_000 });
  const [open, setOpen] = useState<number | "unknown" | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("");

  const guests = useMemo(() => {
    const all = q.data?.guests ?? [];
    const s = search.trim().toLowerCase();
    return all.filter((g) =>
      (!s || g.name.toLowerCase().includes(s) || g.phone.includes(s)) &&
      (filter === "" || (filter === "partial" && g.admitted_count < g.capacity) || (filter === "reused" && g.reused > 0) || (filter === "manual" && g.manual)));
  }, [q.data, search, filter]);

  if (q.data && q.data.total_scans === 0) return <div className="panel"><Empty illustration="scanner-phone" title="No scans yet">Every scan at the door lands here, grouped by guest, with who scanned them and when.</Empty></div>;
  const counts = { reused: q.data?.guests.filter((g) => g.reused > 0).length ?? 0 };
  const un = q.data?.unrecognised;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row log-tools" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="search" style={{ width: 260 }}>{Icon.search}<input placeholder="Search name or number" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {([["", "All"], ["partial", "Still expected"], ["reused", `Card reused${counts.reused ? ` (${counts.reused})` : ""}`], ["manual", "Let in by name"]] as [Filter, string][]).map(([f, l]) => <Chip key={f} on={filter === f} onClick={() => setFilter(f)}>{l}</Chip>)}
        <span className="quiet log-total">{q.data ? `${q.data.guests.length} guests, ${q.data.total_scans} scans` : ""}</span>
      </div>

      <div className="panel log-list">
        {guests.map((g) => <GuestRow key={g.invitation_id} g={g} open={open === g.invitation_id} onToggle={() => setOpen(open === g.invitation_id ? null : g.invitation_id)} />)}
        {guests.length === 0 && q.data && <div className="empty" style={{ padding: 28 }}><p>No guests match.</p></div>}
        {un && un.count > 0 && filter === "" && !search && (
          <div className={`log-row ${open === "unknown" ? "open" : ""}`}>
            <button type="button" className="log-head" onClick={() => setOpen(open === "unknown" ? null : "unknown")} aria-expanded={open === "unknown"}>
              <span className="log-who"><b>Unrecognised codes</b><span className="quiet">Scans that matched no guest on this list</span></span>
              <span className="log-stage"><Badge tone="danger" dot>{un.count} {un.count === 1 ? "scan" : "scans"}</Badge></span>
              <span className="log-last">{un.last_at && fmtTime(un.last_at)}</span>
              <span className="log-chev" aria-hidden>{Icon.chevron}</span>
            </button>
            <Attempts open={open === "unknown"} attempts={un.attempts} />
          </div>
        )}
      </div>
    </div>
  );
}

function GuestRow({ g, open, onToggle }: { g: ScanGuestLog; open: boolean; onToggle: () => void }) {
  return (
    <div className={`log-row ${open ? "open" : ""}`}>
      <button type="button" className="log-head" onClick={onToggle} aria-expanded={open}>
        <span className="log-who"><b>{g.name}</b><span className="quiet mono">{g.phone}</span></span>
        <span className="log-stage">
          <Badge tone={g.tone} dot>{g.stage}</Badge>
          {g.reused > 0 && <Badge tone="danger">Reused {g.reused === 1 ? "once" : `${g.reused} times`}</Badge>}
          {g.manual && <Badge tone="neutral">By name</Badge>}
        </span>
        <span className="log-last"><span className="mono">{fmtTime(g.last_at)}</span><Staff s={g.last_staff} /></span>
        <span className="log-chev" aria-hidden>{Icon.chevron}</span>
      </button>
      <Attempts open={open} attempts={g.attempts} capacity={g.capacity} />
    </div>
  );
}

function Attempts({ open, attempts, capacity }: { open: boolean; attempts: ScanAttempt[]; capacity?: number }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.ol className="log-timeline" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          {attempts.map((a) => {
            const [t, tone] = attemptLabel[a.result] ?? [a.result, "neutral"];
            return (
              <li key={a.id} className={`tl-${tone}`}>
                <span className="tl-dot" aria-hidden />
                <span className="mono tl-time">{fmtTime(a.at)}</span>
                <span className="tl-what">
                  <span>{t}{a.result === "accepted" && capacity ? <span className="quiet">, {a.admitted_after} of {capacity}</span> : null}{a.manual ? <span className="quiet"> (found by name)</span> : null}</span>
                  <Staff s={a.staff} device={a.device_id} />
                </span>
              </li>
            );
          })}
        </motion.ol>
      )}
    </AnimatePresence>
  );
}

/** Name first; the email underneath, or alone if the person never set a name. */
function Staff({ s, device }: { s: StaffRef; device?: string }) {
  if (!s.name && !s.email) return <span className="quiet">Unknown staff</span>;
  return (
    <span className="staff-ref">
      <span>{s.name || s.email}</span>
      <span className="quiet">{s.name ? s.email : ""}{device ? `${s.name ? ", " : ""}device ${device}` : ""}</span>
    </span>
  );
}
