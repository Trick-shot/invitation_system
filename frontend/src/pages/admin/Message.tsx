import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, ApiError, ev } from "../../api/client";
import type { MessageTemplate } from "../../api/types";
import { Button, Field, useToast, ErrorState, Skel } from "../../components/ui";
import { useEvent } from "./EventLayout";
import { useWorkspace } from "./Shell";

export default function Message() {
  const { slug, eventId, refetch, event } = useEvent();
  const guestCount = event?.invitation_count ?? null;
  const nav = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ["message", slug, eventId], queryFn: () => api<MessageTemplate>(`${ev(slug, eventId)}/message/`) });
  const [body, setBody] = useState("");
  const [welcomeOn, setWelcomeOn] = useState(true);
  const [welcome, setWelcome] = useState("");
  const [welcomeErr, setWelcomeErr] = useState("");
  const [err, setErr] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (q.data) { setBody(q.data.body); setWelcomeOn(q.data.welcome_enabled); setWelcome(q.data.welcome_body); } }, [q.data]);
  const save = useMutation({
    mutationFn: () => api<MessageTemplate>(`${ev(slug, eventId)}/message/`, { method: "PUT", body: { body, language: "en", channel: "sms", welcome_enabled: welcomeOn, welcome_body: welcome } }),
    onSuccess: () => { setErr(""); setWelcomeErr(""); q.refetch(); refetch(); toast("Messages saved"); nav(`/app/${slug}/events/${eventId}`); },
    onError: (e) => { const a = e as ApiError; setErr(a.field("body") ?? ""); setWelcomeErr(a.field("welcome_body") ?? ""); if (!a.field("body") && !a.field("welcome_body")) setErr(a.summary); },
  });
  const insert = (tok: string) => { const el = ta.current; if (!el) return setBody((b) => b + tok); const s = el.selectionStart, e = el.selectionEnd; setBody(body.slice(0, s) + tok + body.slice(e)); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tok.length, s + tok.length); }); };
  const seg = segments(body.replace("{name}", "Amina Hassan").replace("{link}", "https://trickshot.tech/i/x7k2mq9f").replace("{event}", "Moses Nyoni Communion"));
  const preview = body.replace("{name}", "Amina").replace("{link}", "trickshot.tech/i/x7k2mq9f").replace("{event}", "Moses Nyoni Communion");
  const wSeg = segments(welcome.replace("{name}", "Amina Hassan").replace("{event}", event?.name ?? "Moses Nyoni Communion"));
  const wPreview = welcome.replace("{name}", "Amina").replace("{event}", event?.name ?? "Moses Nyoni Communion");
  const dirty = body !== (q.data?.body ?? "") || welcome !== (q.data?.welcome_body ?? "") || welcomeOn !== (q.data?.welcome_enabled ?? true);
  const welcomeBad = welcomeOn && (!welcome.trim() || welcome.includes("{link}"));
  const { workspace } = useWorkspace();
  const sender = (workspace?.name ?? "Trickshot").split(" ")[0].toUpperCase().slice(0, 11);
  const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const linkify = (t: string) => t.split(/(trickshot\.tech\/i\/\w+)/g).map((part, i) => /^trickshot\.tech\/i\//.test(part) ? <span key={i} className="sms-link">{part}</span> : part);
  if (!q.data) return q.isError
    ? <div className="panel"><ErrorState title="The message did not load" onRetry={() => q.refetch()} /></div>
    : <div className="split" aria-hidden><div className="stack"><Skel w={200} h={18} /><Skel h={180} r={8} /><Skel w={260} h={12} /><Skel h={120} r={8} /></div><Skel h={420} r={28} /></div>;
  return (
    <div className="msg-layout">
      <div className="panel panel-pad stack msg-side" style={{ gap: 14 }}>
        <div><h3>What will guests receive?</h3><p className="muted">We started you off based on the kind of event. Change any of it; the phone shows how it lands.</p></div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>Insert</span>{["{name}", "{link}", "{event}"].map((t) => <button key={t} type="button" className="kbd mono" style={{ fontSize: 12, padding: "3px 8px", cursor: "pointer", color: "var(--text-accent)" }} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(t)}>{t}</button>)}</div>
        <Field error={err}><textarea ref={ta} className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} style={{ fontSize: 15, lineHeight: 1.5 }} /></Field>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <b>{seg.characters} characters, {seg.segments} SMS per guest</b>
          <span className="mono quiet" style={{ fontSize: 13 }}>{guestCount != null ? `${seg.segments * guestCount} messages for ${guestCount} guests` : ""}</span>
        </div>
        <div className="quiet" style={{ fontSize: 13 }}>{seg.encoding === "UCS-2" ? "A curly quote or emoji dropped the limit to 70 characters per SMS. Remove it to halve your cost." : seg.characters > 160 ? "Under 160 characters would halve this. A curly quote or emoji drops the limit to 70 and doubles it again." : "Fits in one SMS. A curly quote or emoji would drop the limit to 70 and double it."}</div>
        {!body.includes("{link}") && <div className="quiet" style={{ fontSize: 13 }}>The message must contain {"{link}"}, or guests have nothing to open.</div>}

        <div className="welcome-block">
          <label className="switch-row">
            <span><b>Welcome text at the door</b><span className="muted" style={{ display: "block", fontSize: 13 }}>Sent once per card, when the first person on it is scanned in.</span></span>
            <input type="checkbox" className="switch" checked={welcomeOn} onChange={(e) => setWelcomeOn(e.target.checked)} />
          </label>
          {welcomeOn && (
            <>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>Insert</span>{["{name}", "{event}"].map((t) => <button key={t} type="button" className="kbd mono" style={{ fontSize: 12, padding: "3px 8px", cursor: "pointer", color: "var(--text-accent)" }} onClick={() => setWelcome((w) => w + t)}>{t}</button>)}</div>
              <Field error={welcomeErr}><textarea className="input" rows={3} value={welcome} onChange={(e) => setWelcome(e.target.value)} style={{ fontSize: 15, lineHeight: 1.5 }} /></Field>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <b>{wSeg.characters} characters, {wSeg.segments} SMS per card</b>
                <span className="mono quiet" style={{ fontSize: 13 }}>{guestCount != null ? `up to ${wSeg.segments * guestCount} messages` : ""}</span>
              </div>
              {welcome.includes("{link}") && <div className="quiet" style={{ fontSize: 13 }}>The welcome text has no link to insert. Remove {"{link}"}.</div>}
            </>
          )}
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => { setBody(q.data?.body ?? ""); setWelcome(q.data?.welcome_body ?? ""); setWelcomeOn(q.data?.welcome_enabled ?? true); }} disabled={!dirty}>Discard</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()} disabled={!body.includes("{link}") || welcomeBad}>Save messages</Button>
        </div>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <div className="kicker">What Amina receives</div>
        <div className="phone-stage">
          <div className="iphone">
            <div className="iphone-top"><span className="iphone-time">{now}</span><span className="iphone-island" /><span className="iphone-status"><i /><i /><i /></span></div>
            <div className="iphone-head"><div className="iphone-avatar">{sender.slice(0, 1)}</div><div className="iphone-name">{sender}</div><div className="quiet" style={{ fontSize: 11 }}>SMS</div></div>
            <div className="iphone-thread">
              <div className="iphone-date">Today {now}</div>
              <div className="sms-bubble">{linkify(preview)}{!body && <span className="quiet">Your message appears here</span>}</div>
              <div className="iphone-seen">Delivered</div>
              {welcomeOn && welcome.trim() && <><div className="iphone-date" style={{ marginTop: 10 }}>At the door</div><div className="sms-bubble">{wPreview}</div></>}
            </div>
            <div className="iphone-compose"><span>+</span><div className="iphone-field">Text Message</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";
export function segments(text: string) {
  const gsm = [...text].every((c) => GSM7.includes(c) || GSM7_EXT.includes(c));
  const length = gsm ? [...text].reduce((n, c) => n + (GSM7_EXT.includes(c) ? 2 : 1), 0) : text.length;
  const single = gsm ? 160 : 70, multi = gsm ? 153 : 67;
  return { characters: length, segments: length <= single ? 1 : Math.ceil(length / multi), encoding: gsm ? "GSM-7" : "UCS-2" };
}
