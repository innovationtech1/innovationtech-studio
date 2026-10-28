"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clip,
  clipLength,
  FILTERS,
  layout,
  newProject,
  probeFile,
  Project,
  SIZES,
  Sticker,
  STICKER_ANIMS,
  STICKER_EMOJIS,
  TextOverlay,
  TRANSITIONS,
  uid,
  VideoEngine,
} from "@/lib/video-engine";
import { describeVersion, renderMusic } from "@/lib/music";
import MusicPicker from "./music-picker";
import { deleteFile, getFile, putFile, toBlob } from "@/lib/media-store";
import { usePersistentState } from "@/lib/persist";
import type { Item, Settings } from "@/lib/types";
import { blobToBase64, cuesFromWords, toWav16k, type Word } from "@/lib/captions";
import { friendlyError } from "@/lib/errors";
import { tr } from "@/lib/i18n";

import { Captions, ChevronLeft, Smile, ChevronRight, Clapperboard, Copy, Dices, Download, Film, FolderOpen, ImageIcon, Music, Pause, Play, Scissors, Trash2, Type, Upload, Video } from "lucide-react";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const SW = ["#ffffff", "#000000", "#ffd23f", "#e5243b", "#0d1630", "#32c48d", "#2f80ed"];

export default function VideoEditor({
  gallery,
  onVideo,
  settings,
  accent = "#e5243b",
}: {
  gallery: Item[];
  onVideo: (blob: Blob, prompt: string) => void;
  settings: Settings;
  accent?: string;
}) {
  const [project, setProject] = usePersistentState<Project>("video:proyecto", newProject());
  const [selected, setSelected] = useState<string | null>(null);
  const [selText, setSelText] = useState<string | null>(null);
  const [panel, setPanel] = useState<"clip" | "textos" | "stickers" | "musica">("clip");
  const [selSticker, setSelSticker] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; ext: string } | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [uploaded, setUploaded] = useState<AudioBuffer | null>(null);
  const [loadedFiles, setLoadedFiles] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<VideoEngine | null>(null);
  const urls = useRef(new Map<string, string>()); // fileId -> blob: URL
  const preview = useRef<AudioBufferSourceNode | null>(null);
  const previewCtx = useRef<AudioContext | null>(null);

  const { starts, total } = layout(project.clips);
  const sel = project.clips.find((c) => c.id === selected) || null;
  const selIdx = project.clips.findIndex((c) => c.id === selected);
  const tsel = project.texts.find((t) => t.id === selText) || null;
  const stickers = project.stickers || [];
  const ssel = stickers.find((x) => x.id === selSticker) || null;

  // ---------- Motor ----------
  useEffect(() => {
    const e = new VideoEngine(canvasRef.current!);
    e.onTime = (t) => setTime(t);
    e.onEnd = () => setPlaying(false);
    engine.current = e;
    return () => e.destroy();
  }, []);

  // Recuperar los archivos del proyecto guardado (después de cerrar la app)
  useEffect(() => {
    let cancel = false;
    (async () => {
      for (const c of project.clips) {
        if (urls.current.has(c.fileId)) {
          if (!engine.current?.srcs.has(c.id)) engine.current?.addSource(c, urls.current.get(c.fileId)!);
          continue;
        }
        const blob = await getFile(c.fileId).catch(() => null);
        if (cancel) return;
        if (blob) {
          const u = URL.createObjectURL(blob);
          urls.current.set(c.fileId, u);
          engine.current?.addSource(c, u);
        }
      }
      setLoadedFiles((n) => n + 1);
    })();
    return () => {
      cancel = true;
    };
  }, [project.clips]);

  useEffect(() => {
    engine.current?.setProject(project);
  }, [project, loadedFiles]);

  // Redibujar cuando cargan los medios
  useEffect(() => {
    const t = setTimeout(() => engine.current?.seek(engine.current.time), 300);
    return () => clearTimeout(t);
  }, [loadedFiles, project.format]);

  const update = useCallback(
    (fn: (p: Project) => Project) => setProject((p) => fn(p)),
    [setProject]
  );
  const updateClip = (id: string, patch: Partial<Clip>) =>
    update((p) => ({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const updateText = (id: string, patch: Partial<TextOverlay>) =>
    update((p) => ({ ...p, texts: p.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

  const updateSticker = (id: string, patch: Partial<Sticker>) =>
    update((p) => ({ ...p, stickers: (p.stickers || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const addSticker = (emoji: string) => {
    const st: Sticker = {
      id: uid(),
      emoji,
      x: 0.78,
      y: 0.2,
      size: 0.16,
      start: Math.min(time, Math.max(0, total - 1)),
      end: Math.min(total || 3, time + 3),
      anim: "rebote",
    };
    update((p) => ({ ...p, stickers: [...(p.stickers || []), st] }));
    setSelSticker(st.id);
  };

  // ---------- Subtítulos automáticos ----------
  // Reconoce lo que se dice en cada video y crea subtítulos palabra por palabra en la línea de tiempo.
  async function autoSubtitles() {
    setError("");
    const videos = project.clips.map((c, i) => ({ c, start: starts[i] })).filter((x) => x.c.kind === "video" && x.c.volume > 0);
    if (!videos.length) return setError("Agrega un video con voz para crear subtítulos.");
    const headers: Record<string, string> = { "content-type": "application/json", "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken };
    const all: Word[] = [];
    try {
      const ctx = new AudioContext();
      for (const [n, { c, start }] of videos.entries()) {
        setBusy(`Escuchando el video ${n + 1} de ${videos.length}…`);
        const blob = await getFile(c.fileId);
        if (!blob) continue;
        let buf: AudioBuffer;
        try {
          buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        } catch {
          continue; // video sin audio
        }
        const to = Math.min(c.trimEnd, buf.duration);
        // En partes de 60 s para no exceder el tamaño permitido
        for (let from = c.trimStart; from < to - 0.2; from += 60) {
          const wav = await toWav16k(buf, from, Math.min(to, from + 60));
          const res = await fetch("/api/transcribe", { method: "POST", headers, body: JSON.stringify({ audio: await blobToBase64(wav) }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          for (const w of data.words as Word[]) {
            const src = from + w.start; // segundo dentro del archivo
            if (src < c.trimStart || src > c.trimEnd) continue;
            all.push({ w: w.w, start: start + (src - c.trimStart) / c.speed, end: start + (from + w.end - c.trimStart) / c.speed });
          }
        }
      }
      ctx.close().catch(() => {});
      if (!all.length) return setError("No se escuchó voz en los videos. Revisa que tengan sonido.");
      const cues = cuesFromWords(all);
      const subs: TextOverlay[] = cues.map((q) => ({
        id: uid(),
        text: q.words.map((w) => w.w).join(" "),
        start: q.start,
        end: Math.max(q.end, q.start + 0.4),
        position: "bottom",
        style: "subtitulo",
        color: "#ffffff",
        bg: "",
        anim: "karaoke",
        highlight: accent,
        words: q.words,
      }));
      update((p) => ({ ...p, texts: [...p.texts.filter((t) => !t.words?.length), ...subs] }));
      setPanel("textos");
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setBusy("");
    }
  }

  // ---------- Agregar archivos ----------
  async function addBlobs(list: { blob: Blob; name: string }[]) {
    setError("");
    setBusy("Cargando archivos…");
    try {
      const added: Clip[] = [];
      for (const { blob, name } of list) {
        const kind = blob.type.startsWith("image/") ? "image" : "video";
        const fileId = uid();
        const url = URL.createObjectURL(blob);
        const info = await probeFile(url, kind);
        await putFile(fileId, blob).catch(() => setError("No hay espacio para guardar el proyecto; se podrá editar mientras la app esté abierta."));
        urls.current.set(fileId, url);
        const clip: Clip = {
          id: uid(),
          fileId,
          kind,
          name,
          duration: info.duration,
          trimStart: 0,
          trimEnd: kind === "image" ? 3 : info.duration,
          speed: 1,
          volume: 1,
          filter: "none",
          transition: "fade",
          fit: "cover",
          kenBurns: true,
          thumb: info.thumb,
        };
        engine.current?.addSource(clip, url);
        added.push(clip);
      }
      update((p) => ({ ...p, clips: [...p.clips, ...added] }));
      if (added[0]) setSelected(added[0].id);
      setPanel("clip");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const removeClip = (id: string) => {
    const c = project.clips.find((x) => x.id === id);
    update((p) => ({ ...p, clips: p.clips.filter((x) => x.id !== id) }));
    if (c && !project.clips.some((x) => x.id !== id && x.fileId === c.fileId)) deleteFile(c.fileId).catch(() => {});
    setSelected(null);
  };

  const moveClip = (id: string, dir: -1 | 1) =>
    update((p) => {
      const arr = [...p.clips];
      const i = arr.findIndex((c) => c.id === id);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return p;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...p, clips: arr };
    });

  const duplicate = (c: Clip) => {
    const copy = { ...c, id: uid() };
    engine.current?.addSource(copy, urls.current.get(c.fileId)!);
    update((p) => {
      const arr = [...p.clips];
      arr.splice(arr.findIndex((x) => x.id === c.id) + 1, 0, copy);
      return { ...p, clips: arr };
    });
  };

  // Divide el clip en el punto donde está la reproducción
  const split = () => {
    const i = project.clips.findIndex((c, k) => time > starts[k] + 0.1 && time < starts[k] + clipLength(c) - 0.1);
    if (i < 0) return setError("Mueve la barra de tiempo dentro de un clip para dividirlo.");
    const c = project.clips[i];
    const cut = c.trimStart + (time - starts[i]) * c.speed;
    const second: Clip = { ...c, id: uid(), trimStart: cut };
    engine.current?.addSource(second, urls.current.get(c.fileId)!);
    update((p) => {
      const arr = [...p.clips];
      arr.splice(i, 1, { ...c, trimEnd: cut, transition: "cut" }, second);
      return { ...p, clips: arr };
    });
    setSelected(second.id);
  };

  // ---------- Reproducción ----------
  const togglePlay = async () => {
    const e = engine.current!;
    if (playing) {
      e.pause();
      setPlaying(false);
      return;
    }
    stopPreview();
    setError("");
    try {
      await e.prepareMusic(uploaded, setBusy);
      setPlaying(true);
      await e.play();
    } catch (err) {
      setError((err as Error).message);
      setPlaying(false);
    }
  };

  // ---------- Música ----------
  const stopPreview = () => {
    try {
      preview.current?.stop();
    } catch {
      /* nada */
    }
    preview.current = null;
  };
  const listen = async (style = project.music.style, seed = project.music.seed) => {
    stopPreview();
    setBusy("Componiendo una muestra…");
    try {
      const buf = await renderMusic({ style, seed, duration: 15 });
      if (!previewCtx.current) previewCtx.current = new AudioContext();
      await previewCtx.current.resume();
      const s = previewCtx.current.createBufferSource();
      s.buffer = buf;
      s.connect(previewCtx.current.destination);
      s.start();
      preview.current = s;
    } finally {
      setBusy("");
    }
  };
  const uploadSong = async (f: File) => {
    setBusy("Cargando canción…");
    try {
      const ac = new AudioContext();
      const buf = await ac.decodeAudioData(await f.arrayBuffer());
      ac.close();
      setUploaded(buf);
      update((p) => ({ ...p, music: { ...p.music, source: "upload", uploadName: f.name } }));
    } catch {
      setError("No se pudo leer esa canción. Prueba con un MP3 o M4A.");
    } finally {
      setBusy("");
    }
  };

  // ---------- Textos ----------
  const addText = (style: TextOverlay["style"]) => {
    const t: TextOverlay = {
      id: uid(),
      text: tr(style === "titulo" ? "Tu título aquí" : style === "subtitulo" ? "Escribe tu mensaje" : "¡OFERTA!"),
      start: Math.min(time, Math.max(0, total - 1)),
      end: Math.min(total || 3, time + 3),
      position: style === "titulo" ? "center" : style === "etiqueta" ? "top" : "bottom",
      style,
      color: style === "etiqueta" ? "#ffffff" : "#ffffff",
      bg: style === "etiqueta" ? "#e5243b" : style === "subtitulo" ? "rgba(0,0,0,0.55)" : "",
      anim: style === "titulo" ? "pop" : style === "etiqueta" ? "slide" : "fade",
    };
    update((p) => ({ ...p, texts: [...p.texts, t] }));
    setSelText(t.id);
  };

  // ---------- Exportar ----------
  const exportVideo = async () => {
    const e = engine.current!;
    setError("");
    setResult(null);
    stopPreview();
    try {
      await e.prepareMusic(uploaded, setBusy);
      setBusy("Exportando…");
      setPlaying(true);
      const { blob, ext } = await e.export(setProgress);
      setPlaying(false);
      setResult({ url: URL.createObjectURL(blob), ext });
      onVideo(blob, `Video editado (${fmt(total)})`);
    } catch (err) {
      setError((err as Error).message);
      setPlaying(false);
    } finally {
      setBusy("");
    }
  };

  const newProj = () => {
    if (!confirm("¿Empezar un proyecto nuevo? Se quitarán los clips y textos actuales.")) return;
    engine.current?.pause();
    project.clips.forEach((c) => deleteFile(c.fileId).catch(() => {}));
    setProject(newProject());
    setSelected(null);
    setSelText(null);
    setResult(null);
    setTime(0);
  };

  const [W, H] = SIZES[project.format];
  const missing = project.clips.length > 0 && project.clips.some((c) => !urls.current.has(c.fileId));

  return (
    <section className="card vedit">
      <div className="card-head">
        <h2>Editor de video</h2>
        <button className="btn ghost small" onClick={newProj} disabled={!!busy && busy.startsWith("Exportando")}>
          Nuevo proyecto
        </button>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Une tus videos y fotos, recórtalos, agrega transiciones, filtros, textos y música gratis. Todo se procesa en tu dispositivo.
      </p>

      <div className="row">
        <div>
          <label>Formato</label>
          <div className="seg">
            {(["9:16", "1:1", "16:9"] as const).map((f) => (
              <button key={f} className={project.format === f ? "active" : ""} onClick={() => update((p) => ({ ...p, format: f }))}>
                {f === "9:16" ? "9:16 Reel" : f === "1:1" ? "1:1 Post" : "16:9 YouTube"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>Relleno (si el clip no llena la pantalla)</label>
          <div className="seg">
            <button className={project.background === "blur" ? "active" : ""} onClick={() => update((p) => ({ ...p, background: "blur" }))}>
              Desenfocado
            </button>
            <button className={project.background === "black" ? "active" : ""} onClick={() => update((p) => ({ ...p, background: "black" }))}>
              Negro
            </button>
          </div>
        </div>
      </div>

      {/* Vista previa */}
      <div className="vedit-stage">
        <canvas ref={canvasRef} width={W} height={H} style={{ aspectRatio: `${W} / ${H}` }} />
        {!project.clips.length && <div className="vedit-empty">Agrega videos o fotos para empezar</div>}
      </div>
      <div className="vedit-controls">
        <button className="btn small" onClick={togglePlay} disabled={!project.clips.length || busy.startsWith("Exportando")}>
          {playing ? <><Pause size={16} aria-hidden /> Pausa</> : <><Play size={16} aria-hidden /> Reproducir</>}
        </button>
        <span className="muted">
          {fmt(time)} / {fmt(total)}
        </span>
        <button className="btn ghost small" onClick={split} disabled={!project.clips.length || playing}>
          <Scissors size={16} aria-hidden /> Dividir aquí
        </button>
      </div>
      <input
        className="scrub"
        type="range"
        min={0}
        max={Math.max(0.01, total)}
        step={0.01}
        value={Math.min(time, total)}
        disabled={!project.clips.length || busy.startsWith("Exportando")}
        onChange={(e) => {
          setTime(Number(e.target.value));
          engine.current?.seek(Number(e.target.value));
        }}
      />

      {missing && (
        <div className="notice">Algunos archivos de este proyecto ya no están en el dispositivo. Elimina esos clips o vuelve a agregarlos.</div>
      )}

      {/* Línea de tiempo */}
      <div className="timeline">
        {project.clips.map((c, i) => (
          <button
            key={c.id}
            className={`tl-clip ${selected === c.id ? "active" : ""}`}
            style={{ flexGrow: Math.max(1, clipLength(c)) }}
            onClick={() => {
              setSelected(c.id);
              setPanel("clip");
              engine.current?.seek(starts[i] + 0.05);
            }}
          >
            {c.thumb && <img src={c.thumb} alt="" />}
            <span>
              {c.kind === "image" ? <ImageIcon size={11} aria-hidden /> : <Video size={11} aria-hidden />} {clipLength(c).toFixed(1)}s{c.speed !== 1 ? ` · ${c.speed}x` : ""}
            </span>
            {i < project.clips.length - 1 && c.transition !== "cut" && <i className="tl-tr" title={c.transition}>⟷</i>}
          </button>
        ))}
        <div className="tl-add">
          <label className="btn small" style={{ margin: 0 }}>
            ＋ Video o foto
            <input
              type="file"
              accept="video/*,image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                if (files.length) addBlobs(files.map((f) => ({ blob: f, name: f.name })));
              }}
            />
          </label>
          <button className="btn ghost small" onClick={() => setShowGallery((v) => !v)}>
            <FolderOpen size={16} aria-hidden /> Galería
          </button>
        </div>
      </div>
      {showGallery && (
        <div className="picker">
          {gallery.length === 0 && <span className="muted">Tu galería está vacía.</span>}
          {gallery.slice(0, 30).map((g, k) => (
            <button
              key={g.url + k}
              className="pick-item"
              onClick={async () => {
                setShowGallery(false);
                const blob = await toBlob(g.url);
                if (blob) addBlobs([{ blob, name: g.prompt }]);
                else setError("No se pudo abrir ese elemento de la galería.");
              }}
            >
              {g.kind === "imagen" ? <img src={g.url} alt="" /> : <video src={g.url} muted playsInline preload="metadata" />}
            </button>
          ))}
        </div>
      )}

      {busy && (
        <div className="notice">
          {busy}
          {busy.startsWith("Exportando") && (
            <>
              {" "}
              {Math.round(progress * 100)}% · Mantén esta pantalla abierta.
              <div className="bar">
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {/* Paneles */}
      <div className="tool-tabs">
        <button className={panel === "clip" ? "active" : ""} onClick={() => setPanel("clip")}>
          <Film size={16} aria-hidden /> Clip
        </button>
        <button className={panel === "textos" ? "active" : ""} onClick={() => setPanel("textos")}>
          <Type size={16} aria-hidden /> Textos ({project.texts.length})
        </button>
        <button className={panel === "stickers" ? "active" : ""} onClick={() => setPanel("stickers")}>
          <Smile size={16} aria-hidden /> Stickers ({stickers.length})
        </button>
        <button className={panel === "musica" ? "active" : ""} onClick={() => setPanel("musica")}>
          <Music size={16} aria-hidden /> Música y audio
        </button>
      </div>

      <div className="tool-panel">
        {panel === "clip" &&
          (sel ? (
            <>
              <div className="card-head">
                <strong>
                  Clip {selIdx + 1} de {project.clips.length} · {sel.kind === "image" ? "foto" : "video"}
                </strong>
                <div className="actions">
                  <button className="btn ghost small" onClick={() => moveClip(sel.id, -1)} disabled={selIdx === 0} title="Mover antes" aria-label="Mover antes">
                    <ChevronLeft size={16} aria-hidden />
                  </button>
                  <button className="btn ghost small" onClick={() => moveClip(sel.id, 1)} disabled={selIdx === project.clips.length - 1} title="Mover después" aria-label="Mover después">
                    <ChevronRight size={16} aria-hidden />
                  </button>
                  <button className="btn ghost small" onClick={() => duplicate(sel)} title="Duplicar" aria-label="Duplicar">
                    <Copy size={16} aria-hidden />
                  </button>
                  <button className="btn ghost small" onClick={() => removeClip(sel.id)} title="Eliminar" aria-label="Eliminar">
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>

              {sel.kind === "video" ? (
                <>
                  <Range
                    label={`Inicio: ${sel.trimStart.toFixed(1)} s`}
                    min={0}
                    max={sel.duration}
                    step={0.05}
                    value={sel.trimStart}
                    onChange={(v) => updateClip(sel.id, { trimStart: Math.min(v, sel.trimEnd - 0.3) })}
                  />
                  <Range
                    label={`Final: ${sel.trimEnd.toFixed(1)} s (de ${sel.duration.toFixed(1)} s)`}
                    min={0}
                    max={sel.duration}
                    step={0.05}
                    value={sel.trimEnd}
                    onChange={(v) => updateClip(sel.id, { trimEnd: Math.max(v, sel.trimStart + 0.3) })}
                  />
                  <label>Velocidad</label>
                  <div className="seg">
                    {[0.5, 0.75, 1, 1.5, 2].map((s) => (
                      <button key={s} className={sel.speed === s ? "active" : ""} onClick={() => updateClip(sel.id, { speed: s })}>
                        {s}x
                      </button>
                    ))}
                  </div>
                  <Range
                    label={`Volumen del clip: ${Math.round(sel.volume * 100)}%`}
                    min={0}
                    max={1}
                    step={0.05}
                    value={sel.volume}
                    onChange={(v) => updateClip(sel.id, { volume: v })}
                  />
                </>
              ) : (
                <>
                  <Range
                    label={`Duración: ${(sel.trimEnd - sel.trimStart).toFixed(1)} s`}
                    min={0.5}
                    max={15}
                    step={0.5}
                    value={sel.trimEnd - sel.trimStart}
                    onChange={(v) => updateClip(sel.id, { trimStart: 0, trimEnd: v, duration: v })}
                  />
                  <label className="check">
                    <input type="checkbox" checked={sel.kenBurns} onChange={(e) => updateClip(sel.id, { kenBurns: e.target.checked })} />
                    Movimiento suave (acercamiento)
                  </label>
                </>
              )}

              <label>Encuadre</label>
              <div className="seg">
                <button className={sel.fit === "cover" ? "active" : ""} onClick={() => updateClip(sel.id, { fit: "cover" })}>
                  Llenar pantalla
                </button>
                <button className={sel.fit === "contain" ? "active" : ""} onClick={() => updateClip(sel.id, { fit: "contain" })}>
                  Mostrar completo
                </button>
              </div>

              <label>Filtro</label>
              <div className="presets">
                {FILTERS.map((f) => (
                  <button key={f.id} className={sel.filter === f.id ? "active" : ""} onClick={() => updateClip(sel.id, { filter: f.id })}>
                    {f.label}
                  </button>
                ))}
              </div>
              {!engine.current?.canFilter && <p className="muted">Tu navegador no permite filtros en video; actualízalo para usarlos.</p>}

              {selIdx < project.clips.length - 1 && (
                <>
                  <label>Transición al siguiente clip</label>
                  <div className="presets">
                    {TRANSITIONS.map((t) => (
                      <button key={t.id} className={sel.transition === t.id ? "active" : ""} onClick={() => updateClip(sel.id, { transition: t.id })}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn ghost small"
                    onClick={() => update((p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, transition: sel.transition })) }))}
                  >
                    Usar esta transición en todos
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="muted">{project.clips.length ? "Toca un clip de la línea de tiempo para editarlo." : "Agrega videos o fotos con «＋ Video o foto»."}</p>
          ))}

        {panel === "textos" && (
          <>
            <div className="presets">
              <button onClick={() => addText("titulo")}>+ Título</button>
              <button onClick={() => addText("subtitulo")}>+ Subtítulo</button>
              <button onClick={() => addText("etiqueta")}>+ Etiqueta</button>
            </div>
            <button className="btn small" onClick={autoSubtitles} disabled={!!busy}>
              <Captions size={16} aria-hidden /> Subtítulos automáticos
            </button>
            <p className="muted">La IA escucha tus videos y escribe lo que se dice, palabra por palabra (gratis con tu cuenta de Cloudflare).</p>
            <p className="muted">El texto aparece desde el momento actual de la reproducción (puedes ajustarlo).</p>
            <div className="layers">
              {project.texts.map((t) => (
                <div key={t.id} className={`layer-row ${selText === t.id ? "active" : ""}`}>
                  <button className="layer-name" onClick={() => (setSelText(t.id), engine.current?.seek(t.start + 0.5))}>
                    {t.text.slice(0, 24)} · {fmt(t.start)}–{fmt(t.end)}
                  </button>
                  <button onClick={() => update((p) => ({ ...p, texts: p.texts.filter((x) => x.id !== t.id) }))}><Trash2 size={16} aria-hidden /></button>
                </div>
              ))}
            </div>
            {tsel && (
              <div className="props">
                <textarea value={tsel.text} onChange={(e) => updateText(tsel.id, { text: e.target.value })} style={{ minHeight: 56 }} />
                <Range label={`Aparece: ${tsel.start.toFixed(1)} s`} min={0} max={Math.max(0.1, total)} step={0.1} value={tsel.start} onChange={(v) => updateText(tsel.id, { start: Math.min(v, tsel.end - 0.3) })} />
                <Range label={`Desaparece: ${tsel.end.toFixed(1)} s`} min={0} max={Math.max(0.1, total)} step={0.1} value={tsel.end} onChange={(v) => updateText(tsel.id, { end: Math.max(v, tsel.start + 0.3) })} />
                <div className="actions">
                  <button className="btn ghost small" onClick={() => updateText(tsel.id, { start: Math.min(time, tsel.end - 0.3) })}>
                    Empezar aquí ({fmt(time)})
                  </button>
                  <button className="btn ghost small" onClick={() => updateText(tsel.id, { end: Math.max(time, tsel.start + 0.3) })}>
                    Terminar aquí
                  </button>
                </div>
                <label>Posición</label>
                <div className="seg">
                  {(["top", "center", "bottom"] as const).map((p) => (
                    <button key={p} className={tsel.position === p ? "active" : ""} onClick={() => updateText(tsel.id, { position: p })}>
                      {p === "top" ? "Arriba" : p === "center" ? "Centro" : "Abajo"}
                    </button>
                  ))}
                </div>
                <label>Estilo</label>
                <div className="seg">
                  {(["titulo", "subtitulo", "etiqueta"] as const).map((s) => (
                    <button key={s} className={tsel.style === s ? "active" : ""} onClick={() => updateText(tsel.id, { style: s })}>
                      {s === "titulo" ? "Título" : s === "subtitulo" ? "Subtítulo" : "Etiqueta"}
                    </button>
                  ))}
                </div>
                <label>Animación</label>
                <div className="seg">
                  {(["fade", "slide", "pop", "type", "words", "karaoke"] as const).map((a) => (
                    <button key={a} className={tsel.anim === a ? "active" : ""} onClick={() => updateText(tsel.id, { anim: a, highlight: tsel.highlight || accent })}>
                      {{ fade: "Aparecer", slide: "Deslizar", pop: "Rebote", type: "Máquina de escribir", words: "Palabra por palabra", karaoke: "Resaltar palabra" }[a]}
                    </button>
                  ))}
                </div>
                <label>Color del texto</label>
                <Swatches value={tsel.color} onChange={(c) => updateText(tsel.id, { color: c })} />
                {(tsel.anim === "words" || tsel.anim === "karaoke") && (
                  <>
                    <label>Color de la palabra resaltada</label>
                    <Swatches value={tsel.highlight || accent} onChange={(c) => updateText(tsel.id, { highlight: c })} />
                  </>
                )}
                <label>Fondo</label>
                <div className="swatches">
                  <button className={!tsel.bg ? "active" : ""} onClick={() => updateText(tsel.id, { bg: "" })} style={{ background: "transparent", color: "#fff", fontSize: 10, width: "auto", borderRadius: 6, padding: "0 6px" }}>
                    Sin fondo
                  </button>
                  {["rgba(0,0,0,0.55)", "#e5243b", "#ffd23f", "#0d1630", "#ffffff"].map((c) => (
                    <button key={c} className={tsel.bg === c ? "active" : ""} style={{ background: c }} onClick={() => updateText(tsel.id, { bg: c })} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {panel === "stickers" && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>Toca un sticker para agregarlo desde el momento actual. Luego elige su animación y dónde va.</p>
            <div className="presets emojis">
              {STICKER_EMOJIS.map((e) => (
                <button key={e} onClick={() => addSticker(e)} aria-label={`Agregar ${e}`}>
                  {e}
                </button>
              ))}
            </div>
            <div className="layers" style={{ marginTop: 10 }}>
              {stickers.map((st) => (
                <div key={st.id} className={`layer-row ${selSticker === st.id ? "active" : ""}`}>
                  <button className="layer-name" onClick={() => (setSelSticker(st.id), engine.current?.seek(st.start + 0.4))}>
                    {st.emoji} {STICKER_ANIMS.find((a) => a.id === st.anim)?.label} · {fmt(st.start)}–{fmt(st.end)}
                  </button>
                  <button title="Eliminar" aria-label="Eliminar" onClick={() => update((p) => ({ ...p, stickers: (p.stickers || []).filter((x) => x.id !== st.id) }))}>
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            {ssel && (
              <div className="props">
                <label style={{ marginTop: 0 }}>Animación</label>
                <div className="seg">
                  {STICKER_ANIMS.map((a) => (
                    <button key={a.id} className={ssel.anim === a.id ? "active" : ""} onClick={() => updateSticker(ssel.id, { anim: a.id })}>
                      {a.label}
                    </button>
                  ))}
                </div>
                <label>Posición</label>
                <div className="pos-grid" role="group" aria-label="Posición">
                  {[0.2, 0.5, 0.8].flatMap((y) =>
                    [0.2, 0.5, 0.8].map((x) => (
                      <button
                        key={`${x}-${y}`}
                        className={Math.abs(ssel.x - x) < 0.05 && Math.abs(ssel.y - y) < 0.05 ? "active" : ""}
                        onClick={() => updateSticker(ssel.id, { x, y })}
                        aria-label={`Posición ${x},${y}`}
                      />
                    ))
                  )}
                </div>
                <Range label={`Tamaño: ${Math.round(ssel.size * 100)}`} min={0.06} max={0.4} step={0.01} value={ssel.size} onChange={(v) => updateSticker(ssel.id, { size: v })} />
                <Range label={`Aparece: ${ssel.start.toFixed(1)} s`} min={0} max={Math.max(0.1, total)} step={0.1} value={ssel.start} onChange={(v) => updateSticker(ssel.id, { start: Math.min(v, ssel.end - 0.3) })} />
                <Range label={`Desaparece: ${ssel.end.toFixed(1)} s`} min={0} max={Math.max(0.1, total)} step={0.1} value={ssel.end} onChange={(v) => updateSticker(ssel.id, { end: Math.max(v, ssel.start + 0.3) })} />
              </div>
            )}
          </>
        )}

        {panel === "musica" && (
          <>
            <div className="seg">
              <button className={project.music.source === "none" ? "active" : ""} onClick={() => update((p) => ({ ...p, music: { ...p.music, source: "none" } }))}>
                Sin música
              </button>
              <button className={project.music.source === "generated" ? "active" : ""} onClick={() => update((p) => ({ ...p, music: { ...p.music, source: "generated" } }))}>
                <Music size={16} aria-hidden /> Música gratis
              </button>
              <button className={project.music.source === "upload" ? "active" : ""} onClick={() => update((p) => ({ ...p, music: { ...p.music, source: "upload" } }))}>
                <Upload size={16} aria-hidden /> Mi canción
              </button>
            </div>

            {project.music.source === "generated" && (
              <>
                <p className="hint">
                  Música compuesta por la app, <strong>libre de derechos</strong>: puedes usarla en Instagram, TikTok, Facebook y YouTube sin
                  reclamos. Se ajusta sola a la duración de tu video.
                </p>
                <MusicPicker
                  value={project.music.style}
                  onPick={(id) => {
                    update((p) => ({ ...p, music: { ...p.music, style: id, seed: 1 } }));
                    if (!busy) listen(id, 1);
                  }}
                />
                <div className="actions">
                  <button className="btn small" onClick={() => listen()} disabled={!!busy}>
                    <Play size={15} aria-hidden /> Escuchar muestra
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      const seed = project.music.seed + 1;
                      update((p) => ({ ...p, music: { ...p.music, seed } }));
                      listen(project.music.style, seed);
                    }}
                    disabled={!!busy}
                  >
                    <Dices size={16} aria-hidden /> Otra versión
                  </button>
                  <button className="btn ghost small" onClick={stopPreview}>
                    ⏹ Detener
                  </button>
                </div>
                <p className="muted">{describeVersion(project.music.style, project.music.seed)}</p>
              </>
            )}

            {project.music.source === "upload" && (
              <>
                <p className="hint">Sube una canción que tengas derecho a usar (MP3, M4A, WAV). Si es más corta que el video, se repite.</p>
                <label className="btn small" style={{ margin: 0 }}>
                  <Upload size={16} aria-hidden /> Elegir canción
                  <input type="file" accept="audio/*" hidden onChange={(e) => (e.target.files?.[0] && uploadSong(e.target.files[0]), (e.target.value = ""))} />
                </label>
                {project.music.uploadName && (
                  <p className="muted">
                    {uploaded ? "" : "Vuelve a elegirla (no se guarda al cerrar la app):"} {project.music.uploadName}
                  </p>
                )}
              </>
            )}

            {project.music.source !== "none" && (
              <Range
                label={`Volumen de la música: ${Math.round(project.music.volume * 100)}%`}
                min={0}
                max={1}
                step={0.05}
                value={project.music.volume}
                onChange={(v) => update((p) => ({ ...p, music: { ...p.music, volume: v } }))}
              />
            )}
            <Range
              label={`Audio original de los videos: ${Math.round(project.clipVolume * 100)}%`}
              min={0}
              max={1}
              step={0.05}
              value={project.clipVolume}
              onChange={(v) => update((p) => ({ ...p, clipVolume: v }))}
            />
          </>
        )}
      </div>

      {/* Exportar */}
      <div className="editor-export">
        <button className="btn" onClick={exportVideo} disabled={!project.clips.length || !!busy || missing}>
          <Clapperboard size={16} aria-hidden /> Exportar video ({fmt(total)})
        </button>
      </div>
      {result && !busy && (
        <div className="media" style={{ maxWidth: project.format === "16:9" ? 640 : 360, marginTop: 12 }}>
          <video src={result.url} controls playsInline />
          <div className="meta actions">
            <a href={result.url} download={`video-innovationtech.${result.ext}`}>
              <Download size={16} aria-hidden /> Descargar ({result.ext.toUpperCase()})
            </a>
            <span className="muted">· Guardado en tu galería</span>
          </div>
        </div>
      )}
    </section>
  );
}

function Range({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="slider">
      <div className="slider-head">
        <span>{label}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {SW.map((c) => (
        <button key={c} className={value === c ? "active" : ""} style={{ background: c }} onClick={() => onChange(c)} aria-label={`Color ${c}`} />
      ))}
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
