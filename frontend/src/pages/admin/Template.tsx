import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ev } from "../../api/client";
import type { CardTemplate, Invitation, Paginated } from "../../api/types";
import { Button, Modal, useToast } from "../../components/ui";
import { useEvent } from "./EventLayout";

const QR = () => <svg viewBox="0 0 7 7" width="60%" height="60%" fill="var(--text-primary)"><path d="M0 0h3v3H0zM1 1h1v1H1zM4 0h3v3H4zM5 1h1v1H5zM0 4h3v3H0zM1 5h1v1H1zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z" /></svg>;

/** Template page: upload the card image, then drag and resize the QR slot. Values are fractions of the image. */
export default function Template() {
  const { slug, eventId, refetch, event } = useEvent();
  const toast = useToast();
  const q = useQuery({ queryKey: ["template", slug, eventId], queryFn: () => api<CardTemplate>(`${ev(slug, eventId)}/template/`).catch((e) => { if (e.status === 404) return null; throw e; }) });
  const [slot, setSlot] = useState({ x: 0.375, y: 0.6, size: 0.25 });
  const [dirty, setDirty] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (q.data) { setSlot({ x: q.data.slot_x, y: q.data.slot_y, size: q.data.slot_size }); setDirty(false); } }, [q.data]);

  const save = useMutation({
    mutationFn: (file?: File) => {
      const fd = new FormData();
      fd.append("slot_x", String(slot.x)); fd.append("slot_y", String(slot.y)); fd.append("slot_size", String(slot.size));
      if (file) fd.append("image", file);
      return api<CardTemplate>(`${ev(slug, eventId)}/template/`, { method: q.data ? "PATCH" : "PUT", form: fd });
    },
    onSuccess: () => { q.refetch(); refetch(); setDirty(false); toast(event?.invitation_count ? `Saved. Rebuilding ${event.invitation_count} cards.` : "Template saved"); },
    onError: () => toast("Could not save the template", true),
  });

  const preview = async () => {
    const list = await api<Paginated<Invitation>>(`${ev(slug, eventId)}/invitations/?page_size=1`);
    const g = list.results[0];
    if (!g) { toast("Add a guest first; the preview renders a real card."); return; }
    if (g.card_status !== "ready" || !g.card) { toast("That card is still building. Try again in a moment."); return; }
    setPreviewUrl(g.card);
  };

  // Dragging in image-fraction space so it is independent of zoom.
  const drag = useRef<{ mode: "move" | "resize"; sx: number; sy: number; start: typeof slot } | null>(null);
  const toFrac = (e: RPointerEvent) => { const r = wrap.current!.getBoundingClientRect(); return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, ar: r.width / r.height }; };
  const onDown = (mode: "move" | "resize") => (e: RPointerEvent) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId); const { fx, fy } = toFrac(e); drag.current = { mode, sx: fx, sy: fy, start: slot }; };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current || !q.data) return;
    const { fx, fy, ar } = toFrac(e); const d = drag.current; const dx = fx - d.sx, dy = fy - d.sy;
    const sizeH = (s: number) => s * ar; // slot height as a fraction of image height
    if (d.mode === "move") setSlot({ ...d.start, x: clamp(d.start.x + dx, 0, 1 - d.start.size), y: clamp(d.start.y + dy, 0, 1 - sizeH(d.start.size)) });
    else { const size = clamp(d.start.size + dx, 0.05, Math.min(1 - d.start.x, (1 - d.start.y) / ar)); setSlot({ ...d.start, size }); }
    setDirty(true);
  };
  const onUp = () => { drag.current = null; };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q.data || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault(); const step = (e.shiftKey ? 10 : 1) / q.data.width;
      setSlot((s) => ({ ...s, x: clamp(s.x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0), 0, 1 - s.size), y: clamp(s.y + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0), 0, 1) })); setDirty(true);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [q.data]);

  if (q.isLoading) return <div className="skeleton" style={{ height: 320 }} />;
  const t = q.data;
  const ar = t ? t.width / t.height : 1;
  const px = t ? Math.round(t.width * slot.size) : 0;

  return (
    <div className="template-editor">
      <div className="stack">
        {t ? (
          <div ref={wrap} className="canvas-wrap" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <img src={t.image} alt="Card template" draggable={false} />
            <div className="slot" style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.size * 100}%`, height: `${slot.size * ar * 100}%` }} onPointerDown={onDown("move")}>
              <QR /><span className="handle" onPointerDown={onDown("resize")} />
            </div>
          </div>
        ) : (
          <label className="dropzone" style={{ minHeight: 320, display: "grid", placeItems: "center" }}>
            <div><b>Upload the card design</b><div className="quiet" style={{ fontSize: 13, marginTop: 4 }}>PNG or JPG, the full card at print size. The QR slot comes next.</div></div>
            <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && save.mutate(e.target.files[0])} />
          </label>
        )}
        {t && <label className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>Replace image<input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && setConfirmReplace(e.target.files[0])} /></label>}
      </div>
      <div className="stack" style={{ gap: 20 }}>
        <div><h3>Put the QR code on your card</h3><p className="muted">Drag the box to where the code should sit. Drag the corner to resize. A real code renders inside it on every card, so what you see is what guests get.</p></div>
        {t && (
          <SlotControls
            slot={slot} width={t.width} height={t.height}
            onChange={(next) => { setSlot(next); setDirty(true); }}
          />
        )}
        <p className="quiet" style={{ fontSize: 13 }}>Drag the box, move a slider, or type a number. Arrow keys nudge by one pixel, shift for ten. {t && `At this size the code is ${px}px wide${px < 150 ? ", which is on the small side for a phone camera" : ""}.`}</p>
        <div className="ob-tip" style={{ background: "var(--bg-accent-subtle)", borderRadius: 12, padding: 18 }}>
          <h4 style={{ color: "var(--text-accent)" }}>Check it really scans</h4>
          <p className="muted">Render one finished card at full size, then scan it with your own phone. This is the only honest test.</p>
          <div><Button onClick={preview} disabled={!t}>Preview a real card</Button></div>
        </div>
        <div className="row"><Button variant="primary" size="lg" disabled={!t || !dirty} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save slot</Button>{dirty && <span className="quiet">Unsaved changes</span>}</div>
      </div>
      <Modal open={!!confirmReplace} onClose={() => setConfirmReplace(null)} title="Replace the template?" sub="Three things happen:"
        actions={<><Button variant="ghost" onClick={() => setConfirmReplace(null)}>Cancel</Button><Button variant="danger" loading={save.isPending} onClick={() => { if (confirmReplace) save.mutate(confirmReplace); setConfirmReplace(null); }}>Replace</Button></>}>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}><li>Every guest's card is rebuilt with the new image.</li><li>Cards already downloaded by guests keep the old design until they open their link again.</li><li>The QR slot position is kept, so check it still sits where you want.</li></ul>
      </Modal>
      <Modal open={!!previewUrl} onClose={() => setPreviewUrl(null)} title="A real card" sub="Scan this with your phone's camera. It should open the guest page.">
        {previewUrl && <img src={previewUrl} alt="Rendered card" style={{ borderRadius: 8, border: "1px solid var(--border-default)" }} />}
      </Modal>
    </div>
  );
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));


/**
 * Three sliders bound to the same fractions the drag handles use, with a number box
 * beside each that shows the value in the unit the person chooses (pixels of the real
 * card, or percent). Typing, sliding and dragging all update each other immediately.
 */
function SlotControls({ slot, width, height, onChange }: { slot: { x: number; y: number; size: number }; width: number; height: number; onChange: (s: { x: number; y: number; size: number }) => void }) {
  const [unit, setUnit] = useState<"px" | "%">("px");
  // While a box is being typed in, show the raw text; clamping on every keystroke
  // would turn "300" into 45 → 450 → max. Apply live when in range, clamp on blur.
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  const ar = width / height;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const maxSize = Math.min(1 - slot.x, (1 - slot.y) / ar);
  const rows: { key: "size" | "x" | "y"; label: string; axis: number; min: number; max: number }[] = [
    { key: "size", label: "Size", axis: width, min: 0.05, max: Math.max(0.05, maxSize) },
    { key: "x", label: "From left", axis: width, min: 0, max: 1 - slot.size },
    { key: "y", label: "From top", axis: height, min: 0, max: 1 - slot.size * ar },
  ];
  const toUnit = (frac: number, axis: number) => (unit === "px" ? Math.round(frac * axis) : Math.round(frac * 1000) / 10);
  const fromUnit = (v: number, axis: number) => (unit === "px" ? v / axis : v / 100);
  const set = (key: "size" | "x" | "y", frac: number) => {
    const r = rows.find((x) => x.key === key)!;
    onChange({ ...slot, [key]: clamp(frac, r.min, r.max) });
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="kicker">Position and size</span>
        <div className="seg">
          <button type="button" className={unit === "px" ? "on" : ""} onClick={() => setUnit("px")}>px</button>
          <button type="button" className={unit === "%" ? "on" : ""} onClick={() => setUnit("%")}>%</button>
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="slot-row">
          <label htmlFor={`slot-${r.key}`}>{r.label}</label>
          <input id={`slot-${r.key}`} type="range" min={r.min} max={r.max} step={1 / r.axis} value={clamp(slot[r.key], r.min, r.max)}
            onChange={(e) => set(r.key, Number(e.target.value))} style={{ "--p": `${((slot[r.key] - r.min) / Math.max(1e-6, r.max - r.min)) * 100}%` } as React.CSSProperties} />
          <div className="slot-num">
            <input type="number" className="mono" value={draft?.key === r.key ? draft.text : toUnit(slot[r.key], r.axis)} min={toUnit(r.min, r.axis)} max={toUnit(r.max, r.axis)} step={unit === "px" ? 1 : 0.1}
              onChange={(e) => { setDraft({ key: r.key, text: e.target.value }); const v = Number(e.target.value); const f = fromUnit(v, r.axis); if (e.target.value !== "" && !Number.isNaN(v) && f >= r.min && f <= r.max) set(r.key, f); }}
              onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && !Number.isNaN(v)) set(r.key, fromUnit(v, r.axis)); setDraft(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            <span>{unit}</span>
          </div>
        </div>
      ))}
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" onClick={() => set("x", (1 - slot.size) / 2)}>Centre left to right</Button>
        <Button size="sm" onClick={() => set("y", (1 - slot.size * ar) / 2)}>Centre top to bottom</Button>
      </div>
      <p className="quiet" style={{ fontSize: 12 }}>Card is {width} × {height} px. The code will be {Math.round(slot.size * width)} px square.</p>
    </div>
  );
}
