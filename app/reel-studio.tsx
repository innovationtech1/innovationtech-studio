"use client";

import { useEffect, useRef, useState } from "react";
import { Brand, brandAccent, brandContext, brandVisual } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { fileToResizedDataUrl } from "@/lib/resize";
import { ReelFormat, renderReel, supportedRecording } from "@/lib/reel";
import type { Item, Settings } from "@/lib/types";
import { clearDrafts, usePersistentState } from "@/lib/persist";
import { toDataUrl } from "@/lib/media-store";
import { MUSIC_STYLES, MusicStyleId, renderMusic } from "@/lib/music";

import { Clapperboard, Dices, Download, Mic, Play, Sparkles, VolumeX } from "lucide-react";
type Scene = { image: string; caption: string; prompt: string; loading?: boolean };

const emptyScene = (): Scene => ({ image: "", caption: "", prompt: "" });

export default function ReelStudio({
  settings,
  brand,
  gallery,
  onImages,
  onVideo,
  handoff,
  sceneUpdate,
  incomingTopic,
  onEditScene,
  onOpenBrand,
}: {
  sceneUpdate: { scene: number; url: string; n: number } | null;
  incomingTopic?: { text: string; n: number } | null;
  onEditScene: (i: number, src: string) => void;
  onOpenBrand: () => void;
  onVideo: (blob: Blob, prompt: string) => void;
  settings: Settings;
  brand: Brand;
  gallery: Item[];
  onImages: (items: Item[]) => void;
  handoff: { url: string; n: number } | null;
}) {
  // Todo lo que escribes se guarda: no se pierde al cambiar de pestaña ni al cerrar la app.
  const [topic, setTopic] = usePersistentState("reel:tema", "");
  const [count, setCount] = usePersistentState("reel:escenas", 4);
  const [format, setFormat] = usePersistentState<ReelFormat>("reel:formato", "9:16");
  const [scenes, setScenes] = usePersistentState<Scene[]>(
    "reel:escenas-datos",
    Array.from({ length: 4 }, emptyScene),
    // Si las fotos no caben en el navegador, guardamos al menos los textos.
    (s) => s.map((sc) => ({ ...sc, image: sc.image.startsWith("data:") ? "" : sc.image, loading: false }))
  );
  const [seconds, setSeconds] = usePersistentState("reel:segundos", 3);
  const [brandName, setBrandName] = usePersistentState("reel:negocio", brand.name);
  const [cta, setCta] = usePersistentState("reel:cta", "");
  // Color, logo y letra vienen de «Mi marca»; el color se puede cambiar solo para este reel.
  const [accentOverride, setAccentOverride] = usePersistentState("reel:acento", "");
  const accent = accentOverride || brandAccent(brand);
  const logo = brand.logo;
  const [useLogo, setUseLogo] = usePersistentState("reel:usar-logo", true);
  const [script, setScript] = usePersistentState("reel:guion", "");
  const [musicOn, setMusicOn] = usePersistentState("reel:musica", true);
  const [musicStyle, setMusicStyle] = usePersistentState<MusicStyleId>("reel:musica-estilo", "pop");
  const [musicSeed, setMusicSeed] = usePersistentState("reel:musica-version", 1);
  const [musicVolume, setMusicVolume] = usePersistentState("reel:musica-volumen", 0.6);
  const listenNode = useRef<AudioBufferSourceNode | null>(null);
  const listenCtx = useRef<AudioContext | null>(null);
  const stopListen = () => {
    try {
      listenNode.current?.stop();
    } catch {
      /* nada */
    }
    listenNode.current = null;
  };
  const listenMusic = (seed: number) =>
    run("Componiendo una muestra…", async () => {
      stopListen();
      const buf = await renderMusic({ style: musicStyle, seed, duration: 12 });
      if (!listenCtx.current) listenCtx.current = new AudioContext();
      await listenCtx.current.resume();
      const s = listenCtx.current.createBufferSource();
      s.buffer = buf;
      const g = listenCtx.current.createGain();
      g.gain.value = musicVolume;
      s.connect(g).connect(listenCtx.current.destination);
      s.start();
      listenNode.current = s;
    });
  const [voice, setVoice] = useState("");
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; ext: string; seconds: number } | null>(null);
  const [error, setError] = useState("");
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Si la app se cerró mientras se creaba una imagen, quitamos el «Creando…».
    const t = setTimeout(() => setScenes((s) => s.map((sc) => (sc.loading ? { ...sc, loading: false } : sc))), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Imagen enviada desde «Animar en video»: va a la primera escena libre.
  useEffect(() => {
    if (!handoff) return;
    setScenes((s) => {
      const free = s.findIndex((sc) => !sc.image);
      const i = free >= 0 ? free : 0;
      return s.map((sc, j) => (j === i ? { ...sc, image: handoff.url, loading: false } : sc));
    });
  }, [handoff, setScenes]);
  useEffect(() => setBrandName((b) => b || brand.name), [brand.name]);
  // Tema enviado desde el calendario de contenido
  useEffect(() => {
    if (incomingTopic) setTopic(incomingTopic.text);
  }, [incomingTopic, setTopic]);
  // Escena que vuelve del editor
  useEffect(() => {
    if (!sceneUpdate) return;
    setScenes((s) => s.map((sc, j) => (j === sceneUpdate.scene ? { ...sc, image: sceneUpdate.url, loading: false } : sc)));
  }, [sceneUpdate, setScenes]);

  const canRecord = typeof window === "undefined" ? true : supportedRecording() !== null;
  const galleryImages = gallery.filter((g) => g.kind === "imagen");
  const cfHeaders = { "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken };

  const setScene = (i: number, patch: Partial<Scene>) =>
    setScenes((s) => s.map((sc, j) => (j === i ? { ...sc, ...patch } : sc)));

  function resize(n: number) {
    setCount(n);
    setScenes((s) => (s.length >= n ? s.slice(0, n) : [...s, ...Array.from({ length: n - s.length }, emptyScene)]));
  }

  async function writeWithAi(): Promise<{ captions: string[]; imagePrompts: string[] } | null> {
    const res = await fetch("/api/text", {
      method: "POST",
      headers:
        settings.textProvider === "cloudflare"
          ? { "content-type": "application/json", ...cfHeaders }
          : { "content-type": "application/json", "x-anthropic-key": settings.anthropicKey },
      body: JSON.stringify({
        mode: "reel",
        scenes: scenes.length,
        prompt: topic,
        brand: brandContext(brand),
        provider: settings.textProvider,
        model: settings.textProvider === "cloudflare" ? settings.cfTextModel : settings.textModel,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setScenes((s) =>
      s.map((sc, i) => ({ ...sc, caption: data.captions[i] ?? sc.caption, prompt: data.imagePrompts?.[i] ?? sc.prompt }))
    );
    if (data.cta) setCta(data.cta);
    if (data.voiceover) setScript(data.voiceover);
    return data;
  }

  async function makeImage(i: number, promptText: string) {
    if (!promptText.trim()) throw new Error("Escribe primero el tema del reel o los textos.");
    setScene(i, { loading: true });
    try {
      const cf = settings.imageProvider === "cloudflare";
      const res = await fetch("/api/image", {
        method: "POST",
        headers: cf
          ? { "content-type": "application/json", ...cfHeaders }
          : { "content-type": "application/json", "x-replicate-key": settings.replicateKey },
        body: JSON.stringify({
          prompt: promptText + brandVisual(brand),
          aspectRatio: format,
          count: 1,
          provider: settings.imageProvider,
          model: cf ? settings.cfImageModel : settings.imageModel,
          refModel: settings.cfRefModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const url = data.urls[0];
      setScene(i, { image: url, loading: false });
      onImages([{ kind: "imagen", url, prompt: promptText, date: new Date().toISOString() }]);
    } catch (e) {
      setScene(i, { loading: false });
      throw e;
    }
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setBusy("");
    }
  }

  const createAll = () =>
    run("Escribiendo y creando imágenes…", async () => {
      if (!topic.trim()) throw new Error("Escribe de qué trata el reel.");
      const data = await writeWithAi();
      if (!data) return;
      // Solo crea imágenes para las escenas que aún no tienen una.
      const jobs = scenes.map((sc, i) =>
        sc.image ? Promise.resolve() : makeImage(i, data.imagePrompts?.[i] || `${topic}, ${data.captions[i] || ""}`)
      );
      const results = await Promise.allSettled(jobs);
      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (failed) throw failed.reason;
    });

  const makeVoice = () =>
    run("Generando voz…", async () => {
      if (!script.trim()) throw new Error("Escribe el guion de la voz en off.");
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", ...cfHeaders },
        body: JSON.stringify({ text: script, lang: "es" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVoice(data.audio);
    });

  const buildReel = () =>
    run("Grabando tu reel…", async () => {
      const ready = scenes.filter((s) => s.image);
      if (ready.length === 0) throw new Error("Agrega al menos una imagen a las escenas.");
      setResult(null);
      setProgress(0);
      if (result) URL.revokeObjectURL(result.url);
      const r = await renderReel({
        images: ready.map((s) => s.image),
        captions: ready.map((s) => s.caption),
        secondsPerSlide: seconds,
        format,
        accent,
        brandName,
        cta,
        logo: (useLogo && logo) || undefined,
        font: brand.font || undefined,
        voice: voice || undefined,
        music: musicOn ? { style: musicStyle, seed: musicSeed, volume: musicVolume } : null,
        onStatus: (m) => setBusy(m || "Grabando tu reel…"),
        onProgress: setProgress,
        previewCanvas: preview.current || undefined,
      });
      setResult({ url: r.url, ext: r.ext, seconds: r.seconds });
      onVideo(r.blob, `Reel: ${topic || brandName || "sin título"}`); // se guarda solo en la galería
    });

  const ratioStyle = format === "9:16" ? "9 / 16" : format === "1:1" ? "1 / 1" : "16 / 9";

  return (
    <section className="card">
      <div className="card-head">
        <h2>Creador de Reels · gratis</h2>
        <button
          className="btn ghost small"
          disabled={!!busy}
          onClick={() => {
            if (!confirm("¿Empezar un reel nuevo? Se borrarán el tema, las escenas y el guion actuales.")) return;
            clearDrafts("reel:");
            setTopic("");
            setScenes(Array.from({ length: count }, emptyScene));
            setCta("");
            setScript("");
            setVoice("");
            setResult(null);
            setError("");
          }}
        >
          Empezar nuevo
        </button>
      </div>
      <p className="hint">
        Arma un video con tus imágenes animadas, textos en pantalla, tu marca y voz en off. Se crea en tu navegador: sin
        costo y sin límite.
      </p>
      {!canRecord && (
        <div className="error">Este navegador no puede grabar video. Usa Chrome, Edge o Safari actualizados.</div>
      )}

      {/* 1. Tema */}
      <h3 className="step">1. ¿De qué trata el reel?</h3>
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Ej.: Promoción 2x1 en tortas los martes en Tortas Tortuga"
        style={{ minHeight: 80 }}
      />
      <div className="row">
        <div>
          <label>Escenas</label>
          <select value={count} onChange={(e) => resize(Number(e.target.value))}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} escenas
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Formato</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as ReelFormat)}>
            <option value="9:16">Vertical 9:16 (Reels, TikTok, Historias)</option>
            <option value="1:1">Cuadrado 1:1 (feed)</option>
            <option value="16:9">Horizontal 16:9 (YouTube, web)</option>
          </select>
        </div>
        <div>
          <label>Segundos por escena</label>
          <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} s
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="actions">
        <button className="btn" disabled={!!busy || !topic.trim()} onClick={createAll}>
          <Sparkles size={16} aria-hidden /> Crear todo con IA
        </button>
        <button
          className="btn ghost"
          disabled={!!busy || !topic.trim()}
          onClick={() => run("Escribiendo textos…", writeWithAi)}
        >
          Solo escribir textos
        </button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        «Crear todo» escribe los textos, el cierre y el guion de voz, y crea una imagen para cada escena vacía.
      </p>

      {/* 2. Escenas */}
      <h3 className="step">2. Escenas</h3>
      <div className="scenes">
        {scenes.map((sc, i) => (
          <div className="scene" key={i}>
            <div className="scene-img" style={{ aspectRatio: ratioStyle }}>
              {sc.loading ? (
                <span className="muted">Creando…</span>
              ) : sc.image ? (
                <img src={sc.image} alt={`Escena ${i + 1}`} />
              ) : (
                <span className="muted">Escena {i + 1}</span>
              )}
            </div>
            <input
              value={sc.caption}
              onChange={(e) => setScene(i, { caption: e.target.value })}
              placeholder={`Texto en pantalla ${i + 1}`}
            />
            <div className="actions">
              <label className="btn ghost small" style={{ margin: 0 }}>
                Subir
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) run("Cargando foto…", async () => setScene(i, { image: await fileToResizedDataUrl(f, 1280) }));
                  }}
                />
              </label>
              <button className="btn ghost small" onClick={() => setPicking(picking === i ? null : i)}>
                Galería
              </button>
              <button
                className="btn ghost small"
                disabled={!!busy || sc.loading}
                onClick={() =>
                  run("Creando imagen…", () => makeImage(i, sc.prompt || `${topic}, ${sc.caption}, advertising photography`))
                }
              >
                Crear con IA
              </button>
              {sc.image && (
                <button className="btn small" onClick={() => onEditScene(i, sc.image)}>
                  Editar
                </button>
              )}
              {sc.image && (
                <button className="btn ghost small" onClick={() => setScene(i, { image: "" })}>
                  Quitar
                </button>
              )}
            </div>
            {picking === i && (
              <div className="picker">
                {galleryImages.length === 0 && <span className="muted">Tu galería está vacía.</span>}
                {galleryImages.slice(0, 24).map((g, k) => (
                  <img
                    key={g.url + k}
                    src={g.url}
                    alt={g.prompt}
                    onClick={async () => (setScene(i, { image: await toDataUrl(g.url) }), setPicking(null))}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 3. Cierre */}
      <h3 className="step">3. Cierre con tu marca</h3>
      <div className="row">
        <div>
          <label>Nombre del negocio</label>
          <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Ej.: Tortas Tortuga" />
        </div>
        <div>
          <label>Llamada a la acción</label>
          <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ej.: Te esperamos este martes" />
        </div>
      </div>
      <div className="reel-brand">
        {logo ? <img src={logo} alt="Logo" /> : <span className="muted">Sin logo</span>}
        <div className="reel-brand-info">
          <strong>Tu marca en el reel</strong>
          <span className="muted">
            Color, logo{brand.font ? ` y letra ${brand.font}` : ""} de Mi marca.
          </span>
          {logo && (
            <label className="check" style={{ margin: "4px 0 0" }}>
              <input type="checkbox" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} />
              Poner el logo en el cierre
            </label>
          )}
        </div>
        <label className="reel-accent" title="Color de acento de este reel">
          <input type="color" value={accent} onChange={(e) => setAccentOverride(e.target.value)} aria-label="Color de acento" />
        </label>
        <button className="btn ghost small" onClick={onOpenBrand}>
          Editar mi marca
        </button>
      </div>
      {accentOverride && accentOverride !== brandAccent(brand) && (
        <button className="btn ghost small" onClick={() => setAccentOverride("")}>
          Usar el color de mi marca
        </button>
      )}

      {/* 4. Voz */}
      <h3 className="step">4. Voz en off (opcional, gratis con Cloudflare)</h3>
      <textarea
        value={script}
        onChange={(e) => (setScript(e.target.value), setVoice(""))}
        placeholder="Lo que dirá la voz. «Crear todo con IA» lo escribe por ti."
        style={{ minHeight: 70 }}
      />
      <div className="actions" style={{ alignItems: "center" }}>
        <button className="btn ghost small" disabled={!!busy || !script.trim()} onClick={makeVoice}>
          <Mic size={16} aria-hidden /> Generar voz
        </button>
        {voice && (
          <>
            <audio src={voice} controls style={{ height: 36, marginTop: 8 }} />
            <button className="btn ghost small" onClick={() => setVoice("")}>
              Sin voz
            </button>
          </>
        )}
      </div>
      {voice && <p className="hint" style={{ marginTop: 6 }}>El reel durará lo necesario para que la voz se escuche completa.</p>}

      {/* 5. Música */}
      <h3 className="step">5. Música de fondo (gratis, sin derechos de autor)</h3>
      <div className="music-grid">
        <button className={!musicOn ? "active" : ""} onClick={() => setMusicOn(false)}>
          <VolumeX size={18} aria-hidden />
          <strong>Sin música</strong>
        </button>
        {MUSIC_STYLES.map((m) => (
          <button
            key={m.id}
            className={musicOn && musicStyle === m.id ? "active" : ""}
            onClick={() => (setMusicOn(true), setMusicStyle(m.id), setMusicSeed(1))}
          >
            <span className="emoji">{m.emoji}</span>
            <strong>{m.label}</strong>
          </button>
        ))}
      </div>
      {musicOn && (
        <>
          <div className="actions">
            <button className="btn ghost small" disabled={!!busy} onClick={() => listenMusic(musicSeed)}>
              <Play size={15} aria-hidden /> Escuchar
            </button>
            <button className="btn ghost small" disabled={!!busy} onClick={() => (setMusicSeed(musicSeed + 1), listenMusic(musicSeed + 1))}>
              <Dices size={16} aria-hidden /> Otra versión
            </button>
            <button className="btn ghost small" onClick={stopListen}>
              ⏹
            </button>
          </div>
          <div className="slider">
            <div className="slider-head">
              <span>Volumen de la música{voice ? " (baja sola mientras habla la voz)" : ""}</span>
              <span>{Math.round(musicVolume * 100)}%</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} />
          </div>
        </>
      )}

      {/* 6. Crear */}
      <h3 className="step">6. Crear el video</h3>
      <button className="btn" disabled={!!busy || !canRecord || !scenes.some((s) => s.image)} onClick={buildReel}>
        <Clapperboard size={16} aria-hidden /> Crear reel
      </button>
      {busy && (
        <div className="notice">
          {busy}
          {busy.startsWith("Grabando") && (
            <>
              {" "}
              {Math.round(progress * 100)}% · Mantén esta pantalla abierta hasta que termine.
              <div className="bar">
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      )}
      {error && <div className="error">{error}</div>}

      <div className="reel-output">
        <canvas
          ref={preview}
          className="reel-canvas"
          style={{ aspectRatio: ratioStyle, display: busy.startsWith("Grabando") ? "block" : "none" }}
        />
        {result && !busy && (
          <div className="media" style={{ maxWidth: format === "16:9" ? 640 : 360 }}>
            <video src={result.url} controls playsInline />
            <div className="meta actions">
              <a href={result.url} download={`reel-innovationtech.${result.ext}`}>
                <Download size={16} aria-hidden /> Descargar video ({result.seconds} s, {result.ext.toUpperCase()})
              </a>
              <span className="muted">· Guardado en tu galería</span>
            </div>
          </div>
        )}
      </div>
      {result && result.ext === "webm" && !busy && (
        <p className="hint" style={{ marginTop: 8 }}>
          Este navegador graba en formato WebM. Instagram y TikTok lo aceptan desde la computadora; si tu celular no lo
          abre, crea el reel desde Safari o desde Chrome actualizado, que graban en MP4.
        </p>
      )}
    </section>
  );
}
