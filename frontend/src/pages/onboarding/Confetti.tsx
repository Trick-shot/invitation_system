import { useEffect, useRef } from "react";

/**
 * One burst of confetti in the brand palette when setup is done. Drawn on a
 * canvas (no library, no network), about three seconds, then it removes
 * itself. Skipped entirely for people who ask their device for less motion.
 */
const COLORS = ["#7C5CE0", "#D9F04A", "#C9B8F5", "#F08A5D", "#6341A8"];

export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr; ctx.scale(dpr, dpr);
    const N = W < 600 ? 110 : 180;
    const bits = Array.from({ length: N }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
      const speed = 9 + Math.random() * 9;
      return {
        x: fromLeft ? W * 0.18 : W * 0.82, y: H * 0.62,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 6,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
        color: COLORS[i % COLORS.length], round: Math.random() < 0.3,
      };
    });
    const start = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const age = (t - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, Math.min(1, 3.2 - age));
      for (const b of bits) {
        b.vy += 0.32; b.vx *= 0.985; b.vy *= 0.985;
        b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.color;
        if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.w / 2.4, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)) + 1);
        ctx.restore();
      }
      if (age < 3.3) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 60 }} />;
}
