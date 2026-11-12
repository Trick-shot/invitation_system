/**
 * The big mark on the verdict sheet. The disc fades in once the sheet has
 * arrived, then the glyph draws. Nothing shakes, bounces or ripples: the door
 * person reads it at a glance, and motion that keeps going reads as a glitch.
 *
 * Plain CSS animations, not framer-motion. On iPhone, framer hands opacity and
 * transform to the browser's own animation engine and swaps back to an inline
 * style when it finishes; Safari can paint one frame in between at the starting
 * value, which showed as the mark blinking. A CSS animation with fill "both"
 * simply holds its last frame.
 */
export function VerdictMark({ kind, size = 96 }: { kind: "ok" | "bad" | "warn"; size?: number }) {
  const color = kind === "ok" ? "var(--verdict-admitted)" : kind === "bad" ? "var(--verdict-full)" : "var(--verdict-unknown)";
  const stroke = { stroke: "#fff", strokeWidth: 7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, pathLength: 1 };
  return (
    <svg className="vm" width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden>
      <circle cx="60" cy="60" r="52" fill={color} />
      {kind === "ok" && <path className="draw" style={{ animationDuration: ".35s" }} d="M38 62 L53 76 L83 44" {...stroke} />}
      {kind === "bad" && <>
        <path className="draw" d="M42 42 L78 78" {...stroke} />
        <path className="draw" style={{ animationDelay: ".68s" }} d="M78 42 L42 78" {...stroke} />
      </>}
      {kind === "warn" && <>
        <path className="draw" d="M60 34 L60 68" {...stroke} />
        <circle className="dot" cx="60" cy="84" r="4.5" fill="#fff" />
      </>}
    </svg>
  );
}
