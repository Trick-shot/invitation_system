import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, ev } from "../../api/client";
import type { Dashboard, EventBillData, Invitation, MessageTemplate, Paginated, SendProgress } from "../../api/types";
import { tzs } from "../platform/money";
import { useWorkspace } from "./Shell";
import { Badge, Button, Track, useToast, DoneTick, ErrorState, Skel, SkelPanel } from "../../components/ui";
import { useEvent } from "./EventLayout";
import { segments } from "./Message";

type Phase = "idle" | "sending" | "done";

export default function Send() {
  const { slug, eventId, event, refetch } = useEvent();
  const { role } = useWorkspace();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [scope, setScope] = useState<"unsent" | "failed" | "all">(params.get("filter") === "failed" ? "failed" : "unsent");
  const msg = useQuery({ queryKey: ["message", slug, eventId], queryFn: () => api<MessageTemplate>(`${ev(slug, eventId)}/message/`) });
  // While cards are still building, keep checking so the "still being built" note clears by itself.
  const dash = useQuery({ queryKey: ["dashboard", slug, eventId], queryFn: () => api<Dashboard>(`${ev(slug, eventId)}/dashboard/`), refetchInterval: (q) => (q.state.data && q.state.data.cards_ready < (event?.invitation_count ?? 0) ? 3000 : false) });
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
  const bill = useQuery({ queryKey: ["event-bill", slug, eventId], queryFn: () => api<EventBillData>(`${ev(slug, eventId)}/bill/`), refetchInterval: phase === "idle" ? false : 4000 });
  const base = `/app/${slug}/events/${eventId}`;
  // Each blocker says what is wrong and links to where it gets fixed.
  const blockers = ([
    !event?.has_template && ["Place the QR slot on the template first.", `${base}/template`, "Open the template"],
    !msg.data && ["Write the message first.", `${base}/message`, "Write the message"],
    total === 0 && ["Add guests first.", `${base}/guests`, "Add guests"],
    event?.has_template && total > 0 && (dash.data?.cards_ready ?? 0) < total && ["Some cards are still being built. This page updates when they are ready.", "", ""],
  ].filter(Boolean)) as [string, string, string][];
  const loading = (msg.isLoading || dash.isLoading || unsent.isLoading) && phase === "idle";
  const loadFailed = (dash.isError && !dash.data) || (unsent.isError && !unsent.data);

  if (loadFailed) return <div className="panel"><ErrorState title="Sending details did not load" onRetry={() => { dash.refetch(); unsent.refetch(); msg.refetch(); }} /></div>;
  if (loading) return <div className="split split-aside" aria-hidden><div className="stack" style={{ gap: 12 }}><Skel w={220} h={20} /><Skel h={52} r={12} /><Skel h={52} r={12} /><Skel h={52} r={12} /><Skel w={220} h={52} r={10} /></div><SkelPanel h={220} title={false} /></div>;
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
        {blockers.map(([b, to, label]) => <div key={b} className="panel row" style={{ padding: 12, background: "var(--warning-subtle)", border: 0, color: "var(--warning-text)", justifyContent: "space-between", gap: 12 }}><span>{b}</span>{to && <Link to={to} style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{label}</Link>}</div>)}
        <div><Button variant="primary" size="xl" disabled={count === 0 || blockers.length > 0} loading={send.isPending} onClick={() => send.mutate()}>Send {count} invitation{count === 1 ? "" : "s"}</Button></div>
      </div>
      <div className="panel panel-pad stack">
        {/* Figma "Admin / Send (with cost)": what this send costs, then the event's running bill. */}
        <h3>What this send costs</h3>
        {seg ? (
          <dl className="cost-rows">
            <div><dt>Recipients</dt><dd>{count.toLocaleString("en-US")}</dd></div>
            <div><dt>SMS each</dt><dd>{seg.segments}</dd></div>
            <div><dt>SMS in this send</dt><dd>{(seg.segments * count).toLocaleString("en-US")}</dd></div>
            {bill.data && <div><dt>Price per SMS</dt><dd>TZS {tzs(bill.data.price_per_sms)}</dd></div>}
            {bill.data && <div className="strong"><dt>This send</dt><dd>TZS {tzs(seg.segments * count * bill.data.price_per_sms)}</dd></div>}
          </dl>
        ) : <p className="quiet" style={{ fontSize: 13 }}>Write the message to see the cost.</p>}
        <p className="quiet" style={{ fontSize: 13 }}>{seg ? `${seg.characters} characters. ` : ""}A message over 160 characters counts as 2 SMS. This is added to the event's bill, which you pay after the event.</p>
        <div className="hairline" />
        <h3>Bill for this event</h3>
        {!bill.data ? <div className="skeleton" style={{ height: 90 }} /> : (
          <dl className="cost-rows">
            {bill.data.by_kind.length === 0 && <div><dt>Nothing sent yet</dt><dd>0 SMS</dd></div>}
            {bill.data.by_kind.map((k) => <div key={k.kind}><dt>{k.label}{k.kind === "welcome" ? "s at the door" : "s"}</dt><dd>{tzs(k.sms)} SMS</dd></div>)}
            <div><dt>Total so far</dt><dd>{tzs(bill.data.sms)} SMS</dd></div>
            <div className="strong"><dt>Amount so far</dt><dd>TZS {tzs(bill.data.amount)}</dd></div>
          </dl>
        )}
        {bill.data && <p className="quiet" style={{ fontSize: 13 }}>{bill.data.bill.status === "open" ? "Open." : bill.data.bill.status === "invoiced" ? "Invoiced." : "Paid."}{bill.data.still_to_come.welcome_texts ? ` About ${bill.data.still_to_come.welcome_texts} more welcome texts if everyone still expected arrives.` : ""} Your invoice comes when the event closes.{role === "admin" && <> <Link to={`/app/${slug}/billing/${eventId}`}>Open the bill</Link></>}</p>}
        <div className="hairline" />
        <div className="kicker">Message</div>
        <div className="bubble" style={{ background: "var(--bg-inset)" }}>{msg.data?.preview ?? "No message yet."}</div>
        <Link to={`/app/${slug}/events/${eventId}/message`} style={{ fontSize: 13 }}>Edit the message</Link>
      </div>
    </div>
  );
}
