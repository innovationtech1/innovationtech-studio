// Motor del editor de video: dibuja cada cuadro (clips, transiciones, filtros y textos),
// reproduce con sonido y exporta grabando el lienzo + la mezcla de audio. Todo en el navegador.

import { renderMusic, MusicStyleId } from "./music";
import { supportedRecording } from "./reel";
import fixWebmDuration from "fix-webm-duration";

export type FormatId = "9:16" | "1:1" | "16:9";
export const SIZES: Record<FormatId, [number, number]> = { "9:16": [720, 1280], "1:1": [1080, 1080], "16:9": [1280, 720] };

export type FilterId = "none" | "vivido" | "calido" | "frio" | "bn" | "vintage" | "dramatico" | "suave";
export const FILTERS: { id: FilterId; label: string; css: string }[] = [
  { id: "none", label: "Original", css: "none" },
  { id: "vivido", label: "Vívido", css: "saturate(1.4) contrast(1.1)" },
  { id: "calido", label: "Cálido", css: "sepia(0.25) saturate(1.3) brightness(1.03)" },
  { id: "frio", label: "Frío", css: "hue-rotate(-12deg) saturate(1.1) brightness(1.02)" },
  { id: "dramatico", label: "Dramático", css: "contrast(1.35) saturate(0.85) brightness(0.92)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.45) contrast(0.9) saturate(0.8) brightness(1.05)" },
  { id: "suave", label: "Suave", css: "contrast(0.9) brightness(1.08) saturate(0.9)" },
  { id: "bn", label: "B/N", css: "grayscale(1) contrast(1.15)" },
];

export type TransitionId = "cut" | "fade" | "slide" | "zoom" | "flash" | "wipe";
export const TRANSITIONS: { id: TransitionId; label: string }[] = [
  { id: "cut", label: "Corte" },
  { id: "fade", label: "Fundido" },
  { id: "slide", label: "Deslizar" },
  { id: "zoom", label: "Zoom" },
  { id: "flash", label: "Destello" },
  { id: "wipe", label: "Barrido" },
];

export type Clip = {
  id: string;
  fileId: string; // archivo guardado (varios clips pueden compartirlo al dividir/duplicar)
  kind: "video" | "image";
  name: string;
  duration: number; // duración del archivo (videos) o duración en pantalla (fotos)
  trimStart: number;
  trimEnd: number;
  speed: number;
  volume: number; // 0..1
  filter: FilterId;
  transition: TransitionId; // hacia el siguiente clip
  fit: "cover" | "contain";
  kenBurns: boolean;
  thumb?: string;
};

export type TextOverlay = {
  id: string;
  text: string;
  start: number;
  end: number;
  position: "top" | "center" | "bottom";
  style: "titulo" | "subtitulo" | "etiqueta";
  color: string;
  bg: string; // "" = sin fondo
  anim: "fade" | "slide" | "pop" | "type";
};

export type MusicSettings = {
  source: "none" | "generated" | "upload";
  style: MusicStyleId;
  seed: number;
  volume: number; // 0..1
  uploadName?: string;
};

export type Project = {
  format: FormatId;
  background: "blur" | "black";
  clips: Clip[];
  texts: TextOverlay[];
  music: MusicSettings;
  clipVolume: number; // volumen general del audio de los videos
};

export const newProject = (): Project => ({
  format: "9:16",
  background: "blur",
  clips: [],
  texts: [],
  music: { source: "generated", style: "pop", seed: 1, volume: 0.6 },
  clipVolume: 1,
});

export const uid = () => Math.random().toString(36).slice(2, 10);
export const clipLength = (c: Clip) => Math.max(0.2, (c.trimEnd - c.trimStart) / c.speed);

// Momento de inicio de cada clip en la línea de tiempo (las transiciones se superponen)
export function layout(clips: Clip[]) {
  const starts: number[] = [];
  const overlaps: number[] = []; // superposición con el siguiente
  let t = 0;
  clips.forEach((c, i) => {
    starts.push(t);
    const next = clips[i + 1];
    const ov = next && c.transition !== "cut" ? Math.min(0.6, clipLength(c) / 3, clipLength(next) / 3) : 0;
    overlaps.push(ov);
    t += clipLength(c) - ov;
  });
  const total = clips.length ? starts[starts.length - 1] + clipLength(clips[clips.length - 1]) : 0;
  return { starts, overlaps, total };
}

export const supportsCanvasFilter = () => {
  try {
    const c = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D & { filter?: string };
    return typeof c.filter === "string";
  } catch {
    return false;
  }
};

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// ---------- Motor ----------

type Media = { el: HTMLVideoElement | HTMLImageElement; gain?: GainNode; ready: Promise<void> };

export class VideoEngine {
  project: Project = newProject();
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  audio: AudioContext | null = null;
  master: GainNode | null = null;
  recDest: MediaStreamAudioDestinationNode | null = null;
  media = new Map<string, Media>();
  srcs = new Map<string, string>(); // id de clip -> URL del archivo
  musicBuffer: AudioBuffer | null = null;
  musicKey = "";
  musicNode: AudioBufferSourceNode | null = null;
  musicGain: GainNode | null = null;
  playing = false;
  time = 0;
  private startWall = 0;
  private startTime = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onTime?: (t: number) => void;
  onEnd?: () => void;
  canFilter = supportsCanvasFilter();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  private ensureAudio() {
    if (this.audio) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audio = new Ctx();
    this.master = this.audio.createGain();
    this.master.connect(this.audio.destination);
    this.recDest = this.audio.createMediaStreamDestination();
    this.master.connect(this.recDest);
    this.musicGain = this.audio.createGain();
    this.musicGain.connect(this.master);
  }

  setProject(p: Project) {
    this.project = p;
    const [W, H] = SIZES[p.format];
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    // quitar medios de clips eliminados
    for (const id of [...this.media.keys()]) if (!p.clips.find((c) => c.id === id)) this.media.delete(id);
    this.applyVolumes();
    if (!this.playing) this.draw(this.time);
  }

  // Registra el archivo de un clip y crea su elemento de video/imagen
  addSource(clip: Clip, url: string) {
    this.srcs.set(clip.id, url);
    this.loadMedia(clip);
  }

  private loadMedia(clip: Clip): Media | undefined {
    const url = this.srcs.get(clip.id);
    if (!url) return;
    let m = this.media.get(clip.id);
    if (m) return m;
    if (clip.kind === "image") {
      const im = new Image();
      const ready = new Promise<void>((res) => {
        im.onload = () => res();
        im.onerror = () => res();
      });
      im.src = url;
      m = { el: im, ready };
    } else {
      const v = document.createElement("video");
      v.src = url;
      v.playsInline = true;
      v.preload = "auto";
      v.crossOrigin = "anonymous";
      const ready = new Promise<void>((res) => {
        if (v.readyState >= 2) res();
        v.addEventListener("loadeddata", () => res(), { once: true });
        v.addEventListener("error", () => res(), { once: true });
      });
      m = { el: v, ready };
    }
    this.media.set(clip.id, m);
    return m;
  }

  private connectAudio(clip: Clip, m: Media) {
    if (clip.kind !== "video" || m.gain || !this.audio) return;
    try {
      const src = this.audio.createMediaElementSource(m.el as HTMLVideoElement);
      m.gain = this.audio.createGain();
      src.connect(m.gain).connect(this.master!);
      this.applyVolumes();
    } catch {
      /* ya conectado */
    }
  }

  applyVolumes() {
    for (const c of this.project.clips) {
      const m = this.media.get(c.id);
      if (m?.gain) m.gain.gain.value = c.volume * this.project.clipVolume;
    }
    if (this.musicGain) this.musicGain.gain.value = this.project.music.volume;
  }

  // ---------- Música ----------
  async prepareMusic(uploaded: AudioBuffer | null, onStatus?: (s: string) => void) {
    const { total } = layout(this.project.clips);
    const mu = this.project.music;
    if (mu.source === "none" || total <= 0) {
      this.musicBuffer = null;
      this.musicKey = "";
      return;
    }
    if (mu.source === "upload") {
      this.musicBuffer = uploaded;
      this.musicKey = "upload";
      return;
    }
    const key = `${mu.style}|${mu.seed}|${total.toFixed(1)}`;
    if (key === this.musicKey && this.musicBuffer) return;
    onStatus?.("🎵 Componiendo música…");
    this.musicBuffer = await renderMusic({ style: mu.style, seed: mu.seed, duration: total + 0.2, sampleRate: 44100 });
    this.musicKey = key;
    onStatus?.("");
  }

  private startMusic(at: number) {
    if (!this.audio || !this.musicBuffer || !this.musicGain) return;
    const { total } = layout(this.project.clips);
    const s = this.audio.createBufferSource();
    s.buffer = this.musicBuffer;
    s.loop = this.project.music.source === "upload" && this.musicBuffer.duration < total;
    // Canción propia: se desvanece al final del video
    const g = this.audio.createGain();
    const now = this.audio.currentTime;
    g.gain.setValueAtTime(1, now);
    if (this.project.music.source === "upload") {
      const endIn = total - at;
      const fade = Math.min(1.5, Math.max(0.1, endIn));
      g.gain.setValueAtTime(1, now + Math.max(0, endIn - fade));
      g.gain.linearRampToValueAtTime(0, now + endIn);
    }
    s.connect(g).connect(this.musicGain);
    s.start(now, at % this.musicBuffer.duration);
    this.musicNode = s;
  }
  private stopMusic() {
    try {
      this.musicNode?.stop();
    } catch {
      /* nada */
    }
    this.musicNode = null;
  }

  // ---------- Reproducción ----------
  async play(from = this.time) {
    this.ensureAudio();
    await this.audio!.resume();
    const { total } = layout(this.project.clips);
    if (total <= 0) return;
    if (from >= total - 0.05) from = 0;
    this.project.clips.forEach((c) => {
      const m = this.loadMedia(c);
      if (m) this.connectAudio(c, m);
    });
    this.playing = true;
    this.startTime = from;
    this.startWall = performance.now();
    this.startMusic(from);
    this.tick();
  }

  pause() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.stopMusic();
    this.media.forEach((m) => m.el instanceof HTMLVideoElement && m.el.pause());
  }

  async seek(t: number) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    const { total } = layout(this.project.clips);
    this.time = Math.max(0, Math.min(t, total));
    await this.syncVideos(this.time, false);
    this.draw(this.time);
    this.onTime?.(this.time);
    if (wasPlaying) this.play(this.time);
  }

  private tick = () => {
    if (!this.playing) return;
    const { total } = layout(this.project.clips);
    const t = this.startTime + (performance.now() - this.startWall) / 1000;
    if (t >= total) {
      this.time = total;
      this.draw(total - 0.001);
      this.pause();
      this.onTime?.(total);
      this.onEnd?.();
      return;
    }
    this.time = t;
    this.syncVideos(t, true);
    this.draw(t);
    this.onTime?.(t);
    // temporizador (no requestAnimationFrame) para que siga al grabar aunque la pantalla pierda el foco
    this.timer = setTimeout(this.tick, 1000 / 30);
  };

  // Mantiene cada video en el punto correcto de la línea de tiempo
  private async syncVideos(t: number, playing: boolean) {
    const { starts } = layout(this.project.clips);
    const waits: Promise<void>[] = [];
    this.project.clips.forEach((c, i) => {
      const m = this.media.get(c.id);
      if (!m || !(m.el instanceof HTMLVideoElement)) return;
      const v = m.el;
      const s = starts[i];
      const active = t >= s - 0.05 && t < s + clipLength(c);
      if (!active) {
        if (!v.paused) v.pause();
        return;
      }
      const local = c.trimStart + Math.max(0, t - s) * c.speed;
      v.playbackRate = c.speed;
      if (playing) {
        if (Math.abs(v.currentTime - local) > 0.35) v.currentTime = local;
        if (v.paused) v.play().catch(() => {});
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - local) > 0.04) {
          waits.push(
            new Promise((res) => {
              const done = () => res();
              v.addEventListener("seeked", done, { once: true });
              setTimeout(done, 800);
              v.currentTime = local;
            })
          );
        }
      }
    });
    if (waits.length) await Promise.all(waits);
  }

  // ---------- Dibujo de un cuadro ----------
  draw(t: number) {
    const ctx = this.ctx;
    const [W, H] = SIZES[this.project.format];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const clips = this.project.clips;
    if (!clips.length) return;
    const { starts, overlaps } = layout(clips);

    let i = clips.findIndex((c, k) => t >= starts[k] && t < starts[k] + clipLength(c));
    if (i < 0) i = clips.length - 1;
    // ¿Estamos en la transición hacia el siguiente?
    const c = clips[i];
    const ov = overlaps[i];
    const endOf = starts[i] + clipLength(c);
    const next = clips[i + 1];
    if (next && ov > 0 && t >= endOf - ov) {
      const p = ease((t - (endOf - ov)) / ov);
      this.drawTransition(i, i + 1, p, t, starts);
    } else this.drawClip(i, t, starts, 1, 0, 0, 1);

    this.drawTexts(t);
  }

  private drawTransition(a: number, b: number, p: number, t: number, starts: number[]) {
    const ctx = this.ctx;
    const [W, H] = SIZES[this.project.format];
    const kind = this.project.clips[a].transition;
    switch (kind) {
      case "fade":
        this.drawClip(a, t, starts, 1);
        this.drawClip(b, t, starts, p);
        break;
      case "slide":
        this.drawClip(a, t, starts, 1, -p * W);
        this.drawClip(b, t, starts, 1, (1 - p) * W);
        break;
      case "zoom":
        this.drawClip(a, t, starts, 1, 0, 0, 1 + p * 0.25);
        this.drawClip(b, t, starts, p, 0, 0, 1.25 - p * 0.25);
        break;
      case "flash":
        this.drawClip(p < 0.5 ? a : b, t, starts, 1);
        ctx.globalAlpha = 1 - Math.abs(2 * p - 1);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        break;
      case "wipe":
        this.drawClip(a, t, starts, 1);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W * p, H);
        ctx.clip();
        this.drawClip(b, t, starts, 1);
        ctx.restore();
        break;
      default:
        this.drawClip(b, t, starts, 1);
    }
  }

  private drawClip(i: number, t: number, starts: number[], alpha: number, dx = 0, dy = 0, zoom = 1) {
    const c = this.project.clips[i];
    const m = this.media.get(c.id);
    if (!m) return;
    const el = m.el;
    const iw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const ih = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    if (!iw || !ih) return;
    const ctx = this.ctx as CanvasRenderingContext2D & { filter: string };
    const [W, H] = SIZES[this.project.format];
    const prog = Math.max(0, Math.min(1, (t - starts[i]) / clipLength(c)));
    const kb = c.kind === "image" && c.kenBurns ? 1 + 0.12 * prog : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2 + dx, H / 2 + dy);
    ctx.scale(zoom * kb, zoom * kb);
    const filter = FILTERS.find((f) => f.id === c.filter)?.css || "none";

    if (c.fit === "contain") {
      // Fondo: la misma imagen desenfocada (o negro)
      const cover = Math.max(W / iw, H / ih);
      if (this.project.background === "blur" && this.canFilter) {
        ctx.filter = "blur(28px) brightness(0.55)";
        ctx.drawImage(el, (-iw * cover * 1.1) / 2, (-ih * cover * 1.1) / 2, iw * cover * 1.1, ih * cover * 1.1);
      }
      const s = Math.min(W / iw, H / ih);
      if (this.canFilter) ctx.filter = filter;
      ctx.drawImage(el, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s);
    } else {
      const s = Math.max(W / iw, H / ih);
      if (this.canFilter) ctx.filter = filter;
      ctx.drawImage(el, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s);
    }
    ctx.restore();
    if (this.canFilter) ctx.filter = "none";
  }

  private drawTexts(t: number) {
    const ctx = this.ctx;
    const [W, H] = SIZES[this.project.format];
    const unit = Math.min(W, H);
    for (const tx of this.project.texts) {
      if (t < tx.start || t > tx.end || !tx.text.trim()) continue;
      const inP = Math.min(1, (t - tx.start) / 0.45);
      const outP = Math.min(1, (tx.end - t) / 0.3);
      const a = ease(Math.min(inP, outP));
      const size = unit * (tx.style === "titulo" ? 0.085 : tx.style === "subtitulo" ? 0.055 : 0.05);
      const weight = tx.style === "subtitulo" ? 700 : 800;
      ctx.save();
      ctx.font = `${weight} ${size}px Montserrat, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      let text = tx.style === "titulo" || tx.style === "etiqueta" ? tx.text.toUpperCase() : tx.text;
      if (tx.anim === "type") text = text.slice(0, Math.ceil(text.length * inP));
      const lines = wrap(ctx, text, W * 0.84);
      const lh = size * 1.2;
      const blockH = lines.length * lh;
      let y = tx.position === "top" ? H * 0.12 : tx.position === "center" ? H / 2 - blockH / 2 : H * 0.8 - blockH;
      let scale = 1;
      if (tx.anim === "slide") y += (1 - a) * unit * 0.06;
      if (tx.anim === "pop") scale = 0.7 + 0.3 * Math.min(1, inP * 1.4) + (inP < 1 ? Math.sin(inP * Math.PI) * 0.08 : 0);
      ctx.globalAlpha = tx.anim === "type" ? Math.min(1, outP * 3) : a;
      ctx.translate(W / 2, y + blockH / 2);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -(y + blockH / 2));
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      lines.forEach((l, k) => {
        const ly = y + k * lh;
        const w = ctx.measureText(l).width;
        if (tx.bg) {
          ctx.fillStyle = tx.bg;
          roundRect(ctx, W / 2 - w / 2 - size * 0.35, ly - size * 0.12, w + size * 0.7, lh, size * 0.2);
          ctx.fill();
        } else {
          ctx.shadowColor = "rgba(0,0,0,0.65)";
          ctx.shadowBlur = size * 0.25;
          ctx.shadowOffsetY = size * 0.05;
        }
        ctx.fillStyle = tx.color;
        ctx.fillText(l, W / 2, ly);
        ctx.shadowColor = "transparent";
      });
      ctx.restore();
    }
  }

  // ---------- Exportar ----------
  async export(onProgress: (p: number) => void): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
    const rec = supportedRecording();
    if (!rec) throw new Error("Este navegador no puede grabar video. Usa Chrome, Edge o Safari actualizados.");
    const { total } = layout(this.project.clips);
    if (total <= 0) throw new Error("Agrega al menos un clip.");
    this.ensureAudio();
    await this.audio!.resume();
    this.project.clips.forEach((c) => {
      const m = this.loadMedia(c);
      if (m) this.connectAudio(c, m);
    });
    await Promise.all([...this.media.values()].map((m) => m.ready));
    this.pause();
    await this.seek(0);

    const stream = this.canvas.captureStream(30);
    this.recDest!.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const recorder = new MediaRecorder(stream, { mimeType: rec.mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<Blob>((res) => (recorder.onstop = () => res(new Blob(chunks, { type: rec.mime.split(";")[0] }))));

    const prevOnTime = this.onTime;
    const prevOnEnd = this.onEnd;
    const finished = new Promise<void>((res) => {
      this.onEnd = () => res();
      this.onTime = (t) => {
        prevOnTime?.(t);
        onProgress(t / total);
      };
    });
    recorder.start(250);
    await this.play(0);
    await finished;
    await new Promise((r) => setTimeout(r, 250));
    recorder.stop();
    stream.getVideoTracks().forEach((tr) => tr.stop());
    this.onTime = prevOnTime;
    this.onEnd = prevOnEnd;
    onProgress(1);
    let blob = await done;
    // WebM grabado en el navegador no trae la duración: se la escribimos para que se vea la barra de progreso
    if (rec.ext === "webm") blob = await fixWebmDuration(blob, total * 1000, { logger: false }).catch(() => blob);
    return { blob, ext: rec.ext };
  }

  destroy() {
    this.pause();
    this.media.forEach((m) => {
      if (m.el instanceof HTMLVideoElement) {
        m.el.removeAttribute("src");
        m.el.load();
      }
    });
    this.audio?.close().catch(() => {});
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
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

// Lee la duración y una miniatura de un archivo de video o imagen
export async function probeFile(url: string, kind: "video" | "image"): Promise<{ duration: number; thumb: string; w: number; h: number }> {
  const thumbOf = (el: CanvasImageSource, w: number, h: number) => {
    const c = document.createElement("canvas");
    const k = 160 / Math.max(w, h);
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d")!.drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  };
  if (kind === "image") {
    const im = new Image();
    await new Promise((res, rej) => {
      im.onload = res;
      im.onerror = () => rej(new Error("No se pudo abrir la imagen."));
      im.src = url;
    });
    return { duration: 3, thumb: thumbOf(im, im.naturalWidth, im.naturalHeight), w: im.naturalWidth, h: im.naturalHeight };
  }
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  await new Promise((res, rej) => {
    v.onloadedmetadata = res;
    v.onerror = () => rej(new Error("Este formato de video no es compatible con tu navegador."));
  });
  let duration = v.duration;
  if (!isFinite(duration)) {
    // Algunos videos grabados en el navegador no traen duración: se calcula buscando el final
    v.currentTime = 1e7;
    await new Promise((r) => {
      v.ondurationchange = r;
      setTimeout(r, 3000);
    });
    duration = isFinite(v.duration) ? v.duration : 5;
    v.currentTime = 0;
  }
  await new Promise<void>((res) => {
    const go = () => res();
    v.addEventListener("seeked", go, { once: true });
    setTimeout(go, 1500);
    v.currentTime = Math.min(0.2, duration / 2);
  });
  return { duration, thumb: thumbOf(v, v.videoWidth, v.videoHeight), w: v.videoWidth, h: v.videoHeight };
}
