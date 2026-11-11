import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, ApiError, ev } from "../../api/client";
import type { MessageTemplate } from "../../api/types";
import { Button, Field, useToast } from "../../components/ui";
import { useEvent } from "./EventLayout";

export default function Message() {
  const { slug, eventId, refetch } = useEvent();
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
  const insert = (tok: string) => { const el = ta.current; if (!el) return setBody(body + tok); const s = el.selectionStart, e = el.selectionEnd; setBody(body.slice(0, s) + tok + body.slice(e)); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tok.length, s + tok.length); }); };
  const seg = segments(body.replace("{name}", "Amina Hassan").replace("{link}", "https://trickshot.tech/i/x7k2mq9f").replace("{event}", "Moses Nyoni Communion"));
  const preview = body.replace("{name}", "Amina").replace("{link}", "trickshot.tech/i/x7k2mq9f").replace("{event}", "Moses Nyoni Communion");
  return (
    <div className="split" style={{ gridTemplateColumns: "1fr 300px" }}>
      <div className="stack" style={{ gap: 16 }}>
        <div><h3>What will guests receive?</h3><p className="muted">We started you off based on the kind of event. Change any of it.</p></div>
        <Field error={err}><textarea ref={ta} className="input" rows={7} value={body} onChange={(e) => setBody(e.target.value)} style={{ borderColor: "var(--border-accent)", fontSize: 15 }} /></Field>
        <div className="row" style={{ gap: 8 }}><span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>Insert</span>{["{name}", "{link}", "{event}"].map((t) => <button key={t} type="button" className="kbd mono" style={{ fontSize: 12, padding: "3px 8px", cursor: "pointer", color: "var(--text-accent)" }} onClick={() => insert(t)}>{t}</button>)}</div>
        <div><b>{seg.characters} characters, {seg.segments} SMS per guest</b><div className="quiet" style={{ fontSize: 13 }}>{seg.encoding === "UCS-2" ? "A curly quote or emoji dropped the limit to 70 characters per SMS. Remove it to halve your cost." : seg.characters > 160 ? "Keeping it under 160 would halve your cost." : "Fits in one SMS."}</div></div>
        <div><Button variant="primary" size="lg" loading={save.isPending} onClick={() => save.mutate()} disabled={!body.includes("{link}")}>Save message</Button>{!body.includes("{link}") && <span className="quiet" style={{ marginLeft: 12 }}>The message must contain {"{link}"}.</span>}</div>
      </div>
      <div className="phone">
        <div className="quiet" style={{ textAlign: "center", fontSize: 12 }}>What Amina receives</div>
        <div className="bubble"><div className="kicker" style={{ marginBottom: 4 }}>Trickshot</div>{preview}</div>
        <div className="quiet" style={{ textAlign: "right", fontSize: 11 }}>Delivered 18:42</div>
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
