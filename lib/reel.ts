import { cuesFromWords, drawCue, wordsFromScript } from "./captions";
import { renderMusic, MusicStyleId } from "./music";
import fixWebmDuration from "fix-webm-duration";
// Motor de reels: arma un video animado dentro del navegador, gratis y sin límite.
// Dibuja cada escena en un <canvas> (zoom/movimiento suave + transiciones + textos)
// y lo graba con MediaRecorder, incluyendo la voz en off si existe.

export type ReelFormat = "9:16" | "1:1" | "16:9";

export type ReelOptions = {
  images: string[]; // data URLs o URLs con CORS
  captions: string[]; // un texto por escena (puede ir vacío)
  secondsPerSlide: number;
  format: ReelFormat;
  accent: string; // color de acento (hex)
  brandName: string;
  cta: string; // texto del cierre
  logo?: string; // data URL opcional
  font?: string; // letra de la marca para los textos
  voice?: string; // data URL de audio opcional
  subtitles?: { script: string; highlight: string } | null; // subtítulos palabra por palabra de la voz en off
  music?: { style: MusicStyleId; seed: number; volume: number } | null; // música gratis de fondo
  onStatus?: (msg: string) => void;
  onProgress?: (fraction: number) => void;
  previewCanvas?: HTMLCanvasElement; // para ver el reel mientras se graba
};

export type ReelResult = { url: string; blob: Blob; ext: "mp4" | "webm"; seconds: number };

const SIZES: Record<ReelFormat, [number, number]> = {
  "9:16": [720, 1280],
  "1:1": [1080, 1080],
  "16:9": [1280, 720],
};
const FPS = 30;
let FONT_STACK = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const FADE = 0.6; // segundos de transición
const OUTRO = 3; // segundos del cierre

export function supportedRecording(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const ok = (m: string) => MediaRecorder.isTypeSupported(m);
  // 1) MP4 con H.264: el formato que aceptan iPhone, Instagram, TikTok y WhatsApp.
  for (const m of [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.4D401F,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1",
  ])
    if (ok(m)) return { mime: m, ext: "mp4" };
  // 2) WebM (Chrome/Edge sin H.264). Se marca como WebM para no confundir.
  for (const m of ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"])
    if (ok(m)) return { mime: m, ext: "webm" };
  // 3) Safari: su "video/mp4" genérico ya es H.264.
  if (ok("video/mp4")) return { mime: "video/mp4", ext: "mp4" };
  return null;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  let url = src;
  if (!src.startsWith("data:") && !src.startsWith("blob:")) {
    // Traemos la imagen como archivo para que el video no quede "bloqueado" por seguridad del navegador.
    const res = await fetch(src).catch(() => null);
    if (!res || !res.ok) throw new Error("No se pudo cargar una de las imágenes (quizá el enlace ya caducó). Descárgala y súbela desde tu dispositivo.");
    url = URL.createObjectURL(await res.blob());
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Una de las imágenes no se pudo abrir."));
    img.src = url;
  });
}

function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Dibuja la imagen cubriendo todo el lienzo, con zoom y desplazamiento (efecto Ken Burns).
function drawKenBurns(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number, t: number, i: number) {
  const zoomIn = i % 2 === 0;
  const z = zoomIn ? 1.0 + 0.12 * t : 1.12 - 0.12 * t;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const [dx, dy] = dirs[i % dirs.length];
  const base = Math.max(W / img.width, H / img.height) * z;
  const w = img.width * base;
  const h = img.height * base;
  const slackX = (w - W) / 2;
  const slackY = (h - H) / 2;
  const x = -slackX + dx * slackX * (t - 0.5) * 0.9;
  const y = -slackY + dy * slackY * (t - 0.5) * 0.9;
  ctx.drawImage(img, x, y, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
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

function drawCaption(ctx: CanvasRenderingContext2D, text: string, W: number, H: number, appear: number, accent: string) {
  if (!text.trim()) return;
  const unit = Math.min(W, H);
  const size = Math.round(unit * 0.058);
  ctx.font = `800 ${size}px ${FONT_STACK}`;
  const pad = unit * 0.045;
  const maxW = W * 0.84 - pad * 2;
  const lines = wrap(ctx, text, maxW);
  const lineH = size * 1.22;
  const boxW = Math.min(W * 0.84, Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
  const boxH = lines.length * lineH + pad * 1.4;
  const a = ease(Math.min(1, appear));
  const x = (W - boxW) / 2;
  const y = H * (H > W ? 0.7 : 0.66) - boxH / 2 + (1 - a) * unit * 0.04;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(7, 13, 31, 0.78)";
  roundRect(ctx, x, y, boxW, boxH, unit * 0.025);
  ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, x, y, unit * 0.014, boxH, unit * 0.007);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, k) => ctx.fillText(l, W / 2, y + pad * 0.7 + k * lineH));
  ctx.restore();
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, W: number, H: number) {
  if (!logo) return;
  const s = Math.min(W, H) * 0.13;
  const r = s / Math.max(logo.width, logo.height);
  const w = logo.width * r;
  const h = logo.height * r;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(logo, W - w - s * 0.25, s * 0.25 + (H > W ? s * 0.4 : 0), w, h);
  ctx.restore();
}

function drawOutro(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  o: { brandName: string; cta: string; accent: string; logo: HTMLImageElement | null }
) {
  const unit = Math.min(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0d1630");
  g.addColorStop(1, "#070d1f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const a = ease(Math.min(1, t * 2.2));
  ctx.save();
  ctx.globalAlpha = a;
  let y = H / 2 - unit * 0.18;
  if (o.logo) {
    const s = unit * 0.3;
    const r = s / Math.max(o.logo.width, o.logo.height);
    ctx.drawImage(o.logo, (W - o.logo.width * r) / 2, y - s * 0.6, o.logo.width * r, o.logo.height * r);
    y += s * 0.55;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(unit * 0.075)}px ${FONT_STACK}`;
  if (o.brandName) {
    wrap(ctx, o.brandName, W * 0.85).forEach((l) => {
      ctx.fillText(l, W / 2, y);
      y += unit * 0.09;
    });
  }
  ctx.fillStyle = o.accent;
  ctx.fillRect(W / 2 - unit * 0.08, y + unit * 0.01, unit * 0.16 * a, unit * 0.008);
  y += unit * 0.05;
  if (o.cta) {
    ctx.fillStyle = "#dbe2f3";
    ctx.font = `600 ${Math.round(unit * 0.05)}px ${FONT_STACK}`;
    wrap(ctx, o.cta, W * 0.82).forEach((l) => {
      ctx.fillText(l, W / 2, y);
      y += unit * 0.065;
    });
  }
  ctx.restore();
}

export async function renderReel(o: ReelOptions): Promise<ReelResult> {
  const SYSTEM = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  FONT_STACK = SYSTEM;
  if (o.font && typeof document !== "undefined") {
    try {
      await Promise.race([document.fonts.load(`800 48px "${o.font}"`), new Promise((r) => setTimeout(r, 2500))]);
      if (document.fonts.check(`800 48px "${o.font}"`)) FONT_STACK = `"${o.font}", ${SYSTEM}`;
    } catch {
      /* se usa la letra del sistema */
    }
  }
  if (o.images.length === 0) throw new Error("Elige al menos una imagen para el reel.");
  const rec = supportedRecording();
  if (!rec) throw new Error("Este navegador no puede grabar video. Usa Chrome, Edge o Safari actualizados.");

  const [W, H] = SIZES[o.format];
  const imgs = await Promise.all(o.images.map(loadImage));
  const logo = o.logo ? await loadImage(o.logo) : null;

  // Voz en off: decide la duración mínima del reel.
  let audioCtx: AudioContext | null = null;
  let voiceBuffer: AudioBuffer | null = null;
  if (o.voice) {
    audioCtx = new AudioContext();
    const bytes = await (await fetch(o.voice)).arrayBuffer();
    voiceBuffer = await audioCtx.decodeAudioData(bytes);
  }
  let per = Math.max(1.5, o.secondsPerSlide);
  if (voiceBuffer) per = Math.max(per, (voiceBuffer.duration + 0.5) / imgs.length);
  const slidesTime = per * imgs.length;
  // Subtítulos de la voz: cada palabra se reparte a lo largo del audio
  const subCues =
    voiceBuffer && o.subtitles?.script.trim() ? cuesFromWords(wordsFromScript(o.subtitles.script, voiceBuffer.duration, 0.05)) : [];
  const total = slidesTime + OUTRO;

  // Música de fondo (se compone a la medida exacta del reel)
  let musicBuffer: AudioBuffer | null = null;
  if (o.music) {
    o.onStatus?.("🎵 Componiendo música…");
    musicBuffer = await renderMusic({ style: o.music.style, seed: o.music.seed, duration: total + 0.3 });
    if (!audioCtx) audioCtx = new AudioContext();
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const pctx = o.previewCanvas?.getContext("2d") || null;
  if (o.previewCanvas) {
    o.previewCanvas.width = W;
    o.previewCanvas.height = H;
  }

  const draw = (time: number) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (time < slidesTime) {
      const i = Math.min(imgs.length - 1, Math.floor(time / per));
      const local = time - i * per;
      drawKenBurns(ctx, imgs[i], W, H, local / per, i);
      // transición: la siguiente escena aparece encima
      if (local > per - FADE && i < imgs.length - 1) {
        ctx.save();
        ctx.globalAlpha = (local - (per - FADE)) / FADE;
        drawKenBurns(ctx, imgs[i + 1], W, H, 0, i + 1);
        ctx.restore();
      }
      const fadeOut = local > per - FADE ? 1 - (local - (per - FADE)) / FADE : 1;
      ctx.save();
      ctx.globalAlpha = fadeOut;
      drawCaption(ctx, o.captions[i] || "", W, H, (local - 0.15) / 0.5, o.accent);
      ctx.restore();
      drawLogo(ctx, logo, W, H);
      const cue = subCues.find((c) => time >= c.start && time <= c.end + 0.05);
      if (cue)
        drawCue(ctx, cue, time, {
          W,
          centerY: H * (H > W ? 0.86 : 0.85),
          size: Math.round(Math.min(W, H) * 0.062),
          font: FONT_STACK,
          color: "#ffffff",
          highlight: o.subtitles!.highlight,
          mode: "karaoke",
          uppercase: true,
        });
    } else {
      const t = time - slidesTime;
      if (t < FADE) {
        drawKenBurns(ctx, imgs[imgs.length - 1], W, H, 1, imgs.length - 1);
        ctx.save();
        ctx.globalAlpha = t / FADE;
        drawOutro(ctx, W, H, t, { brandName: o.brandName, cta: o.cta, accent: o.accent, logo });
        ctx.restore();
      } else drawOutro(ctx, W, H, t, { brandName: o.brandName, cta: o.cta, accent: o.accent, logo });
    }
    pctx?.drawImage(canvas, 0, 0);
  };

  draw(0);
  const stream = canvas.captureStream(FPS);
  let source: AudioBufferSourceNode | null = null;
  let musicSource: AudioBufferSourceNode | null = null;
  let musicGain: GainNode | null = null;
  if (audioCtx && (voiceBuffer || musicBuffer)) {
    const dest = audioCtx.createMediaStreamDestination();
    if (voiceBuffer) {
      source = audioCtx.createBufferSource();
      source.buffer = voiceBuffer;
      source.connect(dest);
    }
    if (musicBuffer && o.music) {
      musicSource = audioCtx.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicGain = audioCtx.createGain();
      musicGain.gain.value = o.music.volume;
      musicSource.connect(musicGain).connect(dest);
    }
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  }

  const recorder = new MediaRecorder(stream, { mimeType: rec.mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: rec.mime.split(";")[0] }));
  });

  recorder.start(250);
  o.onStatus?.("");
  if (audioCtx) await audioCtx.resume();
  if (audioCtx && musicSource && musicGain && o.music) {
    const now = audioCtx.currentTime;
    musicSource.start(now);
    if (voiceBuffer) {
      // La música baja mientras habla la voz y vuelve a subir al terminar
      const v = o.music.volume;
      musicGain.gain.setValueAtTime(v, now);
      musicGain.gain.linearRampToValueAtTime(v * 0.35, now + 0.3);
      musicGain.gain.setValueAtTime(v * 0.35, now + 0.3 + voiceBuffer.duration);
      musicGain.gain.linearRampToValueAtTime(v, now + 0.8 + voiceBuffer.duration);
    }
  }
  if (audioCtx && source) source.start(audioCtx.currentTime + 0.3);
  const start = performance.now();

  // Usamos un temporizador (no requestAnimationFrame) para que siga grabando
  // aunque la ventana pierda el foco por un momento.
  await new Promise<void>((resolve) => {
    const tick = () => {
      const time = (performance.now() - start) / 1000;
      if (time >= total) {
        draw(total - 0.001);
        resolve();
        return;
      }
      draw(time);
      o.onProgress?.(time / total);
      setTimeout(tick, 1000 / FPS);
    };
    tick();
  });

  await new Promise((r) => setTimeout(r, 300));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  let blob = await done;
  // WebM grabado en el navegador no trae la duración: se la escribimos
  if (rec.ext === "webm") blob = await fixWebmDuration(blob, total * 1000, { logger: false }).catch(() => blob);
  audioCtx?.close().catch(() => {});
  o.onProgress?.(1);
  return { url: URL.createObjectURL(blob), blob, ext: rec.ext, seconds: Math.round(total) };
}
