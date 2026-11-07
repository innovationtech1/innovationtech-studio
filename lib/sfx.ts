// Efectos de sonido para videos y comerciales (grabaciones con licencia libre en /public/samples/oneshots).
// Se colocan en un momento del video y se mezclan con la música al reproducir y al exportar.

import { loadBank } from "./samples";

export type SfxId =
  | "whoosh"
  | "swoosh"
  | "woosh_oscuro"
  | "impacto"
  | "golpe"
  | "boom"
  | "subida"
  | "caida"
  | "ding"
  | "campana"
  | "magia"
  | "caja"
  | "pop"
  | "chasquido"
  | "rebobinar"
  | "scratch"
  | "aviso";

export type SfxItem = { id: string; kind: SfxId; at: number; volume: number };

// sample: grabación; gain: volumen base; hit: el golpe principal cae en el momento elegido
export const SFX: { id: SfxId; label: string; emoji: string; sample: string; gain: number; hit?: boolean; maxDur?: number }[] = [
  { id: "whoosh", label: "Whoosh", emoji: "💨", sample: "fx_whoosh", gain: 0.9, hit: true },
  { id: "swoosh", label: "Swoosh rápido", emoji: "🌬️", sample: "fx_swoosh", gain: 0.9 },
  { id: "woosh_oscuro", label: "Whoosh grave", emoji: "🌪️", sample: "fx_whoosh_dark", gain: 0.9, hit: true },
  { id: "impacto", label: "Impacto", emoji: "💥", sample: "fx_impact", gain: 0.9 },
  { id: "golpe", label: "Golpe seco", emoji: "👊", sample: "fx_impact2", gain: 0.9 },
  { id: "boom", label: "Boom de cine", emoji: "🎬", sample: "fx_boom", gain: 0.9, maxDur: 5 },
  { id: "subida", label: "Subida (platillo)", emoji: "📈", sample: "swell", gain: 0.9, hit: true, maxDur: 2.6 },
  { id: "caida", label: "Caída de bajo", emoji: "📉", sample: "fx_drop", gain: 0.8 },
  { id: "ding", label: "Ding", emoji: "🔔", sample: "fx_ding", gain: 0.8, maxDur: 3 },
  { id: "campana", label: "Campanita", emoji: "🛎️", sample: "fx_bell", gain: 0.8 },
  { id: "magia", label: "Magia / brillo", emoji: "✨", sample: "fx_chimes", gain: 0.8, maxDur: 3.5 },
  { id: "caja", label: "Caja registradora", emoji: "💰", sample: "fx_cash", gain: 0.9 },
  { id: "pop", label: "Pop", emoji: "🫧", sample: "fx_pop", gain: 0.8 },
  { id: "chasquido", label: "Chasquido", emoji: "🫰", sample: "fx_snap", gain: 0.8 },
  { id: "rebobinar", label: "Rebobinar", emoji: "⏪", sample: "fx_rewind", gain: 0.8, maxDur: 2.5 },
  { id: "scratch", label: "Scratch de DJ", emoji: "🎧", sample: "fx_scratch", gain: 0.8 },
  { id: "aviso", label: "Notificación", emoji: "📲", sample: "fx_ping", gain: 0.7 },
];

const byId = (id: SfxId) => SFX.find((s) => s.id === id) || SFX[0];

// Arma una pista con todos los efectos colocados (mismo largo que el video).
export async function renderSfx(items: SfxItem[], total: number, sampleRate = 44100): Promise<AudioBuffer | null> {
  if (!items.length || total <= 0) return null;
  const bank = await loadBank([], items.map((i) => byId(i.kind).sample));
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * (total + 0.1)), sampleRate);
  for (const it of items) {
    const def = byId(it.kind);
    const buf = bank.shots.get(def.sample);
    if (!buf) continue;
    // Los efectos que «llegan» (whoosh, subida) terminan su punto fuerte en el momento elegido
    const lead = def.hit ? bank.peaks.get(def.sample) || 0 : 0;
    const start = it.at - lead;
    const skip = Math.max(0, -start);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    const v = def.gain * it.volume;
    const len = Math.min(buf.duration - skip, def.maxDur ?? buf.duration);
    const t0 = Math.max(0, start);
    g.gain.setValueAtTime(v, t0);
    g.gain.setValueAtTime(v, t0 + Math.max(0, len - 0.3));
    g.gain.linearRampToValueAtTime(0, t0 + len);
    s.connect(g).connect(ctx.destination);
    s.start(t0, skip, len);
  }
  return ctx.startRendering();
}

// Escuchar un efecto antes de agregarlo
export async function previewSfx(kind: SfxId, ctx: AudioContext): Promise<AudioBufferSourceNode | null> {
  const def = byId(kind);
  const bank = await loadBank([], [def.sample]);
  const buf = bank.shots.get(def.sample);
  if (!buf) return null;
  await ctx.resume();
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = def.gain;
  s.connect(g).connect(ctx.destination);
  s.start(0, 0, def.maxDur ?? buf.duration);
  return s;
}
