import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { PublicInvitation } from "../../api/types";
import { Button, Illustration, fmtDate } from "../../components/ui";
import { Icon } from "../admin/Shell";

export default function Guest() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PublicInvitation | null>(null);
  const [cardFile, setCardFile] = useState<File | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<PublicInvitation>(`/api/i/${token}/`, { auth: false }).then((d) => { if (!alive) return; setData(d); if (d.state === "preparing") setTimeout(load, 2500); }).catch(() => alive && setData({ state: "invalid" }));
    load();
    return () => { alive = false; };
  }, [token]);
  // Fetch the card once it exists, so the save tap can open the share sheet straight away.
  // Safari only allows navigator.share() close to a tap; waiting on a download first would be refused.
  useEffect(() => {
    if (!data?.card_url) return;
    let alive = true;
    fetch(data.card_url).then((r) => r.blob()).then((b) => { if (alive) setCardFile(new File([b], `invitation-${token}.${b.type === "image/jpeg" ? "jpg" : "png"}`, { type: b.type || "image/png" })); }).catch(() => {});
    return () => { alive = false; };
  }, [data?.card_url, token]);
  const wrap = (children: React.ReactNode) => <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", gap: 16, maxWidth: 420, margin: "0 auto" }}>{children}</div>;
  if (!data) return wrap(<div className="spinner" />);
  if (data.state === "invalid") return wrap(<div className="panel empty" style={{ marginTop: 100 }}><Illustration name="broken-link" /><h3>This invitation link is not valid</h3><p>Check the link in your message, or ask whoever invited you to send it again.</p></div>);
  if (data.state === "preparing") return wrap(<div className="panel empty" style={{ marginTop: 100 }}><Illustration name="hourglass" /><h3>Your card is being prepared</h3><p>This takes a few seconds. The page refreshes by itself.</p></div>);
  if (data.state === "finished") return wrap(<div className="panel empty" style={{ marginTop: 100 }}><Illustration name="calendar" /><h3>{data.event?.name} has finished</h3><p>Thank you for coming, {data.guest_name}.</p></div>);
  // Phones: share sheet with the image file, which on iPhone and Android offers "Save Image" / "Save to Photos".
  // Desktop, or a browser without file sharing: ordinary download.
  const canShareFile = !!cardFile && typeof navigator.canShare === "function" && navigator.canShare({ files: [cardFile] });
  const save = async () => {
    if (canShareFile) { try { await navigator.share({ files: [cardFile!] }); return; } catch (e) { if ((e as Error).name === "AbortError") return; } }
    const a = document.createElement("a"); a.href = cardFile ? URL.createObjectURL(cardFile) : data.card_url!; a.download = cardFile?.name ?? `invitation-${token}.png`; a.click();
  };
  const share = async () => {
    const text = `${data.event?.name}: ${window.location.href}`;
    if (navigator.share) { try { await navigator.share({ title: data.event?.name, text, url: window.location.href }); } catch { /* cancelled */ } }
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  return wrap(
    <>
      <h2 style={{ marginTop: 8 }}>You are invited</h2>
      <div style={{ width: "100%", background: "var(--bg-surface)", borderRadius: 12, boxShadow: "var(--shadow-float)", overflow: "hidden" }}>
        <img src={data.card_url!} alt={`Invitation card for ${data.guest_name}`} />
      </div>
      <div style={{ width: "100%", background: "var(--bg-surface)", borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", borderTop: "2px dashed var(--border-strong)" }}>
        <div><div className="kicker">Admits</div><b style={{ fontSize: 18, fontFamily: "var(--font-display)" }}>{data.capacity} {data.capacity === 1 ? "person" : "people"}</b></div>
        <div style={{ textAlign: "right" }}><div className="kicker">Date</div><b style={{ fontSize: 14 }}>{data.event && fmtDate(data.event.date)}</b></div>
      </div>
      <Button variant="primary" size="xl" block onClick={save}>{Icon.download} {canShareFile ? "Save to Photos" : "Download card"}</Button>
      <Button size="xl" block onClick={share}>{Icon.share} Share on WhatsApp</Button>
      <p className="quiet" style={{ fontSize: 13, textAlign: "center" }}>{canShareFile ? "Choose Save Image in the menu that opens. " : ""}Show this at the entrance{data.event?.venue ? `, ${data.event.venue}` : ""}.</p>
    </>
  );
}
