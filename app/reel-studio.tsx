"use client";

import { useEffect, useRef, useState } from "react";
import { Brand, brandAccent, brandContext, brandVisual } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { fileToResizedDataUrl } from "@/lib/resize";
import { ReelFormat, renderReel, supportedRecording } from "@/lib/reel";
import type { Item, Settings } from "@/lib/types";
import { clearDrafts, usePersistentState } from "@/lib/persist";
import { deleteFile, getFile, putFile, toBlob, toDataUrl } from "@/lib/media-store";

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
import { describeVersion, MusicStyleId, renderMusic } from "@/lib/music";
import MusicPicker from "./music-picker";
import LibraryPicker from "./library-picker";
import { loadSong } from "@/lib/library";
import { DEFAULT_VOICE, findVoice } from "@/lib/voices";
import { getLang } from "@/lib/i18n";
import VoicePicker from "./voice-picker";
import { ProTag, refrescarCuenta, useCuenta } from "./account-context";
import { DURACIONES, MAX_TOMAS, maxFotos } from "@/lib/reel-escenas";
import { firmaTomas, terminado, textoEstado, type TrabajoVisto } from "@/lib/estados-video";
import { consultarTomas, pedirTomas, prepararFoto, subirFoto } from "@/lib/video-ia-cliente";

import { Clapperboard, Dices, Download, Mic, Play, Sparkles } from "lucide-react";
// imageId: la foto de la escena guardada en el dispositivo (IndexedDB), para que no se pierda
// al cambiar de sección, editar, cerrar o recargar la app.
// ia: la foto lleva una toma con IA (movimiento real, 5 s); movimiento: lo que se le pide a la IA.
type Scene = { image: string; caption: string; prompt: string; loading?: boolean; imageId?: string; ia?: boolean; movimiento?: string };

// Tomas con IA que siguen en proceso (se guardan para retomarlas sin pedirlas ni descontarlas otra vez)
type TomasPendientes = { ids: string[]; firma: string } | null;
const ESPERA_TOMAS = 5000; // cada cuánto se consulta
const MAX_ESPERA = 20 * 60 * 1000;

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
    undefined,
    // Las fotos van al almacenamiento del dispositivo (IndexedDB); aquí solo se guarda su id y los textos.
    (s) => s.map((sc) => ({ ...sc, image: sc.imageId || !sc.image.startsWith("data:") ? (sc.imageId ? "" : sc.image) : "", loading: false }))
  );
  // id guardado → foto que tiene (para saber si cambió)
  const savedImages = useRef(new Map<string, string>());
  const restored = useRef(false);

  // Al abrir la app: recuperar las fotos de las escenas desde el dispositivo.
  useEffect(() => {
    if (restored.current) return;
    const missing = scenes.filter((sc) => sc.imageId && !sc.image);
    const t = setTimeout(async () => {
      restored.current = true;
      for (const sc of missing) {
        const blob = await getFile(sc.imageId!).catch(() => null);
        if (!blob) continue;
        const url = await blobToDataUrl(blob);
        savedImages.current.set(sc.imageId!, url);
        setScenes((all) => all.map((x) => (x.imageId === sc.imageId && !x.image ? { ...x, image: url } : x)));
      }
    }, 400); // espera a que se cargue el borrador guardado
    return () => clearTimeout(t);
  }, [scenes, setScenes]);

  // Cada foto nueva o cambiada se guarda en el dispositivo.
  useEffect(() => {
    if (!restored.current) return;
    scenes.forEach((sc, i) => {
      if (!sc.image) return;
      if (sc.imageId && savedImages.current.get(sc.imageId) === sc.image) return;
      if (sc.imageId && !savedImages.current.has(sc.imageId) && !sc.image.startsWith("data:")) return;
      const old = sc.imageId;
      const id = `reel-${Math.random().toString(36).slice(2, 10)}`;
      savedImages.current.set(id, sc.image);
      setScenes((all) => all.map((x, j) => (j === i && x.image === sc.image ? { ...x, imageId: id } : x)));
      (async () => {
        const blob = await toBlob(sc.image);
        if (blob) await putFile(id, blob).catch(() => {});
        if (old) {
          savedImages.current.delete(old);
          deleteFile(old).catch(() => {});
        }
      })();
    });
  }, [scenes, setScenes]);
  const [seconds, setSeconds] = usePersistentState("reel:segundos", 3);
  // 0 = automática (segundos por escena); 10, 15, 20 o 30 = video de duración fija
  const [duracion, setDuracion] = usePersistentState<number>("reel:duracion", 0);
  const [pendientes, setPendientes] = usePersistentState<TomasPendientes>("reel:tomas-pendientes", null);
  const [estadoIa, setEstadoIa] = useState("");
  const [invitarPlan, setInvitarPlan] = useState(false);
  const subidas = useRef(new Map<string, string>()); // sha256 → llave de la foto ya subida
  const { activo: cuentasOn, cuenta, abrirPlanes } = useCuenta();
  const conCuenta = cuentasOn && !!cuenta?.usuario;
  const esDemo = !!cuenta?.usuario && cuenta.efectivo.plan === "prueba";
  const tomasMarcadas = scenes.filter((s) => s.image && s.ia).length;
  const [brandName, setBrandName] = usePersistentState("reel:negocio", brand.name);
  const [cta, setCta] = usePersistentState("reel:cta", "");
  // Color, logo y letra vienen de «Mi marca»; el color se puede cambiar solo para este reel.
  const [accentOverride, setAccentOverride] = usePersistentState("reel:acento", "");
  const accent = accentOverride || brandAccent(brand);
  const logo = brand.logo;
  const [useLogo, setUseLogo] = usePersistentState("reel:usar-logo", true);
  const [subtitlesOn, setSubtitlesOn] = usePersistentState("reel:subtitulos", true);
  const [script, setScript] = usePersistentState("reel:guion", "");
  const [musicOn, setMusicOn] = usePersistentState("reel:musica", true);
  const [musicStyle, setMusicStyle] = usePersistentState<MusicStyleId>("reel:musica-estilo", "pop");
  const [musicSeed, setMusicSeed] = usePersistentState("reel:musica-version", 1);
  const [musicVolume, setMusicVolume] = usePersistentState("reel:musica-volumen", 0.6);
  const [musicSource, setMusicSource] = usePersistentState<"generated" | "library">("reel:musica-fuente", "generated");
  const [songId, setSongId] = usePersistentState("reel:cancion", "advertime");
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
  const listenMusic = (seed: number, style: MusicStyleId = musicStyle, song?: string) =>
    run(song ? "Cargando canción…" : "Componiendo una muestra…", async () => {
      stopListen();
      const buf = song ? await loadSong(song) : await renderMusic({ style, seed, duration: 15 });
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
  const [voiceId, setVoiceId] = usePersistentState<string>("reel:voz", DEFAULT_VOICE[getLang()]);
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
      // De 3 en 3 para no saturar el límite gratuito de Cloudflare (hasta 8 escenas).
      const pending = scenes.map((sc, i) => i).filter((i) => !scenes[i].image);
      let failed: unknown = null;
      for (let k = 0; k < pending.length; k += 3) {
        const batch = pending.slice(k, k + 3);
        setBusy(`Creando imágenes ${k + 1}–${k + batch.length} de ${pending.length}…`);
        const results = await Promise.allSettled(
          batch.map((i) => makeImage(i, data.imagePrompts?.[i] || `${topic}, ${data.captions[i] || ""}`))
        );
        const bad = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        if (bad && !failed) failed = bad.reason;
      }
      if (failed) throw failed;
    });

  const makeVoice = () =>
    run("Generando voz…", async () => {
      if (!script.trim()) throw new Error("Escribe el guion de la voz en off.");
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", ...cfHeaders },
        body: JSON.stringify({ text: script, lang: getLang(), voice: findVoice(voiceId)?.lang === getLang() ? voiceId : DEFAULT_VOICE[getLang()] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVoice(data.audio);
    });

  // Marca o desmarca una foto «con IA» (máximo 2). Las tomas necesitan un video de duración fija.
  function marcarIa(i: number, on: boolean) {
    if (on && tomasMarcadas >= MAX_TOMAS) return setError(`Puedes marcar máximo ${MAX_TOMAS} fotos con IA por video.`);
    setError("");
    setScene(i, { ia: on });
    if (on && !duracion) {
      const fotos = scenes.filter((s) => s.image).length;
      setDuracion(DURACIONES.find((d) => maxFotos(d - 3, tomasMarcadas + 1) >= fotos) ?? 30);
    }
  }

  // Graba el video. clips: el clip de IA de cada escena lista (null = animación normal).
  async function grabar(clips?: (string | null)[]) {
    {
      const ready = scenes.filter((s) => s.image);
      if (ready.length === 0) throw new Error("Agrega al menos una imagen a las escenas.");
      setResult(null);
      setProgress(0);
      if (result) URL.revokeObjectURL(result.url);
      const r = await renderReel({
        images: ready.map((s) => s.image),
        captions: ready.map((s) => s.caption),
        secondsPerSlide: seconds,
        duracion: duracion || undefined,
        tomas: duracion ? ready.flatMap((s, i) => (s.ia ? [i] : [])) : undefined,
        clips,
        format,
        accent,
        brandName,
        cta,
        logo: (useLogo && logo) || undefined,
        font: brand.font || undefined,
        voice: voice || undefined,
        subtitles: voice && subtitlesOn ? { script, highlight: accent } : null,
        music: musicOn ? { style: musicStyle, seed: musicSeed, volume: musicVolume, song: musicSource === "library" ? songId : undefined } : null,
        onStatus: (m) => setBusy(m || "Grabando tu reel…"),
        onProgress: setProgress,
        previewCanvas: preview.current || undefined,
      });
      setResult({ url: r.url, ext: r.ext, seconds: r.seconds });
      onVideo(r.blob, `Reel: ${topic || brandName || "sin título"}`); // se guarda solo en la galería
    }
  }

  const buildReel = () =>
    run("Grabando tu reel…", async () => {
      await grabar();
      if (tomasMarcadas > 0) setEstadoIa(textoEstado({ tipo: "previa" }));
    });

  // Genera las tomas con IA (sube las fotos marcadas, espera los clips) y graba el video final.
  const generarConIa = () =>
    run("Preparando las tomas con IA…", async () => {
      const ready = scenes.filter((s) => s.image);
      const marcadas = ready.flatMap((s, i) => (s.ia ? [{ i, s }] : []));
      if (marcadas.length === 0) throw new Error("Marca 1 o 2 fotos «con IA».");
      if (!duracion) throw new Error("Elige la duración del video (10, 15, 20 o 30 s).");
      setInvitarPlan(false);
      const fotos = await Promise.all(marcadas.map((m) => prepararFoto(m.s.image)));
      const firma = firmaTomas(marcadas.map((m, k) => ({ sha256: fotos[k].sha256, movimiento: m.s.movimiento ?? "" })));
      let ids = pendientes && pendientes.firma === firma ? pendientes.ids : null;
      if (!ids) {
        const llaves: string[] = [];
        for (const [k, f] of fotos.entries()) {
          let llave = subidas.current.get(f.sha256);
          if (!llave) {
            llave = await subirFoto(f, (pct) => setBusy(textoEstado({ tipo: "subiendo", pct: (k * 100 + pct) / fotos.length })));
            subidas.current.set(f.sha256, llave);
          }
          llaves.push(llave);
        }
        ids = await pedirTomas(marcadas.map((m, k) => ({ imagenKey: llaves[k], movimiento: m.s.movimiento ?? "" })));
        setPendientes({ ids, firma });
        void refrescarCuenta(); // actualiza «te quedan X tomas»
      }
      // Espera a que terminen (el servidor avisa el lugar en la fila y cuándo está cada toma)
      const inicio = Date.now();
      let vistos: TrabajoVisto[] = [];
      for (;;) {
        const r = await consultarTomas(ids);
        vistos = r.trabajos;
        if (vistos.length === 0) {
          setPendientes(null);
          throw new Error("No encontramos esas tomas. Vuelve a generarlas.");
        }
        const texto = textoEstado({ tipo: "trabajos", trabajos: vistos, topeHoy: r.topeHoy });
        setBusy(texto);
        if (terminado(vistos)) break;
        const hayCupo = !(r.topeHoy && !vistos.some((t) => t.estado === "enviado"));
        if (!hayCupo || Date.now() - inicio > MAX_ESPERA) {
          // Se quedan guardadas: al volver y tocar «Generar con IA» se retoman sin costo
          setEstadoIa(hayCupo ? "Tus tomas siguen en proceso. Vuelve en unos minutos y toca «Generar con IA» para terminar tu video." : texto);
          return;
        }
        await new Promise((res) => setTimeout(res, ESPERA_TOMAS));
      }
      setPendientes(null);
      void refrescarCuenta();
      const porId = new Map(vistos.map((t) => [t.id, t]));
      const clips: (string | null)[] = ready.map(() => null);
      marcadas.forEach((m, k) => (clips[m.i] = porId.get(ids![k])?.clipUrl ?? null));
      setBusy("Grabando tu reel…");
      await grabar(clips);
      setEstadoIa(textoEstado({ tipo: "trabajos", trabajos: vistos, topeHoy: false }));
      setInvitarPlan(esDemo);
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
            scenes.forEach((sc) => sc.imageId && deleteFile(sc.imageId).catch(() => {}));
            setScenes(Array.from({ length: count }, emptyScene));
            setCta("");
            setScript("");
            setVoice("");
            setResult(null);
            setError("");
            setEstadoIa("");
            setInvitarPlan(false);
            setPendientes(null);
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
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
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
          <label>Duración del video</label>
          <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
            <option value={0}>Automática</option>
            {DURACIONES.map((n) => (
              <option key={n} value={n}>
                {n} s
              </option>
            ))}
          </select>
        </div>
        {!duracion && (
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
        )}
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
                <button className="btn ghost small" onClick={() => (sc.imageId && deleteFile(sc.imageId).catch(() => {}), setScene(i, { image: "", imageId: undefined }))}>
                  Quitar
                </button>
              )}
            </div>
            {conCuenta && sc.image && (
              <label className="check scene-ia">
                <input type="checkbox" checked={!!sc.ia} disabled={!!busy} onChange={(e) => marcarIa(i, e.target.checked)} />
                Con IA (movimiento real, 5 s)
              </label>
            )}
            {conCuenta && sc.image && sc.ia && (
              <input
                value={sc.movimiento ?? ""}
                maxLength={300}
                onChange={(e) => setScene(i, { movimiento: e.target.value })}
                placeholder="Movimiento (opcional). Ej.: la cámara se acerca despacio"
              />
            )}
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
      <h3 className="step">4. Voz en off (opcional, gratis con Cloudflare)<ProTag h="voz" /></h3>
      <textarea
        value={script}
        onChange={(e) => (setScript(e.target.value), setVoice(""))}
        placeholder="Lo que dirá la voz. «Crear todo con IA» lo escribe por ti."
        style={{ minHeight: 70 }}
      />
      <label>Elige la voz (toca ▶ para escucharla)</label>
      <VoicePicker value={voiceId} onChange={(id) => (setVoiceId(id), setVoice(""))} headers={cfHeaders} />
      <p className="hint" style={{ marginTop: 6 }}>
        Para que suene más natural, escribe como hablas: usa comas para las pausas, puntos para respirar y signos de ¡exclamación! o ¿pregunta? para dar emoción.
      </p>
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
      {voice && (
        <>
          <label className="check">
            <input type="checkbox" checked={subtitlesOn} onChange={(e) => setSubtitlesOn(e.target.checked)} />
            Subtítulos de la voz, palabra por palabra (estilo TikTok)<ProTag h="subtitulos" />
          </label>
          <p className="hint" style={{ marginTop: 6 }}>
            El reel durará lo necesario para que la voz se escuche completa. Si cambias el guion, vuelve a generar la voz para que los subtítulos coincidan.
          </p>
        </>
      )}

      {/* 5. Música */}
      <h3 className="step">5. Música de fondo (gratis, sin derechos de autor)</h3>
      <div className="seg">
        <button className={!musicOn ? "active" : ""} onClick={() => (stopListen(), setMusicOn(false))}>
          Sin música
        </button>
        <button className={musicOn && musicSource === "generated" ? "active" : ""} onClick={() => (setMusicOn(true), setMusicSource("generated"))}>
          Compuesta por la app
        </button>
        <button className={musicOn && musicSource === "library" ? "active" : ""} onClick={() => (setMusicOn(true), setMusicSource("library"))}>
          Biblioteca de canciones
        </button>
      </div>
      {musicOn && musicSource === "generated" && (
        <>
          <p className="hint">Toca un estilo para escucharlo. «Otra versión» cambia tempo, tono, instrumentos y melodía.</p>
          <MusicPicker
            value={musicStyle}
            onPick={(id) => {
              setMusicStyle(id);
              setMusicSeed(1);
              if (!busy) listenMusic(1, id);
            }}
          />
        </>
      )}
      {musicOn && musicSource === "library" && (
        <LibraryPicker
          value={songId}
          onPick={(id) => {
            setSongId(id);
            if (!busy) listenMusic(1, musicStyle, id);
          }}
        />
      )}
      {musicOn && (
        <>
          <div className="actions">
            <button className="btn ghost small" disabled={!!busy} onClick={() => listenMusic(musicSeed, musicStyle, musicSource === "library" ? songId : undefined)}>
              <Play size={15} aria-hidden /> Escuchar
            </button>
            {musicSource === "generated" && (
              <button className="btn ghost small" disabled={!!busy} onClick={() => (setMusicSeed(musicSeed + 1), listenMusic(musicSeed + 1))}>
                <Dices size={16} aria-hidden /> Otra versión
              </button>
            )}
            <button className="btn ghost small" onClick={stopListen}>
              ⏹ Detener
            </button>
          </div>
          {musicSource === "generated" && <p className="muted" style={{ margin: "6px 0 0" }}>{describeVersion(musicStyle, musicSeed)}</p>}
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
      {tomasMarcadas > 0 && (
        <p className="hint">
          La vista previa es gratis: las fotos con IA se ven con zoom hasta que las generes. Solo «Generar con IA» usa tus tomas con IA.
        </p>
      )}
      <div className="actions">
        <button className="btn" disabled={!!busy || !canRecord || !scenes.some((s) => s.image)} onClick={buildReel}>
          <Clapperboard size={16} aria-hidden /> {tomasMarcadas > 0 ? "Vista previa gratis" : "Crear reel"}
        </button>
        {conCuenta && tomasMarcadas > 0 && (
          <button className="btn" disabled={!!busy || !canRecord} onClick={generarConIa}>
            <Sparkles size={16} aria-hidden /> Generar con IA
            {esDemo && <span className="acct-pro">Demo gratis</span>}
          </button>
        )}
      </div>
      {duracion > 0 && voice && (
        <p className="hint" style={{ marginTop: 6 }}>Con duración fija, la voz se corta si dura más que el video.</p>
      )}
      {!busy && estadoIa && tomasMarcadas > 0 && <div className="notice">{estadoIa}</div>}
      {!busy && invitarPlan && (
        <div className="acct-upsell">
          <span>Elige un plan para seguir creando videos con IA</span>
          <button className="btn small" onClick={abrirPlanes}>
            Ver planes
          </button>
        </div>
      )}
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
