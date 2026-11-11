import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, ApiError, ev } from "../../api/client";
import type { MessageTemplate } from "../../api/types";
import { Button, Field, useToast } from "../../components/ui";
import { useEvent } from "./EventLayout";
import { useWorkspace } from "./Shell";

export default function Message() {
  const { slug, eventId, refetch, event } = useEvent();
  const guestCount = event?.invitation_count ?? null;
  const nav = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ["message", slug, eventId], queryFn: () => api<MessageTemplate>(`${ev(slug, eventId)}/message/`) });
  const [body, setBody] = useState("");
  
  const [err, setErr] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (q.data) { setBody(q.data.body); } }, [q.data]);
  const save = useMutation({
    mutationFn: () => api<MessageTemplate>(`${ev(slug, eventId)}/message/`, { method: "PUT", body: { body, language: "en", channel: "sms" } }),
    onSuccess: () => { setErr(""); q.refetch(); refetch(); toast("Message saved"); nav(`/app/${slug}/events/${eventId}`); },
    onError: (e) => setErr((e as ApiError).field("body") ?? (e as ApiError).summary),
  });
  const insert = (tok: string) => { const el = ta.current; if (!el) return setBody((b) => b + tok); const s = el.selectionStart, e = el.selectionEnd; setBody(body.slice(0, s) + tok + body.slice(e)); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tok.length, s + tok.length); }); };
  const seg = segments(body.replace("{name}", "Amina Hassan").replace("{link}", "https://trickshot.tech/i/x7k2mq9f").replace("{event}", "Moses Nyoni Communion"));
  const preview = body.replace("{name}", "Amina").replace("{link}", "trickshot.tech/i/x7k2mq9f").replace("{event}", "Moses Nyoni Communion");
  const { workspace } = useWorkspace();
  const sender = (workspace?.name ?? "Trickshot").split(" ")[0].toUpperCase().slice(0, 11);
  const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const linkify = (t: string) => t.split(/(trickshot\.tech\/i\/\w+)/g).map((part, i) => /^trickshot\.tech\/i\//.test(part) ? <span key={i} className="sms-link">{part}</span> : part);
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
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => setBody(q.data?.body ?? "")} disabled={body === (q.data?.body ?? "")}>Discard</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()} disabled={!body.includes("{link}")}>Save message</Button>
        </div>
        {!body.includes("{link}") && <div className="quiet" style={{ fontSize: 13, textAlign: "right" }}>The message must contain {"{link}"}, or guests have nothing to open.</div>}
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
