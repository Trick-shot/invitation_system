/**
 * One guest, everything about them, and every action on them. Figma: "Mobile / Guest sheet".
 * Opens from a row tap on phones and a row click on desktop (a centred dialog there).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError, ev } from "../../api/client";
import type { Invitation } from "../../api/types";
import { Button, CapacityPicker, Field, Input, Modal, Skel, fmtTime, useToast } from "../../components/ui";

type Mode = "view" | "edit" | "remove";
interface Activity { admissions: { at: string; by: string; manual: boolean }[] }

export function GuestSheet({ slug, eventId, guest, onClose, onChanged }: { slug: string; eventId: string; guest: Invitation | null; onClose: () => void; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>("view");
  const [form, setForm] = useState({ name: "", phone: "", capacity: 1 });
  const [err, setErr] = useState<ApiError | null>(null);
  const toast = useToast();
  const base = guest ? `${ev(slug, eventId)}/invitations/${guest.id}` : "";
  useEffect(() => { if (guest) { setMode("view"); setErr(null); setForm({ name: guest.name, phone: guest.phone_display || guest.phone, capacity: guest.capacity }); } }, [guest]);

  const activity = useQuery({ queryKey: ["guest-activity", slug, eventId, guest?.id], queryFn: () => api<Activity>(`${base}/activity/`), enabled: !!guest && guest.admitted_count > 0 });
  const save = useMutation({
    mutationFn: () => api<Invitation>(`${base}/`, { method: "PATCH", body: form }),
    onSuccess: (g) => { toast(`${g.name} updated`); onChanged(); onClose(); },
    onError: (e) => setErr(e as ApiError),
  });
  const resend = useMutation({
    mutationFn: () => api(`${ev(slug, eventId)}/invitations/send/`, { method: "POST", body: { invitation_ids: [guest!.id] } }),
    onSuccess: () => { toast(`Invitation queued for ${guest!.name}`); onChanged(); onClose(); },
    onError: (e) => toast((e as ApiError).summary ?? "Could not send", true),
  });
  const rebuild = useMutation({
    mutationFn: () => api(`${base}/regenerate-card/`, { method: "POST" }),
    onSuccess: () => { toast("Building the card again"); onChanged(); },
  });
  const remove = useMutation({
    mutationFn: () => api(`${base}/`, { method: "DELETE" }),
    onSuccess: () => { toast(`${guest!.name} removed`); onChanged(); onClose(); },
  });

  if (!guest) return <Modal open={false} onClose={onClose} title="" />;
  const g = guest;
  const d = g.last_delivery;
  const cardText = g.card_status === "ready" ? "Ready" : g.card_status === "failed" ? "Could not be built" : "Being built";
  const deliveryText = !d ? "Not sent yet" : d.status === "failed" ? `Failed${d.error ? `: ${d.error}` : ""}` : `${{ queued: "Queued", sent: "Sent", delivered: "Delivered", failed: "Failed" }[d.status]} ${fmtTime(d.updated_at)}${d.sequence > 1 ? `, sent ${d.sequence} times` : ""}`;
  const last = activity.data?.admissions.at(-1);
  const admitted = g.admitted_count === 0 ? "Not yet" : `${g.admitted_count} of ${g.capacity}`;

  if (mode === "remove") {
    return (
      <Modal open onClose={onClose} title={`Remove ${g.name}?`} sub="Their card and any link already sent will stop working. The number is freed for a new invitation."
        actions={<><Button variant="ghost" onClick={() => setMode("view")}>Keep</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Remove guest</Button></>} />
    );
  }
  if (mode === "edit") {
    return (
      <Modal open onClose={onClose} title="Edit guest" sub="The card and link stay the same. Only what you change here is updated."
        actions={<><Button variant="ghost" onClick={() => setMode("view")}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!form.name || !form.phone} onClick={() => save.mutate()}>Save changes</Button></>}>
        <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Name" error={err?.field("name")}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone" error={err?.field("phone")}><Input value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} invalid={!!err?.field("phone")} /></Field>
          <Field label="People on this card" hint={g.admitted_count ? `${g.admitted_count} already admitted, so it cannot go below that.` : undefined} error={err?.field("capacity")}><CapacityPicker value={form.capacity} onChange={(n) => setForm({ ...form, capacity: Math.max(n, g.admitted_count || 1) })} /></Field>
          <button type="submit" hidden />
        </form>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title={g.name} sub={`${g.phone_display}, admits ${g.capacity}`}>
      <dl className="guest-facts">
        <div><dt>Card</dt><dd style={g.card_status === "failed" ? { color: "var(--danger-text)" } : undefined}>{cardText}{g.card_status === "failed" && <button className="link-btn" onClick={() => rebuild.mutate()}>Try again</button>}</dd></div>
        <div><dt>Delivery</dt><dd style={d?.status === "failed" ? { color: "var(--danger-text)" } : undefined}>{deliveryText}</dd></div>
        <div><dt>Card opened</dt><dd>{g.first_viewed_at ? `${fmtTime(g.first_viewed_at)}${g.view_count > 1 ? `, opened ${g.view_count} times` : ""}` : "Not yet"}</dd></div>
        <div><dt>Admitted</dt><dd>{admitted}{g.admitted_count > 0 && (activity.isLoading ? <Skel w={140} h={12} style={{ display: "inline-block", marginLeft: 6 }} /> : last ? `, ${last.manual ? "by name, " : ""}by ${last.by || "door staff"} at ${fmtTime(last.at)}` : "")}</dd></div>
      </dl>
      <div className="guest-actions">
        <a className="btn btn-secondary btn-lg btn-block" href={`/i/${g.token}`} target="_blank" rel="noreferrer">Open the card</a>
        <Button size="lg" block loading={resend.isPending} disabled={g.card_status !== "ready"} onClick={() => resend.mutate()}>{d ? "Send the invitation again" : "Send the invitation"}</Button>
        <Button size="lg" block onClick={() => setMode("edit")}>Edit name or number</Button>
        <Button size="lg" block variant="ghost" className="danger-text" onClick={() => setMode("remove")}>Remove guest</Button>
      </div>
    </Modal>
  );
}
