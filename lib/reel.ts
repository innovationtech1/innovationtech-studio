import { cuesFromWords, drawCue, wordsFromScript } from "./captions";
import { renderMusic, MusicStyleId } from "./music";
import { loadSong } from "./library";
import fixWebmDuration from "fix-webm-duration";
import type { EscenaRender, TextoPos, TextoTam } from "./linea-tiempo";
import { medidasTexto } from "./reel-texto";
import { bajadasDeMusica, gananciaClip, tramosConSonido } from "./reel-sonido";
// Motor de reels: arma un video animado dentro del navegador, gratis y sin límite.
// Dibuja cada escena en un <canvas> (zoom/movimiento suave + transiciones + textos)
// y lo graba con MediaRecorder, incluyendo la voz en off si existe.

export type ReelFormat = "9:16" | "1:1" | "16:9";

export type ReelOptions = {
  // Una escena por clip, en orden, cada una con su duración (lib/linea-tiempo.ts → aEscenas)
  escenas: EscenaRender[];
  cierre: number; // segundos del cierre con la marca (3, o 0 si no cabe)
  // Volumen de la voz en off y del sonido de los videos propios (0 a 1; por defecto 1). La música usa music.volume.
  volumenes?: { voz: number; clips: number };
  format: ReelFormat;
  accent: string; // color de acento (hex)
  brandName: string;
  cta: string; // texto del cierre
  logo?: string; // data URL opcional
  font?: string; // letra de la marca para los textos
  voice?: string; // data URL de audio opcional
  subtitles?: { script: string; highlight: string } | null; // subtítulos palabra por palabra de la voz en off
  music?: { style: MusicStyleId; seed: number; volume: number; song?: string } | null; // música gratis de fondo (song: canción de la biblioteca)
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

// Carga un video (toma con IA o video propio) como <video>. Un enlace de internet se baja como archivo
// (igual que las imágenes) para poder grabarlo; un archivo del dispositivo se usa tal cual.
// conSonido: el video no se silencia, porque su audio entra a la mezcla del reel.
async function loadClip(src: string, conSonido = false): Promise<HTMLVideoElement> {
  let url = src;
  let bajado = false;
  if (!src.startsWith("blob:") && !src.startsWith("data:")) {
    const res = await fetch(src).catch(() => null);
    if (!res || !res.ok) throw new Error("No se pudo cargar una toma con IA (quizá el enlace ya caducó).");
    url = URL.createObjectURL(await res.blob());
    bajado = true;
  }
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = !conSonido;
    v.playsInline = true;
    v.preload = "auto";
    if (bajado) v.dataset.bajado = "1";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Un video no se pudo abrir."));
    v.src = url;
  });
}

// Deja el video detenido en el segundo indicado (para que su primer cuadro esté listo al entrar a su escena)
function irA(v: HTMLVideoElement, segundo: number): Promise<void> {
  return new Promise((res) => {
    const listo = () => res();
    v.addEventListener("seeked", listo, { once: true });
    setTimeout(listo, 1500);
    v.currentTime = segundo;
  });
}

// Dibuja el cuadro actual del clip cubriendo todo el lienzo.
function drawClip(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, W: number, H: number) {
  if (!v.videoWidth || !v.videoHeight) return;
  const k = Math.max(W / v.videoWidth, H / v.videoHeight);
  const w = v.videoWidth * k;
  const h = v.videoHeight * k;
  ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
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

function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  W: number,
  H: number,
  appear: number,
  accent: string,
  pos: TextoPos = "abajo",
  tam: TextoTam = "normal",
) {
  if (!text.trim()) return;
  const unit = Math.min(W, H);
  const m = medidasTexto(pos, tam, H > W);
  const size = Math.round(unit * m.tamano);
  ctx.font = `800 ${size}px ${FONT_STACK}`;
  const pad = unit * 0.045;
  const maxW = W * 0.84 - pad * 2;
  const lines = wrap(ctx, text, maxW);
  const lineH = size * 1.22;
  const boxW = Math.min(W * 0.84, Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
  const boxH = lines.length * lineH + pad * 1.4;
  const a = ease(Math.min(1, appear));
  const x = (W - boxW) / 2;
  // Arriba nunca tapa el logo: el recuadro no sube de cierto margen
  const y = Math.max(H * 0.13, H * m.centroY - boxH / 2) + (1 - a) * unit * 0.04;

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

// Todo lo que comparten grabar y la vista previa: lo cargado, los tiempos y cómo se dibuja cada instante.
type Montaje = {
  W: number;
  H: number;
  total: number; // segundos del video completo (escenas + cierre)
  slidesTime: number;
  starts: number[];
  canvas: HTMLCanvasElement;
  clips: (HTMLVideoElement | null)[];
  escenas: EscenaRender[];
  durs: number[];
  ganancias: (GainNode | null)[]; // el volumen del sonido de cada video propio (se mueve cuadro a cuadro)
  audioCtx: AudioContext | null;
  voiceBuffer: AudioBuffer | null;
  musicBuffer: AudioBuffer | null;
  draw: (time: number) => void;
  soltar: () => void;
};

async function montar(o: ReelOptions): Promise<Montaje> {
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
  const escenas = o.escenas;
  if (escenas.length === 0) throw new Error("Elige al menos una imagen para el reel.");

  const [W, H] = SIZES[o.format];
  // La misma foto puede estar en varios clips (duplicados): se carga una sola vez
  const cargadas = new Map<string, Promise<HTMLImageElement>>();
  const imgs = await Promise.all(
    escenas.map((e) => {
      // Un video propio puede no tener portada todavía: se verá el video (o negro si tampoco carga)
      if (!e.imagen) return null;
      if (!cargadas.has(e.imagen)) cargadas.set(e.imagen, loadImage(e.imagen));
      return cargadas.get(e.imagen)!;
    }),
  );
  const logo = o.logo ? await loadImage(o.logo) : null;

  let audioCtx: AudioContext | null = null;
  let voiceBuffer: AudioBuffer | null = null;
  if (o.voice) {
    audioCtx = new AudioContext();
    const bytes = await (await fetch(o.voice)).arrayBuffer();
    voiceBuffer = await audioCtx.decodeAudioData(bytes);
  }
  // Cada escena dura lo que dice su clip; el cierre, lo que se haya decidido (3 s o nada)
  const durs = escenas.map((e) => Math.max(0.5, e.segundos));
  const outro = Math.max(0, o.cierre);
  const clips: (HTMLVideoElement | null)[] = escenas.map(() => null);
  if (escenas.some((e) => e.video)) {
    o.onStatus?.("🎬 Cargando videos…");
    await Promise.all(
      escenas.map(async (e, i) => {
        if (!e.video) return;
        // Si un video no carga, esa escena se queda con su imagen animada con zoom
        const v = await loadClip(e.video.src, e.video.sonido).catch(() => null);
        if (!v) return;
        await irA(v, e.video.inicio);
        clips[i] = v;
      }),
    );
  }
  // El sonido de un video propio necesita la mezcla de audio aunque no haya voz ni música
  if (!audioCtx && escenas.some((e, i) => e.video?.sonido && clips[i])) audioCtx = new AudioContext();
  const starts: number[] = [];
  durs.reduce((a, d, i) => ((starts[i] = a), a + d), 0);
  const slidesTime = durs.reduce((a, d) => a + d, 0);
  // Subtítulos de la voz: cada palabra se reparte a lo largo del audio
  const subCues =
    voiceBuffer && o.subtitles?.script.trim() ? cuesFromWords(wordsFromScript(o.subtitles.script, voiceBuffer.duration, 0.05)) : [];
  const total = slidesTime + outro;

  // Música de fondo (se compone a la medida exacta del reel)
  let musicBuffer: AudioBuffer | null = null;
  if (o.music) {
    if (o.music.song) {
      o.onStatus?.("🎵 Cargando canción…");
      musicBuffer = await loadSong(o.music.song);
    } else {
      o.onStatus?.("🎵 Componiendo música…");
      musicBuffer = await renderMusic({ style: o.music.style, seed: o.music.seed, duration: total + 0.3 });
    }
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
    // Una escena: su clip de IA si lo tiene; si no, la foto con zoom y paneo
    const scene = (k: number, t: number) => {
      const clip = clips[k];
      const img = imgs[k];
      if (clip) drawClip(ctx, clip, W, H);
      else if (img) drawKenBurns(ctx, img, W, H, t, k);
    };
    if (time < slidesTime || outro === 0) {
      let i = escenas.length - 1;
      while (i > 0 && time < starts[i]) i--;
      const per = durs[i];
      const local = Math.min(per, time - starts[i]);
      // En escenas muy cortas la transición se acorta para que no se coma la escena
      const fade = Math.min(FADE, per / 3);
      scene(i, local / per);
      // transición: la siguiente escena aparece encima
      if (local > per - fade && i < escenas.length - 1) {
        ctx.save();
        ctx.globalAlpha = (local - (per - fade)) / fade;
        scene(i + 1, 0);
        ctx.restore();
      }
      const fadeOut = local > per - fade ? 1 - (local - (per - fade)) / fade : 1;
      ctx.save();
      ctx.globalAlpha = fadeOut;
      const e = escenas[i];
      drawCaption(ctx, e.texto || "", W, H, (local - 0.15) / 0.5, o.accent, e.textoPos, e.textoTam);
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
        scene(escenas.length - 1, 1);
        ctx.save();
        ctx.globalAlpha = t / FADE;
        drawOutro(ctx, W, H, t, { brandName: o.brandName, cta: o.cta, accent: o.accent, logo });
        ctx.restore();
      } else drawOutro(ctx, W, H, t, { brandName: o.brandName, cta: o.cta, accent: o.accent, logo });
    }
    pctx?.drawImage(canvas, 0, 0);
  };

  const soltar = () => {
    clips.forEach((c) => {
      if (!c) return;
      c.pause();
      if (c.dataset.bajado) URL.revokeObjectURL(c.src); // los archivos del dispositivo son de quien los abrió
      c.removeAttribute("src");
      c.load();
    });
    audioCtx?.close().catch(() => {});
  };
  return { W, H, total, slidesTime, starts, canvas, clips, escenas, durs, ganancias: escenas.map(() => null), audioCtx, voiceBuffer, musicBuffer, draw, soltar };
}

// Conecta la voz, la música y el sonido de los videos propios a `salida` (la grabación o las bocinas)
// y devuelve cómo arrancar la voz y la música.
function prepararAudio(m: Montaje, o: ReelOptions, salida: AudioNode): () => void {
  const { audioCtx, voiceBuffer, musicBuffer, total } = m;
  if (!audioCtx) return () => {};
  const vol = { voz: o.volumenes?.voz ?? 1, clips: o.volumenes?.clips ?? 1 };
  let source: AudioBufferSourceNode | null = null;
  let musicSource: AudioBufferSourceNode | null = null;
  let musicGain: GainNode | null = null;
  if (voiceBuffer) {
    source = audioCtx.createBufferSource();
    source.buffer = voiceBuffer;
    const g = audioCtx.createGain();
    g.gain.value = Math.max(0, Math.min(1, vol.voz));
    source.connect(g).connect(salida);
  }
  if (musicBuffer && o.music) {
    musicSource = audioCtx.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.loop = !!o.music.song && musicBuffer.duration < total;
    musicGain = audioCtx.createGain();
    musicGain.gain.value = o.music.volume;
    musicSource.connect(musicGain).connect(salida);
  }
  // Sonido de los videos propios: cada uno con su volumen, que empieza en cero (lo mueve `reproducir`)
  m.escenas.forEach((e, i) => {
    const v = m.clips[i];
    if (!v || !e.video?.sonido) return;
    try {
      const g = audioCtx.createGain();
      g.gain.value = 0;
      audioCtx.createMediaElementSource(v).connect(g).connect(salida);
      m.ganancias[i] = g;
    } catch {
      v.muted = true; // si el navegador no deja mezclarlo, ese video va sin sonido
    }
  });
  const conSonido = tramosConSonido(m.escenas.map((e, i) => ({ segundos: m.durs[i], video: e.video && m.ganancias[i] ? { sonido: true } : undefined })));
  return () => {
    if (musicSource && musicGain && o.music) {
      const now = audioCtx.currentTime;
      const v = o.music.volume;
      musicSource.start(now);
      musicGain.gain.setValueAtTime(v, now);
      // La música baja mientras habla la voz o suena un video propio, y vuelve a subir al terminar
      for (const b of bajadasDeMusica(voiceBuffer?.duration ?? null, conSonido)) {
        musicGain.gain.setValueAtTime(v, now + Math.max(0, b.desde - 0.3));
        musicGain.gain.linearRampToValueAtTime(v * 0.35, now + Math.max(0.05, b.desde));
        musicGain.gain.setValueAtTime(v * 0.35, now + b.hasta);
        musicGain.gain.linearRampToValueAtTime(v, now + b.hasta + 0.5);
      }
      if (o.music.song) {
        // La canción de la biblioteca se desvanece al terminar el reel
        const fadeAt = Math.max(now + 0.9 + (voiceBuffer?.duration || 0), now + total - 1.5);
        musicGain.gain.setValueAtTime(v, fadeAt);
        musicGain.gain.linearRampToValueAtTime(0, now + total);
      }
    }
    if (source) source.start(audioCtx.currentTime + 0.3);
  };
}

// Recorre el video en tiempo real dibujando cada cuadro. Termina al llegar al final o si se cancela.
function reproducir(m: Montaje, o: ReelOptions, signal?: AbortSignal): Promise<void> {
  const { total, slidesTime, starts, clips } = m;
  const volClips = Math.max(0, Math.min(1, o.volumenes?.clips ?? 1));
  const start = performance.now();
  // Usamos un temporizador (no requestAnimationFrame) para que siga grabando
  // aunque la ventana pierda el foco por un momento.
  let sonando = -1; // escena cuyo video se está reproduciendo
  const parar = (k: number) => {
    if (k < 0) return;
    clips[k]?.pause();
    const g = m.ganancias[k];
    if (g) g.gain.value = 0;
  };
  return new Promise<void>((resolve) => {
    const tick = () => {
      if (signal?.aborted) {
        parar(sonando);
        return resolve();
      }
      const time = (performance.now() - start) / 1000;
      let actual = starts.length - 1;
      while (actual > 0 && time < starts[actual]) actual--;
      if (time >= slidesTime) {
        parar(sonando);
        sonando = -1;
      } else {
        const tramo = m.escenas[actual].video;
        // Al entrar a una escena con video, arranca desde el inicio de su recorte y a su velocidad
        if (actual !== sonando) {
          parar(sonando);
          sonando = actual;
          const clip = clips[actual];
          if (clip && tramo) {
            clip.currentTime = tramo.inicio;
            clip.playbackRate = tramo.velocidad;
            clip.play().catch(() => {});
          }
        }
        const clip = clips[actual];
        if (clip && tramo) {
          // Al llegar al final de su recorte se queda en ese cuadro
          if (clip.currentTime >= tramo.fin && !clip.paused) clip.pause();
          const g = m.ganancias[actual];
          if (g) g.gain.value = gananciaClip(time - starts[actual], m.durs[actual]) * volClips;
        }
      }
      if (time >= total) {
        m.draw(total - 0.001);
        resolve();
        return;
      }
      m.draw(time);
      o.onProgress?.(time / total);
      setTimeout(tick, 1000 / FPS);
    };
    tick();
  });
}

// Graba el video y lo devuelve como archivo.
export async function renderReel(o: ReelOptions): Promise<ReelResult> {
  const rec = supportedRecording();
  if (!rec) throw new Error("Este navegador no puede grabar video. Usa Chrome, Edge o Safari actualizados.");
  const m = await montar(o);
  const { audioCtx, total } = m;

  m.draw(0);
  const stream = m.canvas.captureStream(FPS);
  let arrancarAudio = () => {};
  if (audioCtx) {
    const dest = audioCtx.createMediaStreamDestination();
    arrancarAudio = prepararAudio(m, o, dest);
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
  arrancarAudio();
  await reproducir(m, o);

  await new Promise((r) => setTimeout(r, 300));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  let blob = await done;
  // WebM grabado en el navegador no trae la duración: se la escribimos
  if (rec.ext === "webm") blob = await fixWebmDuration(blob, total * 1000, { logger: false }).catch(() => blob);
  m.soltar();
  o.onProgress?.(1);
  return { url: URL.createObjectURL(blob), blob, ext: rec.ext, seconds: Math.round(total) };
}

// Vista previa: reproduce el video en `previewCanvas` con su sonido, sin grabar nada.
// Termina sola al acabar el video, o antes si se cancela con `signal`.
export async function vistaPrevia(o: ReelOptions, signal: AbortSignal): Promise<void> {
  if (!o.previewCanvas) throw new Error("Falta dónde mostrar la vista previa.");
  const m = await montar(o);
  try {
    if (signal.aborted) return;
    m.draw(0);
    o.onStatus?.("");
    if (m.audioCtx) {
      const arrancar = prepararAudio(m, o, m.audioCtx.destination);
      await m.audioCtx.resume();
      arrancar();
    }
    await reproducir(m, o, signal);
  } finally {
    m.soltar(); // cerrar el audio corta la voz y la música
  }
}
