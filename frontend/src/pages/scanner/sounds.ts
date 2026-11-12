/**
 * Scanner sounds, synthesised with the Web Audio API.
 * No audio files: nothing to download at the door, works offline, and the tones
 * take a few lines. iOS keeps the context suspended until a user gesture, so
 * `unlock()` is called from the first tap on the page.
 */
const KEY = "ti.scan.sound";
let ctx: AudioContext | null = null;

function context() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function soundEnabled() { return localStorage.getItem(KEY) !== "off"; }
export function setSoundEnabled(on: boolean) { localStorage.setItem(KEY, on ? "on" : "off"); if (on) void unlock(); }

export async function unlock() {
  const c = context();
  if (c && c.state === "suspended") { try { await c.resume(); } catch { /* ignored */ } }
}

type Note = { f: number; at: number; dur: number; type?: OscillatorType; gain?: number };

function play(notes: Note[]) {
  if (!soundEnabled()) return;
  const c = context(); if (!c || c.state !== "running") return;
  const t0 = c.currentTime;
  for (const n of notes) {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = n.type ?? "sine"; o.frequency.setValueAtTime(n.f, t0 + n.at);
    const peak = n.gain ?? 0.18;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    o.connect(g).connect(c.destination);
    o.start(t0 + n.at); o.stop(t0 + n.at + n.dur + 0.02);
  }
}

/** Code seen, request in flight: one short, quiet tick. */
export const tick = () => play([{ f: 1320, at: 0, dur: 0.06, gain: 0.08, type: "triangle" }]);
/** Admitted: two rising notes, a clean "ding-ding". */
export const admitted = () => play([{ f: 988, at: 0, dur: 0.16 }, { f: 1319, at: 0.13, dur: 0.32 }]);
/** Already in or unknown: a low double buzz that is unmistakable in a noisy entrance. */
export const rejected = () => play([{ f: 196, at: 0, dur: 0.14, type: "square", gain: 0.12 }, { f: 165, at: 0.2, dur: 0.22, type: "square", gain: 0.12 }]);
/** Needs attention (wrong event, doors closed): a single mid tone. */
export const attention = () => play([{ f: 523, at: 0, dur: 0.22, type: "triangle" }, { f: 523, at: 0.28, dur: 0.22, type: "triangle" }]);
