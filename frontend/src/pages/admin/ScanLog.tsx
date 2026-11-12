import { useQuery } from "@tanstack/react-query";
import { api, ev } from "../../api/client";
import type { Paginated, ScanLogRow } from "../../api/types";
import { Badge, Empty, fmtTime } from "../../components/ui";
import { useEvent } from "./EventLayout";

const label: Record<string, [string, "success" | "danger" | "warning" | "neutral"]> = { accepted: ["Admitted", "success"], exhausted: ["Already in", "danger"], unknown: ["Not recognised", "danger"], wrong_event: ["Wrong event", "warning"], closed: ["Doors not open", "warning"] };

export default function ScanLog() {
  const { slug, eventId } = useEvent();
  const q = useQuery({ queryKey: ["scans", slug, eventId], queryFn: () => api<Paginated<ScanLogRow>>(`${ev(slug, eventId)}/scans/?page_size=200`), refetchInterval: 15_000 });
  const rows = q.data?.results ?? [];
  if (q.data && rows.length === 0) return <div className="panel"><Empty illustration="scanner-phone" title="No scans yet">Every scan at the door lands here, accepted or not, with who scanned it and when.</Empty></div>;
  return (
    <div className="panel">
      <table className="table m-cards">
        <thead><tr><th>Time</th><th>Guest</th><th>Result</th><th>Scanned by</th><th>Device</th></tr></thead>
        <tbody>
          {rows.map((r) => { const [t, tone] = label[r.result] ?? [r.result, "neutral"]; return (
            <tr key={r.id}><td className="num">{fmtTime(r.at)}</td><td>{r.guest || <span className="quiet">Unknown card</span>}{r.manual && <Badge tone="accent">by name</Badge>}</td><td><Badge tone={tone} dot>{t}{r.result === "accepted" ? ` (${r.admitted_after})` : ""}</Badge></td><td data-l="Scanned by">{r.staff}</td><td data-l="Device" className="quiet mono" style={{ fontSize: 12 }}>{r.device_id}</td></tr>
          ); })}
        </tbody>
      </table>
    </div>
  );
}
