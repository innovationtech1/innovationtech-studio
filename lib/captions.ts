// Subtítulos animados (estilo TikTok): textos que aparecen palabra por palabra
// o con la palabra que se está diciendo resaltada. Se usan en reels y en el editor de video.

export type Word = { w: string; start: number; end: number };
export type Cue = { start: number; end: number; words: Word[] };
export type CaptionMode = "karaoke" | "words";

// Reparte las palabras de un guion a lo largo de la duración de la voz
// (las palabras largas y las pausas de puntuación duran un poco más).
export function wordsFromScript(script: string, duration: number, offset = 0): Word[] {
  const raw = script.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!raw.length || duration <= 0) return [];
  const weight = (w: string) => 1 + w.replace(/[^\p{L}\p{N}]/gu, "").length / 6 + (/[.,;:!?…]$/.test(w) ? 0.6 : 0);
  const total = raw.reduce((s, w) => s + weight(w), 0);
  const usable = duration * 0.97;
  let t = offset + duration * 0.015;
  return raw.map((w) => {
    const d = (weight(w) / total) * usable;
    const word = { w, start: t, end: t + d };
    t += d;
    return word;
  });
}

// Agrupa palabras en frases cortas para la pantalla (máx. 4 palabras, corta en signos de puntuación o pausas).
export function cuesFromWords(words: Word[], maxWords = 4, maxGap = 0.7): Cue[] {
  const cues: Cue[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && (cur.length >= maxWords || (prev && w.start - prev.end > maxGap))) flush();
    cur.push(w);
    if (/[.!?…;:]$/.test(w.w)) flush();
  });
  flush();
  // Que cada frase se quede en pantalla hasta que empiece la siguiente (sin parpadeos)
  for (let i = 0; i < cues.length - 1; i++) {
    const gap = cues[i + 1].start - cues[i].end;
    if (gap > 0 && gap < 0.6) cues[i].end = cues[i + 1].start;
  }
  return cues;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

// Dibuja una frase en el tiempo t. centerY = centro vertical del bloque de texto.
export function drawCue(
  ctx: CanvasRenderingContext2D,
  cue: Cue,
  t: number,
  o: { W: number; centerY: number; size: number; font: string; color: string; highlight: string; mode: CaptionMode; maxWidth?: number; uppercase?: boolean }
) {
  if (t < cue.start || t > cue.end + 0.05) return;
  const { W, size } = o;
  ctx.save();
  ctx.font = `800 ${size}px ${o.font}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const words = cue.words.map((w) => ({ ...w, text: o.uppercase ? w.w.toUpperCase() : w.w }));
  const space = ctx.measureText(" ").width;
  const maxW = o.maxWidth ?? W * 0.86;
  // Repartir en líneas
  const lines: (typeof words)[] = [];
  let line: typeof words = [];
  let lw = 0;
  for (const w of words) {
    const ww = ctx.measureText(w.text).width;
    if (line.length && lw + space + ww > maxW) {
      lines.push(line);
      line = [];
      lw = 0;
    }
    lw += (line.length ? space : 0) + ww;
    line.push(w);
  }
  if (line.length) lines.push(line);
  const lh = size * 1.28;
  let y = o.centerY - ((lines.length - 1) * lh) / 2;
  const padX = size * 0.22;
  for (const ln of lines) {
    const widths = ln.map((w) => ctx.measureText(w.text).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (ln.length - 1);
    let x = W / 2 - total / 2;
    ln.forEach((w, k) => {
      const ww = widths[k];
      const active = t >= w.start && t < w.end + 0.02;
      const shown = o.mode === "karaoke" || t >= w.start;
      if (shown) {
        const p = easeOut((t - w.start) / 0.18);
        const scale = o.mode === "words" ? 0.6 + 0.4 * p : active ? 1 + 0.08 * (1 - Math.abs(2 * Math.min(1, (t - w.start) / Math.max(0.1, w.end - w.start)) - 1)) : 1;
        ctx.save();
        ctx.translate(x + ww / 2, y);
        ctx.scale(scale, scale);
        if (active && o.mode === "karaoke") {
          ctx.fillStyle = o.highlight;
          roundRect(ctx, -ww / 2 - padX, -size * 0.62, ww + padX * 2, size * 1.24, size * 0.22);
          ctx.fill();
        }
        ctx.lineJoin = "round";
        ctx.lineWidth = size * 0.16;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        if (!(active && o.mode === "karaoke")) ctx.strokeText(w.text, -ww / 2, 0);
        ctx.fillStyle = active && o.mode === "words" ? o.highlight : o.color;
        ctx.globalAlpha = o.mode === "words" ? p : 1;
        ctx.fillText(w.text, -ww / 2, 0);
        ctx.restore();
      }
      x += ww + space;
    });
    y += lh;
  }
  ctx.restore();
}

// ---------- Transcripción (subtítulos automáticos de un video) ----------

// Convierte audio a WAV mono de 16 kHz (lo que necesita el reconocimiento de voz)
export async function toWav16k(buffer: AudioBuffer, from = 0, to = buffer.duration): Promise<Blob> {
  const rate = 16000;
  const len = Math.max(1, Math.ceil((to - from) * rate));
  const off = new OfflineAudioContext(1, len, rate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start(0, from, to - from);
  const out = await off.startRendering();
  const data = out.getChannelData(0);
  const ab = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(ab);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + data.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([ab], { type: "audio/wav" });
}

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
