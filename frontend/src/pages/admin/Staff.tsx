import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, ws } from "../../api/client";
import type { Member, Paginated, Role } from "../../api/types";
import { Avatar, Badge, Button, Empty, Field, Input, Modal, useToast } from "../../components/ui";
import { Topbar, useWorkspace } from "./Shell";

const roleLabel: Record<Role, string> = { admin: "Admin", coordinator: "Coordinator", door_staff: "Door staff" };
const roleHelp: Record<Role, string> = { admin: "Everything, including members, settings and messaging credentials.", coordinator: "Events, guests and sending. Cannot add members or see credentials.", door_staff: "Only the scanner. Never sees the guest list." };

export function StaffPanel({ standalone }: { standalone?: boolean }) {
  const { slug, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const list = useQuery({ queryKey: ["members", slug], queryFn: () => api<Paginated<Member>>(`${ws(slug)}/members/?page_size=100`) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["members", slug] });
  const remove = useMutation({ mutationFn: (m: Member) => api(`${ws(slug)}/members/${m.id}/`, { method: "DELETE" }), onSuccess: () => { setRemoving(null); invalidate(); toast("Member removed"); }, onError: (e) => toast((e as ApiError).summary, true) });
  const resend = useMutation({ mutationFn: (m: Member) => api(`${ws(slug)}/members/${m.id}/resend-invite/`, { method: "POST" }), onSuccess: () => toast("Invite sent again") });
  const members = list.data?.results ?? [];
  const isAdmin = role === "admin";
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h3>{standalone ? "" : "Who can scan at the door"}</h3><p className="muted">Door staff sign in to the scanner with their own account. They never see the guest list.</p></div>
        {isAdmin && <Button variant="primary" onClick={() => setAdding(true)}>Add staff member</Button>}
      </div>
      {members.length === 0 ? (
        <div className="panel"><Empty illustration="phone-contacts" title="No staff yet" action={isAdmin && <Button variant="primary" onClick={() => setAdding(true)}>Add the first one</Button>}>Add whoever will stand at the door. They get a link by SMS or email to set a password.</Empty></div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead><tr><th>Person</th><th>Contact</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td><div className="row"><Avatar initials={m.initials} /><span>{m.full_name || m.email}</span></div></td>
                  <td className="muted">{m.phone || m.email}</td>
                  <td>{roleLabel[m.role]}</td>
                  <td>{m.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge tone="warning" dot>Invite not accepted</Badge>}</td>
                  <td style={{ textAlign: "right" }}>{isAdmin && <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>{!m.is_active && <button className="btn btn-ghost btn-sm" onClick={() => resend.mutate(m)}>Resend invite</button>}<button className="btn btn-ghost btn-sm" onClick={() => setRemoving(m)}>Remove</button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddMemberModal open={adding} onClose={() => setAdding(false)} onAdded={invalidate} />
      <Modal open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.full_name || removing?.email}?`} sub="They lose access to this workspace immediately. Their past scans stay in the log."
        actions={<><Button variant="ghost" onClick={() => setRemoving(null)}>Keep</Button><Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>Remove</Button></>} />
    </>
  );
}

export function AddMemberModal({ open, onClose, onAdded, defaultRole = "door_staff" }: { open: boolean; onClose: () => void; onAdded: () => void; defaultRole?: Role }) {
  const { slug } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role: defaultRole as Role });
  const [err, setErr] = useState<ApiError | null>(null);
  const m = useMutation({
    mutationFn: () => api<Member>(`${ws(slug)}/members/`, { method: "POST", body: form }),
    onSuccess: (mem) => { toast(`Invite sent to ${mem.full_name || mem.email}`); setForm({ full_name: "", email: "", phone: "", role: defaultRole }); onAdded(); onClose(); },
    onError: (e) => setErr(e as ApiError),
  });
  return (
    <Modal open={open} onClose={onClose} title="Add a staff member" sub="They get a link to set a password. The account activates when they do."
      actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="ink" loading={m.isPending} disabled={!form.email} onClick={() => m.mutate()}>Send invite</Button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Full name"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoFocus /></Field>
        <Field label="Email" error={err?.field("email")}><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Phone" optional hint="If given, the invite also goes by SMS."><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></Field>
        <Field label="Role">
          <div className="stack" style={{ gap: 8 }}>
            {(["door_staff", "coordinator", "admin"] as Role[]).map((r) => (
              <button key={r} type="button" className={`choice ${form.role === r ? "on" : ""}`} style={{ padding: 12, gap: 2 }} onClick={() => setForm({ ...form, role: r })}>
                <div className="row" style={{ justifyContent: "space-between" }}><b>{roleLabel[r]}</b><span className={`radio ${form.role === r ? "on" : ""}`} /></div>
                <span className="desc">{roleHelp[r]}</span>
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

export default function StaffPage() {
  return (<><Topbar crumbs={["Staff"]} /><div className="content"><div className="page-head"><div><h1>Staff</h1></div></div><StaffPanel standalone /></div></>);
}
