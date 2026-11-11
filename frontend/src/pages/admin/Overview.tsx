import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ev } from "../../api/client";
import type { Dashboard, Invitation, Paginated } from "../../api/types";
import { Avatar, Stat, Track, fmtTime, Stagger, Rise } from "../../components/ui";
import { useEvent } from "./EventLayout";

export default function Overview() {
  const { slug, eventId } = useEvent();
  const dash = useQuery({ queryKey: ["dashboard", slug, eventId], queryFn: () => api<Dashboard>(`${ev(slug, eventId)}/dashboard/`), refetchInterval: 30_000 });
  const latest = useQuery({ queryKey: ["invitations", slug, eventId, "latest"], queryFn: () => api<Paginated<Invitation>>(`${ev(slug, eventId)}/invitations/?page_size=8`) });
  const d = dash.data;
  if (!d) return <div className="stack"><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 260 }} /></div>;
  const base = `/app/${slug}/events/${eventId}`;
  return (
    <>
      <Stagger className="stats">
        <Stat label="Arrived" value={d.tiles.arrived.value} delta={`+${d.tiles.arrived.last_hour} in the last hour, of ${d.tiles.arrived.of} people expected`} tone="success" active />
        <Stat label="Cards scanned" value={d.tiles.cards_scanned.value} delta={`of ${d.tiles.cards_scanned.of} invitations`} />
        <Stat label="Invitations sent" value={d.tiles.sent.value} delta={`${d.tiles.sent.delivered} delivered, ${d.tiles.sent.failed} failed`} />
        <Stat label="Failed delivery" value={d.tiles.failed.value} delta={d.tiles.failed.value ? <Link to={`${base}/send?filter=failed`}>retry available</Link> : "nothing to retry"} tone={d.tiles.failed.value ? "danger" : "neutral"} />
      </Stagger>
      <Rise><ArrivalsChart data={d.arrivals_by_hour} /></Rise>
      <Stagger className="split">
        <Rise className="panel panel-pad">
          <h4>From invitation to arrival</h4>
          <p className="quiet" style={{ fontSize: 13 }}>Each drop is a list you can act on. Click a stage to filter the guest list.</p>
          <div style={{ marginTop: 8 }}>
            {d.funnel.map((s, i) => {
              const max = d.funnel[0].count || 1;
              const filter = ["", "", "?filter=not_sent", "", "?filter=not_arrived"][i];
              return (
                <Link key={s.stage} to={`${base}/guests${filter}`} className="funnel-row" style={{ color: "inherit", textDecoration: "none" }}>
                  <div className="line"><span style={{ textTransform: "capitalize" }}>{s.stage}</span><span className="mono">{s.count}{i === 0 ? " invitations" : ""}</span></div>
                  <Track value={s.count} max={max} tone={i === 4 ? "ok" : undefined} />
                  {s.note && <div className="quiet" style={{ fontSize: 13 }}>{s.note}</div>}
                </Link>
              );
            })}
          </div>
        </Rise>
        <Rise className="panel panel-pad">
          <h4>At the door</h4>
          <div style={{ marginTop: 12 }}>
            {d.door.by_staff.map((s) => <div key={s.name} className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}><span>{s.name}</span><span className="mono">{s.scans} scans</span></div>)}
            {d.door.by_staff.length === 0 && <div className="quiet">No scans yet.</div>}
            {Object.entries(d.door.rejections).map(([k, n]) => <div key={k} className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}><span>{{ exhausted: "Rejected, already admitted", unknown: "Not recognised", wrong_event: "Wrong event", closed: "Doors not open" }[k] ?? k}</span><span className="mono" style={{ color: "var(--danger-text)" }}>{n}</span></div>)}
            <div className="row" style={{ justifyContent: "space-between", padding: "10px 0" }}><span>Admitted by name search</span><span className="mono">{d.door.manual_admits}</span></div>
            <Link to={`${base}/scans`} style={{ fontSize: 13 }}>Open the scan log</Link>
          </div>
        </Rise>
      </Stagger>
      <Rise className="panel">
        <div className="row panel-pad" style={{ justifyContent: "space-between" }}><h4>Latest arrivals</h4><Link to={`${base}/guests`} className="btn btn-secondary btn-sm">All guests</Link></div>
        <table className="table">
          <thead><tr><th>Guest</th><th>Phone</th><th>Sent</th><th>Card opened</th><th>Admitted</th></tr></thead>
          <tbody>
            {(latest.data?.results ?? []).map((g) => (
              <tr key={g.id}>
                <td><div className="row"><Avatar initials={g.initials} /><div>{g.name}<div className="quiet" style={{ fontSize: 12 }}>{g.capacity} {g.capacity === 1 ? "person" : "people"} on the card</div></div></div></td>
                <td className="num">{g.phone_display}</td>
                <td>{g.last_delivery ? (g.last_delivery.status === "failed" ? <span style={{ color: "var(--danger-text)" }}>Failed</span> : fmtTime(g.last_delivery.updated_at)) : <span className="quiet">Not yet</span>}</td>
                <td>{g.first_viewed_at ? fmtTime(g.first_viewed_at) : <span className="quiet">Not yet</span>}</td>
                <td><div className="row" style={{ gap: 10 }}><div style={{ width: 48 }}><Track value={g.admitted_count} max={g.capacity} tone={g.admitted_count === g.capacity ? "ok" : undefined} /></div><span className="mono">{g.admitted_count} of {g.capacity}</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rise>
    </>
  );
}

function ArrivalsChart({ data }: { data: Dashboard["arrivals_by_hour"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 230, L = 36, R = 16, T = 16, B = 28;
  const points = data.length ? data : [];
  const max = Math.max(10, ...points.map((p) => p.count));
  const px = (i: number) => L + (points.length > 1 ? (i * (W - L - R)) / (points.length - 1) : (W - L - R) / 2);
  const py = (v: number) => T + (H - T - B) - (v / max) * (H - T - B);
  const line = points.map((p, i) => `${i ? "L" : "M"}${px(i)} ${py(p.count)}`).join(" ");
  const area = points.length ? `${line} L${px(points.length - 1)} ${py(0)} L${px(0)} ${py(0)} Z` : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <div className="panel panel-pad" style={{ border: 0, paddingLeft: 0, paddingRight: 0 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h4>Arrivals through the evening</h4><p className="quiet" style={{ fontSize: 13 }}>Scans per hour, both gates. Hover a point for the exact count.</p></div>
        <span className="row" style={{ fontSize: 12, color: "var(--text-secondary)" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)" }} /> Tonight</span>
      </div>
      <div className="chart" style={{ marginTop: 12 }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke={t === 0 ? "var(--border-default)" : "var(--border-subtle)"} /><text x={L - 8} y={py(t) + 4} fontSize="11" textAnchor="end" fill="var(--text-tertiary)">{t}</text></g>)}
          {points.length === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="var(--text-tertiary)">Arrivals will draw here once the doors open.</text>}
          {area && <path d={area} fill="var(--bg-accent-subtle)" />}
          {points.length === 1 && <circle cx={px(0)} cy={py(points[0].count)} r="6" fill="var(--accent)" />}
          {line && <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          {points.map((p, i) => <g key={p.hour}><rect x={px(i) - 20} y={T} width="40" height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} /><text x={px(i)} y={H - 6} fontSize="11" textAnchor="middle" fill="var(--text-tertiary)">{new Date(p.hour).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</text>{hover === i && <><line x1={px(i)} x2={px(i)} y1={T} y2={py(0)} stroke="var(--border-strong)" /><circle cx={px(i)} cy={py(p.count)} r="6" fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth="3" /></>}</g>)}
        </svg>
        {hover !== null && points[hover] && (
          <div className="tooltip" style={{ left: `${(px(hover) / W) * 100}%`, top: `${(py(points[hover].count) / H) * 100}%`, transform: "translate(14px, -10px)" }}>
            <b>{new Date(points[hover].hour).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</b>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}><span className="muted">Arrived</span><b>{points[hover].count}</b></div>
          </div>
        )}
      </div>
    </div>
  );
}
