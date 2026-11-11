import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, ev } from "../../api/client";
import type { Dashboard, Invitation, MessageTemplate, Paginated, SendProgress } from "../../api/types";
import { Badge, Button, Track, useToast, DoneTick } from "../../components/ui";
import { useEvent } from "./EventLayout";
import { segments } from "./Message";

type Phase = "idle" | "sending" | "done";

export default function Send() {
  const { slug, eventId, event, refetch } = useEvent();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [scope, setScope] = useState<"unsent" | "failed" | "all">(params.get("filter") === "failed" ? "failed" : "unsent");
  const msg = useQuery({ queryKey: ["message", slug, eventId], queryFn: () => api<MessageTemplate>(`${ev(slug, eventId)}/message/`) });
  const dash = useQuery({ queryKey: ["dashboard", slug, eventId], queryFn: () => api<Dashboard>(`${ev(slug, eventId)}/dashboard/`) });
  const unsent = useQuery({ queryKey: ["invitations", slug, eventId, "not_sent-count"], queryFn: () => api<Paginated<Invitation>>(`${ev(slug, eventId)}/invitations/?filter=not_sent&page_size=1`) });
  const progress = useQuery({ queryKey: ["send-progress", slug, eventId], queryFn: () => api<SendProgress>(`${ev(slug, eventId)}/invitations/send/progress/`), refetchInterval: phase === "sending" ? 1500 : false });
  useEffect(() => {
    if (phase !== "sending" || !progress.data) return;
    if (progress.data.counts.queued === 0) { setPhase("done"); qc.invalidateQueries({ queryKey: ["invitations", slug, eventId] }); dash.refetch(); refetch(); }
  }, [phase, progress.data, qc, slug, eventId, dash, refetch]);
  const send = useMutation({
    mutationFn: () => api<{ queued: number }>(`${ev(slug, eventId)}/invitations/send/`, { method: "POST", body: scope === "all" ? {} : scope === "failed" ? { only_failed: true } : { only_unsent: true } }),
    onSuccess: (r) => { toast(`${r.queued} queued`); setPhase("sending"); progress.refetch(); },
    onError: (e) => toast((e as ApiError).summary, true),
  });

  const total = event?.invitation_count ?? 0;
  const failed = dash.data?.tiles.sent.failed ?? 0;
  const unsentCount = unsent.data?.count ?? 0;
  const count = scope === "all" ? total : scope === "failed" ? failed : unsentCount;
  const seg = msg.data ? segments(msg.data.preview) : null;
  const blockers = [!event?.has_template && "Place the QR slot on the template first.", !msg.data && "Write the message first.", (dash.data?.cards_ready ?? 0) < total && "Some cards are still being built; wait a moment."].filter(Boolean) as string[];

  if (phase !== "idle" && progress.data) {
    const p = progress.data; const done = p.total - p.counts.queued;
    return (
      <>
        <div className="panel panel-pad stack" style={{ gap: 14 }}>
          <h3>{phase === "sending" ? `Sending ${p.total} invitations` : p.counts.failed ? `${done - p.counts.failed} sent, ${p.counts.failed} failed` : <span className="row" style={{ gap: 10 }}><DoneTick size={32} /> All {p.total} invitations sent</span>}</h3>
          <div className="row" style={{ gap: 16 }}><div className="grow"><Track value={done} max={p.total} /></div><span className="mono">{done} of {p.total}</span></div>
          <div className="row" style={{ gap: 32 }}>
            <div><div className="kicker">Sent</div><div className="mono" style={{ fontSize: 20, color: "var(--success-text)" }}>{p.counts.sent + p.counts.delivered}</div></div>
            <div><div className="kicker">Failed</div><div className="mono" style={{ fontSize: 20, color: "var(--danger-text)" }}>{p.counts.failed}</div></div>
            <div><div className="kicker">Remaining</div><div className="mono" style={{ fontSize: 20 }}>{p.counts.queued}</div></div>
          </div>
          {phase === "sending" && <div className="panel" style={{ background: "var(--bg-inset)", border: 0, padding: 12, fontSize: 13 }}>You can leave this page. Sending continues on the server.</div>}
          {phase === "done" && <div className="row" style={{ gap: 8 }}>{p.counts.failed > 0 && <Button variant="primary" onClick={() => { setScope("failed"); setPhase("idle"); }}>Retry {p.counts.failed} failed</Button>}<Link to={`/app/${slug}/events/${eventId}`} className="btn btn-secondary">Back to overview</Link></div>}
        </div>
        <div className="panel">
          {p.recent.map((r) => (
            <div key={`${r.invitation_id}-${r.sequence}`} className="row" style={{ padding: "12px 16px", borderTop: "1px solid var(--border-subtle)", justifyContent: "space-between" }}>
              <span className="row"><span style={{ width: 6, height: 6, borderRadius: 3, background: r.status === "failed" ? "var(--danger)" : r.status === "queued" ? "var(--border-strong)" : "var(--success)" }} />{r.name}</span>
              <span style={{ color: r.status === "failed" ? "var(--danger-text)" : "var(--text-secondary)" }}>{r.status === "failed" ? `Failed: ${r.error || "rejected"}` : { queued: "Queued", sent: "Sent", delivered: "Delivered" }[r.status]}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="split split-aside">
      <div className="stack" style={{ gap: 16 }}>
        <div><h3>Send invitations</h3><p className="muted">Each guest gets one SMS with their personal link. Nothing is sent until you press the button.</p></div>
        <div className="stack" style={{ gap: 8 }}>
          {([["unsent", `Guests not yet sent`, unsentCount], ["failed", "Only failed deliveries", failed], ["all", "Everyone, including those already sent", total]] as const).map(([k, l, n]) => (
            <button key={k} type="button" className={`choice ${scope === k ? "on" : ""}`} style={{ padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }} onClick={() => setScope(k)}>
              <span className="row"><span className={`radio ${scope === k ? "on" : ""}`} /><b>{l}</b></span><Badge>{n}</Badge>
            </button>
          ))}
        </div>
        {blockers.map((b) => <div key={b} className="panel" style={{ padding: 12, background: "var(--warning-subtle)", border: 0, color: "var(--warning-text)" }}>{b}</div>)}
        <div><Button variant="primary" size="xl" disabled={count === 0 || blockers.length > 0} loading={send.isPending} onClick={() => send.mutate()}>Send {count} invitation{count === 1 ? "" : "s"}</Button></div>
      </div>
      <div className="panel panel-pad stack">
        <div className="kicker">Cost estimate</div>
        <div className="mono" style={{ fontSize: 28, fontWeight: 500 }}>{seg ? seg.segments * count : "–"} SMS</div>
        <div className="quiet" style={{ fontSize: 13 }}>{seg ? `${seg.segments} per guest × ${count} guests. ${seg.characters} characters, ${seg.encoding}.` : "Write the message to see the cost."}</div>
        <div className="hairline" />
        <div className="kicker">Message</div>
        <div className="bubble" style={{ background: "var(--bg-inset)" }}>{msg.data?.preview ?? "No message yet."}</div>
        <Link to={`/app/${slug}/events/${eventId}/message`} style={{ fontSize: 13 }}>Edit the message</Link>
      </div>
    </div>
  );
}
