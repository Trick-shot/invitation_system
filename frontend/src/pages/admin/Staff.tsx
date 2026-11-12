import { useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, ws } from "../../api/client";
import type { Member, Paginated, Role } from "../../api/types";
import { Avatar, Badge, Button, Empty, Field, Input, Modal, Pager, rowNo, scrollToTable, usePageSize, useToast, useIsPhone, ErrorState, SkelRows } from "../../components/ui";
import { Topbar, useWorkspace } from "./Shell";

const roleLabel: Record<Role, string> = { admin: "Admin", coordinator: "Coordinator", door_staff: "Door staff" };
const roleHelp: Record<Role, string> = { admin: "Everything, including members, settings and messaging credentials.", coordinator: "Events, guests and sending. Cannot add members or see credentials.", door_staff: "Only the scanner. Never sees the guest list." };

export function StaffPanel({ standalone }: { standalone?: boolean }) {
  const { slug, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = usePageSize("staff");
  const top = useRef<HTMLDivElement>(null);
  const list = useQuery({ queryKey: ["members", slug, page, size], queryFn: () => api<Paginated<Member>>(`${ws(slug)}/members/?page=${page}&page_size=${size}`), placeholderData: keepPreviousData });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["members", slug] });
  const remove = useMutation({ mutationFn: (m: Member) => api(`${ws(slug)}/members/${m.id}/`, { method: "DELETE" }), onSuccess: () => { setRemoving(null); invalidate(); toast("Member removed"); }, onError: (e) => toast((e as ApiError).summary, true) });
  const resend = useMutation({ mutationFn: (m: Member) => api<{ delivery?: Delivery }>(`${ws(slug)}/members/${m.id}/resend-invite/`, { method: "POST" }), onSuccess: (r, m) => { const [msg, bad] = deliveryNote(m.full_name || m.email, r.delivery); toast(msg, bad); } });
  const members = list.data?.results ?? [];
  const isAdmin = role === "admin";
  return (
    <>
      <div className="row head-row" style={{ justifyContent: "space-between" }}>
        <div><h3>{standalone ? "" : "Who can scan at the door"}</h3><p className="muted">Door staff sign in to the scanner with their own account. They never see the guest list.</p></div>
        {isAdmin && <Button variant="primary" onClick={() => setAdding(true)}>Add staff member</Button>}
      </div>
      {!list.data ? (
        list.isError ? <div className="panel"><ErrorState title="The staff list did not load" onRetry={() => list.refetch()} /></div> : <div className="panel"><SkelRows rows={3} /></div>
      ) : members.length === 0 ? (
        <div className="panel"><Empty illustration="phone-contacts" title="No staff yet" action={isAdmin && <Button variant="primary" onClick={() => setAdding(true)}>Add the first one</Button>}>Add whoever will stand at the door. They get a link by SMS or email to set a password.</Empty></div>
      ) : (
        <div className="panel" ref={top}>
          <table className={`table m-cards paging ${list.isPlaceholderData ? "busy" : ""}`}>
            <thead><tr><th className="no">No.</th><th>Person</th><th>Contact</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id}>
                  <td className="no">{rowNo(list.data!.page, list.data!.page_size, i)}</td>
                  <td><div className="row"><Avatar initials={m.initials} /><span>{m.full_name || m.email}</span></div></td>
                  <td className="muted">{m.phone || m.email}</td>
                  <td>{roleLabel[m.role]}</td>
                  <td>{m.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge tone="warning" dot>Invite not accepted</Badge>}</td>
                  <td style={{ textAlign: "right" }}>{isAdmin && <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>{!m.is_active && <button className="btn btn-ghost btn-sm" onClick={() => resend.mutate(m)}>Resend invite</button>}<button className="btn btn-ghost btn-sm" onClick={() => setRemoving(m)}>Remove</button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={list.data.page} pages={list.data.pages} count={list.data.count} pageSize={list.data.page_size} noun="people" onPage={(p) => { setPage(p); scrollToTable(top.current); }} onPageSize={(n) => { setSize(n); setPage(1); }} />
        </div>
      )}
      <AddMemberModal open={adding} onClose={() => setAdding(false)} onAdded={invalidate} />
      <Modal open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.full_name || removing?.email}?`} sub="They lose access to this workspace immediately. Their past scans stay in the log."
        actions={<><Button variant="ghost" onClick={() => setRemoving(null)}>Keep</Button><Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>Remove</Button></>} />
    </>
  );
}

export function AddMemberModal({ open, onClose, onAdded, defaultRole = "door_staff" }: { open: boolean; onClose: () => void; onAdded: () => void; defaultRole?: Role }) {
  const phone = useIsPhone();
  const { slug } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role: defaultRole as Role });
  const [err, setErr] = useState<ApiError | null>(null);
  const m = useMutation({
    mutationFn: () => api<Member & { delivery?: Delivery }>(`${ws(slug)}/members/`, { method: "POST", body: form }),
    onSuccess: (mem) => { const [msg, bad] = deliveryNote(mem.full_name || mem.email, mem.delivery); toast(msg, bad); setForm({ full_name: "", email: "", phone: "", role: defaultRole }); onAdded(); onClose(); },
    onError: (e) => setErr(e as ApiError),
  });
  return (
    <Modal open={open} onClose={onClose} title="Add a staff member" sub="They get a link to set a password. The account activates when they do."
      actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="ink" loading={m.isPending} disabled={!form.email} onClick={() => m.mutate()}>Send invite</Button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Full name"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoFocus={!phone} /></Field>
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


type Delivery = { email?: string; sms?: string };
/** Says which channel reached the person, so a failed SMS is visible instead of a silent gap. */
function deliveryNote(who: string, d?: Delivery): [string, boolean] {
  const email = d?.email === "sent", sms = d?.sms === "sent";
  const smsFail = d?.sms?.startsWith("failed") ? d.sms.replace(/^failed:\s*/, "") : "";
  if (email && sms) return [`Invite sent to ${who} by email and SMS`, false];
  if (email && smsFail) return [`Invite emailed to ${who}. The SMS did not go through: ${smsFail}`, true];
  if (email) return [`Invite emailed to ${who}`, false];
  if (sms) return [`Invite sent to ${who} by SMS. The email did not go through.`, true];
  return [`${who} was added, but the invite did not go out. Use Resend invite, or check the email and phone.`, true];
}
