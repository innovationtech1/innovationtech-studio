"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brand, brandAccent, brandContext, brandVisual } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { fileToResizedDataUrl } from "@/lib/resize";
import { ReelFormat, ReelOptions, renderReel, supportedRecording, vistaPrevia } from "@/lib/reel";
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
import { describeVersion, MUSIC_STYLES, MusicStyleId, renderMusic } from "@/lib/music";
import MusicPicker from "./music-picker";
import LibraryPicker from "./library-picker";
import { loadSong } from "@/lib/library";
import { DEFAULT_VOICE, VOICES, findVoice } from "@/lib/voices";
import { getLang } from "@/lib/i18n";
import VoicePicker from "./voice-picker";
import { marcarDemoALaVista, ProTag, refrescarCuenta, useCuenta, usePuede } from "./account-context";
import {
  MAX_VIDEO,
  aEscenas,
  ajustarAVoz,
  borrar,
  cambiar,
  cierreDe,
  duplicar,
  duracionTotal,
  formatoTiempo,
  mover,
  normalizarClips,
  nuevoClip,
  validar,
  type Clip,
} from "@/lib/linea-tiempo";
import { anotar, deshacer, rehacer } from "@/lib/historial";
import LineaTiempo from "./linea-tiempo";
import Director from "./director";
import {
  aplicarAcciones,
  costoDe,
  resumenProyecto,
  textoCosto,
  validarAcciones,
  type Ajustes,
  type Catalogo,
  type Estado,
  type Pendiente,
  type Resultado,
} from "@/lib/director";
import { firmaTomas, terminado, textoEstado, type TrabajoVisto } from "@/lib/estados-video";
import { consultarTomas, pedirTomas, prepararFoto, subirFoto } from "@/lib/video-ia-cliente";

import { Clapperboard, Dices, Download, Eye, Mic, Play, Redo2, Sparkles, Square, Undo2 } from "lucide-react";
// Cada clip guarda su foto en el dispositivo (IndexedDB) con imageId, para que no se pierda
// al cambiar de sección, editar, cerrar o recargar la app. El modelo está en lib/linea-tiempo.ts.

// Tomas con IA que siguen en proceso (se guardan para retomarlas sin pedirlas ni descontarlas otra vez)
type TomasPendientes = { ids: string[]; firma: string } | null;
const ESPERA_TOMAS = 5000; // cada cuánto se consulta
const MAX_ESPERA = 20 * 60 * 1000;

// Los 4 clips vacíos con los que se empieza (ids fijos: igual en el servidor y en el navegador)
const clipsIniciales = (): Clip[] => Array.from({ length: 4 }, (_, i) => nuevoClip({ id: `inicial-${i}` }));
// ¿Lo guardado ya tiene la forma nueva? (las escenas de antes no traían id, tipo ni duración)
const esClip = (c: unknown): c is Clip =>
  !!c && typeof c === "object" && typeof (c as Clip).id === "string" && !!(c as Clip).tipo && typeof (c as Clip).segundos === "number";

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
  const [format, setFormat] = usePersistentState<ReelFormat>("reel:formato", "9:16");
  const [guardados, setClips] = usePersistentState<Clip[]>(
    "reel:escenas-datos",
    clipsIniciales(),
    undefined,
    // Las fotos van al almacenamiento del dispositivo (IndexedDB); aquí solo se guarda su id y los textos.
    (s) => s.map((sc) => ({ ...sc, image: sc.imageId || !sc.image.startsWith("data:") ? (sc.imageId ? "" : sc.image) : "", loading: false }))
  );
  // Segundos por escena de antes del editor: solo sirve para dar duración a un borrador viejo
  const [segundosViejos] = usePersistentState("reel:segundos", 3);
  // Un borrador de antes del editor (escenas sin id ni duración) se convierte a clips una sola vez
  const clips = useMemo(
    () => (Array.isArray(guardados) && guardados.length > 0 && guardados.every(esClip) ? guardados : normalizarClips(guardados, segundosViejos)),
    [guardados, segundosViejos]
  );
  useEffect(() => {
    if (clips !== guardados) setClips(clips);
  }, [clips, guardados, setClips]);
  // Siempre la lista más reciente, también dentro de tareas que tardan (subir foto, crear imagen)
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const [elegido, setElegido] = useState(-1);

  // id guardado → foto que tiene (para saber si cambió)
  const savedImages = useRef(new Map<string, string>());
  const restored = useRef(false);

  // Deshacer y rehacer (solo en memoria, hasta 50 pasos)
  const hist = useRef<{ pasado: Clip[][]; futuro: Clip[][] }>({ pasado: [], futuro: [] });
  const [pasos, setPasos] = useState({ atras: 0, adelante: 0 });
  const ultimaEdicion = useRef({ llave: "", t: 0 });
  const poner = (lista: Clip[]) => {
    clipsRef.current = lista;
    setClips(lista);
  };
  // Cambio interno (el «Creando…», el id de la foto guardada): no cuenta como paso para deshacer
  const interno = (fn: (c: Clip[]) => Clip[]) => poner(fn(clipsRef.current));
  // Cambio hecho por la persona: se puede deshacer. Con `llave`, los cambios seguidos del mismo
  // campo (escribir un texto, arrastrar la duración) cuentan como un solo paso.
  function editar(fn: (c: Clip[]) => Clip[], llave = "") {
    const antes = clipsRef.current;
    const nuevo = fn(antes);
    if (nuevo === antes) return;
    const ahora = Date.now();
    const junta = !!llave && ultimaEdicion.current.llave === llave && ahora - ultimaEdicion.current.t < 1500;
    ultimaEdicion.current = { llave, t: ahora };
    if (!junta) hist.current = { pasado: anotar({ pasado: hist.current.pasado, presente: antes, futuro: [] }, nuevo).pasado, futuro: [] };
    else hist.current = { pasado: hist.current.pasado, futuro: [] };
    setPasos({ atras: hist.current.pasado.length, adelante: 0 });
    poner(nuevo);
  }
  // Al volver a un paso anterior: cada clip recupera su foto guardada (o se vuelve a guardar si ya se borró)
  function reconciliar(lista: Clip[]): Clip[] {
    const usados = new Set<string>();
    return lista.map((c) => {
      const limpio: Clip = { ...c, loading: false };
      if (!c.image) return limpio;
      let id = c.imageId && savedImages.current.get(c.imageId) === c.image ? c.imageId : undefined;
      if (!id) for (const [k, v] of savedImages.current) if (v === c.image && !usados.has(k)) id = k;
      if (id && usados.has(id)) id = undefined;
      if (id) usados.add(id);
      // Una foto que llegó por enlace y sigue igual conserva su id aunque no esté en la lista de esta sesión
      if (!id && c.imageId && !savedImages.current.has(c.imageId) && !c.image.startsWith("data:") && !borradas.current.has(c.imageId)) id = c.imageId;
      if (id) limpio.imageId = id;
      else delete limpio.imageId;
      return limpio;
    });
  }
  const borradas = useRef(new Set<string>()); // fotos guardadas que ya se quitaron del dispositivo
  function pasoHistorial(fn: typeof deshacer) {
    const h = fn({ pasado: hist.current.pasado, presente: clipsRef.current, futuro: hist.current.futuro });
    if (h.presente === clipsRef.current) return;
    hist.current = { pasado: h.pasado, futuro: h.futuro };
    ultimaEdicion.current = { llave: "", t: 0 };
    setPasos({ atras: h.pasado.length, adelante: h.futuro.length });
    const lista = reconciliar(h.presente);
    poner(lista);
    setElegido((e) => Math.min(e, lista.length - 1));
  }
  // Quita del dispositivo la foto guardada de un clip (si se deshace, se vuelve a guardar sola)
  function olvidarFoto(id?: string) {
    if (!id) return;
    savedImages.current.delete(id);
    borradas.current.add(id);
    deleteFile(id).catch(() => {});
  }

  // Al abrir la app: recuperar las fotos de los clips desde el dispositivo.
  useEffect(() => {
    if (restored.current) return;
    const missing = clips.filter((sc) => sc.imageId && !sc.image);
    const t = setTimeout(async () => {
      restored.current = true;
      for (const sc of missing) {
        const blob = await getFile(sc.imageId!).catch(() => null);
        if (!blob) continue;
        const url = await blobToDataUrl(blob);
        savedImages.current.set(sc.imageId!, url);
        interno((all) => all.map((x) => (x.imageId === sc.imageId && !x.image ? { ...x, image: url } : x)));
      }
    }, 400); // espera a que se cargue el borrador guardado
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  // Cada foto nueva o cambiada se guarda en el dispositivo.
  useEffect(() => {
    if (!restored.current) return;
    clips.forEach((sc) => {
      if (!sc.image) return;
      if (sc.imageId && savedImages.current.get(sc.imageId) === sc.image) return;
      if (sc.imageId && !savedImages.current.has(sc.imageId) && !sc.image.startsWith("data:")) return;
      const old = sc.imageId;
      const id = `reel-${Math.random().toString(36).slice(2, 10)}`;
      savedImages.current.set(id, sc.image);
      interno((all) => all.map((x) => (x.id === sc.id && x.image === sc.image ? { ...x, imageId: id } : x)));
      (async () => {
        const blob = await toBlob(sc.image);
        if (blob) await putFile(id, blob).catch(() => {});
        // La foto anterior se borra solo si ningún otro clip la sigue usando
        if (old && !clipsRef.current.some((x) => x.imageId === old)) olvidarFoto(old);
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);
  const [pendientes, setPendientes] = usePersistentState<TomasPendientes>("reel:tomas-pendientes", null);
  const [estadoIa, setEstadoIa] = useState("");
  const [invitarPlan, setInvitarPlan] = useState(false);
  const subidas = useRef(new Map<string, string>()); // sha256 → llave de la foto ya subida
  // Voces ya generadas en esta sesión (voz + guion → audio): cambiar entre ellas es al instante y no gasta
  const vocesHechas = useRef(new Map<string, string>());
  // Los clips de IA del último video: para volver a grabarlo (otra voz, música o texto) sin pedirlos de nuevo
  const ultimosClips = useRef<{ firma: string; clips: (string | null)[]; cuando: number } | null>(null);
  const [vozCambio, setVozCambio] = useState(false);
  const { activo: cuentasOn, cuenta, abrirPlanes } = useCuenta();
  const conCuenta = cuentasOn && !!cuenta?.usuario;
  const esDemo = !!cuenta?.usuario && cuenta.efectivo.plan === "prueba";
  const tomasMarcadas = clips.filter((s) => s.image && s.tipo === "toma").length;
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
    const t = setTimeout(() => setClips((s) => s.map((sc) => (sc.loading ? { ...sc, loading: false } : sc))), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Imagen enviada desde «Animar en video»: va al primer clip libre (o a uno nuevo al final).
  useEffect(() => {
    if (!handoff) return;
    setClips((s) => {
      const free = s.findIndex((sc) => !sc.image);
      if (free < 0) return [...s, nuevoClip({ image: handoff.url })];
      return s.map((sc, j) => (j === free ? { ...sc, image: handoff.url, loading: false } : sc));
    });
  }, [handoff, setClips]);
  useEffect(() => setBrandName((b) => b || brand.name), [brand.name]);
  // Al salir del Creador de Reels ya no hay demo a la vista
  useEffect(() => () => marcarDemoALaVista(false), []);
  // Tema enviado desde el calendario de contenido
  useEffect(() => {
    if (incomingTopic) setTopic(incomingTopic.text);
  }, [incomingTopic, setTopic]);
  // Escena que vuelve del editor
  useEffect(() => {
    if (!sceneUpdate) return;
    setClips((s) => s.map((sc, j) => (j === sceneUpdate.scene ? { ...sc, image: sceneUpdate.url, loading: false } : sc)));
  }, [sceneUpdate, setClips]);

  const canRecord = typeof window === "undefined" ? true : supportedRecording() !== null;
  const galleryImages = gallery.filter((g) => g.kind === "imagen");
  const cfHeaders = { "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken };

  // Cambia un clip por su id (sirve aunque se haya movido mientras se cargaba o creaba su foto)
  const porId = (id: string, cambios: Partial<Clip>) => (c: Clip[]) => cambiar(c, c.findIndex((x) => x.id === id), cambios);

  async function writeWithAi(): Promise<{ captions: string[]; imagePrompts: string[] } | null> {
    const res = await fetch("/api/text", {
      method: "POST",
      headers:
        settings.textProvider === "cloudflare"
          ? { "content-type": "application/json", ...cfHeaders }
          : { "content-type": "application/json", "x-anthropic-key": settings.anthropicKey },
      body: JSON.stringify({
        mode: "reel",
        scenes: clips.length,
        prompt: topic,
        brand: brandContext(brand),
        provider: settings.textProvider,
        model: settings.textProvider === "cloudflare" ? settings.cfTextModel : settings.textModel,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    editar((s) => s.map((sc, i) => ({ ...sc, caption: data.captions[i] ?? sc.caption, prompt: data.imagePrompts?.[i] ?? sc.prompt })));
    if (data.cta) setCta(data.cta);
    if (data.voiceover) setScript(data.voiceover);
    return data;
  }

  async function makeImage(id: string, promptText: string) {
    if (!promptText.trim()) throw new Error("Escribe primero el tema del reel o los textos.");
    interno(porId(id, { loading: true }));
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
      interno(porId(id, { loading: false }));
      editar(porId(id, { image: url }));
      onImages([{ kind: "imagen", url, prompt: promptText, date: new Date().toISOString() }]);
    } catch (e) {
      interno(porId(id, { loading: false }));
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
      // Solo crea imágenes para los clips que aún no tienen una.
      // De 3 en 3 para no saturar el límite gratuito de Cloudflare.
      const pending = clipsRef.current.map((sc, i) => ({ id: sc.id, i, vacio: !sc.image })).filter((x) => x.vacio);
      let failed: unknown = null;
      for (let k = 0; k < pending.length; k += 3) {
        const batch = pending.slice(k, k + 3);
        setBusy(`Creando imágenes ${k + 1}–${k + batch.length} de ${pending.length}…`);
        const results = await Promise.allSettled(
          batch.map((x) => makeImage(x.id, data.imagePrompts?.[x.i] || `${topic}, ${data.captions[x.i] || ""}`))
        );
        const bad = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        if (bad && !failed) failed = bad.reason;
      }
      if (failed) throw failed;
    });

  // Genera la voz (o la recupera al instante si esa voz ya se generó con ese mismo guion)
  async function generarVoz(id: string, texto: string) {
    if (!texto.trim()) throw new Error("Escribe el guion de la voz en off.");
    const voz = findVoice(id)?.lang === getLang() ? id : DEFAULT_VOICE[getLang()];
    const llave = `${voz}|${texto}`;
    let audio = vocesHechas.current.get(llave);
    if (!audio) {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", ...cfHeaders },
        body: JSON.stringify({ text: texto, lang: getLang(), voice: voz }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      audio = data.audio as string;
      vocesHechas.current.set(llave, audio);
    }
    setVoice(audio);
    if (result) setVozCambio(true);
  }
  const makeVoice = (id: string = voiceId) => run("Generando voz…", () => generarVoz(id, script));

  // Elegir otra voz: si ya había una voz generada, la nueva se genera sola con el mismo guion
  // (o se recupera al instante si ya se había generado antes).
  function elegirVoz(id: string) {
    setVoiceId(id);
    if (!voice) return;
    if (busy) return setVoice(""); // ocupado (grabando): se genera después con «Generar voz»
    void makeVoice(id);
  }

  // Lo que comparten grabar y la vista previa: las escenas con su duración, la marca, la voz y la música.
  function opcionesReel(lista: Clip[], clipsIa?: Record<string, string | null>): ReelOptions {
    return {
      escenas: aEscenas(lista, clipsIa),
      cierre: cierreDe(lista),
      format,
      accent,
      brandName,
      cta,
      logo: (useLogo && logo) || undefined,
      font: brand.font || undefined,
      voice: voice || undefined,
      subtitles: voice && subtitlesOn ? { script, highlight: accent } : null,
      music: musicOn ? { style: musicStyle, seed: musicSeed, volume: musicVolume, song: musicSource === "library" ? songId : undefined } : null,
    };
  }

  // Vista previa: se ve y se oye el video sin grabarlo (no gasta nada; las tomas con IA se ven con zoom).
  const [viendo, setViendo] = useState(false);
  const [estadoPrevia, setEstadoPrevia] = useState("");
  const previa = useRef<AbortController | null>(null);
  const lienzoPrevia = useRef<HTMLCanvasElement>(null);
  function detenerPrevia() {
    previa.current?.abort();
    previa.current = null;
    setViendo(false);
  }
  async function verPrevia() {
    const lista = clipsRef.current;
    const problema = validar(lista);
    if (problema) return setError(problema);
    setError("");
    stopListen();
    const control = new AbortController();
    previa.current = control;
    setViendo(true);
    setEstadoPrevia("Preparando la vista previa…");
    try {
      await vistaPrevia({ ...opcionesReel(lista), onStatus: setEstadoPrevia, previewCanvas: lienzoPrevia.current || undefined }, control.signal);
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      if (previa.current === control) {
        previa.current = null;
        setViendo(false);
      }
    }
  }
  // Al salir del Creador de Reels la vista previa se detiene
  useEffect(() => () => previa.current?.abort(), []);

  // Cuánto dura la voz: si es más larga que el video, se avisa y se ofrece alargar las fotos.
  const [vozSegundos, setVozSegundos] = useState(0);
  useEffect(() => {
    setVozSegundos(0);
    if (!voice) return;
    let vivo = true;
    (async () => {
      try {
        const bytes = await (await fetch(voice)).arrayBuffer();
        const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
        if (vivo) setVozSegundos(buf.duration);
      } catch {
        if (vivo) setVozSegundos(-1); // no se pudo medir: no hay aviso
      }
    })();
    return () => {
      vivo = false;
    };
  }, [voice]);
  const total = duracionTotal(clips);
  const segundosClips = total - cierreDe(clips);
  const vozLarga = vozSegundos > 0 && segundosClips > 0 && vozSegundos > segundosClips + 0.05;
  const repartidos = vozLarga ? ajustarAVoz(clips, vozSegundos) : clips;
  const sePuedeRepartir = repartidos.some((c, i) => c.segundos !== clips[i]?.segundos);

  // Graba el video. clipsIa: id del clip → su toma con IA ya generada (sin ella, la foto se anima con zoom).
  async function grabar(lista: Clip[], clipsIa?: Record<string, string | null>) {
    const problema = validar(lista);
    if (problema) throw new Error(problema);
    detenerPrevia();
    setResult(null);
    setProgress(0);
    if (result) URL.revokeObjectURL(result.url);
    const r = await renderReel({
      ...opcionesReel(lista, clipsIa),
      onStatus: (m) => setBusy(m || "Grabando tu reel…"),
      onProgress: setProgress,
      previewCanvas: preview.current || undefined,
    });
    setResult({ url: r.url, ext: r.ext, seconds: r.seconds });
    setVozCambio(false);
    onVideo(r.blob, `Reel: ${topic || brandName || "sin título"}`); // se guarda solo en la galería
  }

  const buildReel = () =>
    run("Grabando tu reel…", async () => {
      await grabar(clipsRef.current);
      if (tomasMarcadas > 0) setEstadoIa("Video listo sin IA: las fotos marcadas se ven con zoom.");
    });

  // Genera las tomas con IA (sube las fotos marcadas, espera los clips) y graba el video final.
  const generarConIa = () =>
    run("Preparando las tomas con IA…", async () => {
      const lista = clipsRef.current; // el video se arma con los clips tal como están al empezar
      const problema = validar(lista);
      if (problema) throw new Error(problema);
      const marcadas = lista.filter((c) => c.image && c.tipo === "toma");
      if (marcadas.length === 0) throw new Error("Marca de 1 a 4 fotos «con IA».");
      setInvitarPlan(false);
      if (esDemo) marcarDemoALaVista(true); // si la prueba vence mientras tanto, no se tapa el video
      const preparadas = await Promise.all(marcadas.map((m) => prepararFoto(m.image)));
      // Siempre en el mismo orden (por foto y movimiento): así mover los clips no vuelve a pedir ni a cobrar las tomas
      const llaveDe = (t: { foto: { sha256: string }; movimiento: string }) => `${t.foto.sha256}|${t.movimiento}`;
      const tomas = marcadas
        .map((m, k) => ({ clip: m, foto: preparadas[k], movimiento: m.movimiento ?? "" }))
        .sort((a, b) => (llaveDe(a) < llaveDe(b) ? -1 : llaveDe(a) > llaveDe(b) ? 1 : 0));
      const firma = firmaTomas(tomas.map((t) => ({ sha256: t.foto.sha256, movimiento: t.movimiento })));
      const porClip = (urls: (string | null)[]) => Object.fromEntries(tomas.map((t, k) => [t.clip.id, urls[k] ?? null]));
      // Mismas fotos y movimientos que el último video (por ejemplo, solo cambió la voz o el orden):
      // se vuelve a grabar con los clips que ya se tienen, sin pedir nada ni gastar tomas.
      const previos = ultimosClips.current;
      if (previos && previos.firma === firma && Date.now() - previos.cuando < 50 * 60 * 1000) {
        setBusy("Grabando tu reel…");
        await grabar(lista, porClip(previos.clips));
        setEstadoIa(textoEstado({ tipo: "trabajos", trabajos: tomas.map((_, k) => ({ id: String(k), estado: "listo", desdeCache: true })), topeHoy: false }));
        return;
      }
      let ids = pendientes && pendientes.firma === firma ? pendientes.ids : null;
      if (!ids) {
        const llaves: string[] = [];
        for (const [k, t] of tomas.entries()) {
          let llave = subidas.current.get(t.foto.sha256);
          if (!llave) {
            llave = await subirFoto(t.foto, (pct) => setBusy(textoEstado({ tipo: "subiendo", pct: (k * 100 + pct) / tomas.length })));
            subidas.current.set(t.foto.sha256, llave);
          }
          llaves.push(llave);
        }
        ids = await pedirTomas(tomas.map((t, k) => ({ imagenKey: llaves[k], movimiento: t.movimiento })));
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
      const trabajos = new Map(vistos.map((t) => [t.id, t]));
      const urls = ids.map((id) => trabajos.get(id)?.clipUrl ?? null);
      // Solo se guardan si salieron todas: así un intento posterior vuelve a pedir la que falló
      if (urls.every(Boolean)) ultimosClips.current = { firma, clips: urls, cuando: Date.now() };
      setBusy("Grabando tu reel…");
      await grabar(lista, porClip(urls));
      setEstadoIa(textoEstado({ tipo: "trabajos", trabajos: vistos, topeHoy: false }));
      setInvitarPlan(esDemo);
    });

  // ---------- Director con IA: órdenes escritas o dictadas ----------
  const puedeVoz = usePuede("voz");
  const catalogo = useMemo<Catalogo>(
    () => ({ estilos: MUSIC_STYLES.map((e) => e.id), voces: VOICES.filter((v) => v.lang === getLang()).map((v) => ({ id: v.id, genero: v.gender })) }),
    []
  );
  // Orden ya entendida que espera el «Hacerlo» porque gasta imágenes o voz
  const [propuesta, setPropuesta] = useState<{ r: Resultado; mensaje: string; costo: string; sobre: Clip[] } | null>(null);
  const [resultadoDir, setResultadoDir] = useState<{ mensaje: string; hecho: string[]; avisos: string[] } | null>(null);
  // Cómo estaba el video antes de la última orden, para «Deshacer orden»
  const antesDeOrden = useRef<{ clips: Clip[]; ajustes: Ajustes; voice: string } | null>(null);
  const [hayDeshacerOrden, setHayDeshacerOrden] = useState(false);
  // Lo que la orden dejó por hacer (imágenes, voz) y cómo termina (vista previa o crear el video)
  const [cola, setCola] = useState<Pendiente[] | null>(null);
  const [alFinal, setAlFinal] = useState<"vista_previa" | "crear_video" | null>(null);
  const ajustarTrasVoz = useRef(false);

  const ajustesActuales = (): Ajustes => ({
    formato: format,
    negocio: brandName,
    cta,
    guion: script,
    vozId: voiceId,
    hayVoz: !!voice,
    subtitulos: subtitlesOn,
    musica: musicOn,
    estilo: musicStyle,
    volumen: musicVolume,
  });
  function ponerAjustes(a: Ajustes) {
    setFormat(a.formato);
    setBrandName(a.negocio);
    setCta(a.cta);
    setScript(a.guion);
    setVoiceId(a.vozId);
    setSubtitlesOn(a.subtitulos);
    setMusicOn(a.musica);
    setMusicVolume(a.volumen);
    if (a.estilo !== musicStyle) {
      // Un estilo pedido por orden es música compuesta por la app
      setMusicStyle(a.estilo as MusicStyleId);
      setMusicSeed(1);
      setMusicSource("generated");
    }
  }

  const enviarOrden = (orden: string) =>
    run("Pensando tu orden…", async () => {
      detenerPrevia();
      setResultadoDir(null);
      setPropuesta(null);
      const sobre = clipsRef.current;
      const estado: Estado = { clips: sobre, ajustes: ajustesActuales() };
      const res = await fetch("/api/text", {
        method: "POST",
        headers:
          settings.textProvider === "cloudflare"
            ? { "content-type": "application/json", ...cfHeaders }
            : { "content-type": "application/json", "x-anthropic-key": settings.anthropicKey },
        body: JSON.stringify({
          mode: "director",
          prompt: orden,
          estado: resumenProyecto(estado),
          catalogo: {
            estilos: MUSIC_STYLES.map((e) => ({ id: e.id, nombre: e.label })),
            voces: VOICES.filter((v) => v.lang === getLang()).map((v) => ({ id: v.id, nombre: v.name, genero: v.gender })),
          },
          brand: brandContext(brand),
          provider: settings.textProvider,
          model: settings.textProvider === "cloudflare" ? settings.cfTextModel : settings.textModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const mensaje = typeof data.mensaje === "string" ? data.mensaje : "";
      const { acciones } = validarAcciones(data, catalogo);
      if (acciones.length === 0) {
        // La IA explicó por qué no puede: se muestra su mensaje y el video no cambia
        if (!mensaje) throw new Error("No entendí la orden. Dila de otra forma.");
        setHayDeshacerOrden(false);
        setResultadoDir({ mensaje, hecho: [], avisos: [] });
        return;
      }
      const r = aplicarAcciones(estado, acciones, catalogo, { voz: puedeVoz, ia: conCuenta });
      const costo = textoCosto(costoDe(r.pendientes));
      if (costo) setPropuesta({ r, mensaje, costo, sobre });
      else confirmarOrden({ r, mensaje, sobre });
    });

  function confirmarOrden(p: { r: Resultado; mensaje: string; sobre: Clip[] }) {
    setPropuesta(null);
    if (clipsRef.current !== p.sobre) return setError("Tu video cambió mientras esperaba tu respuesta. Envía la orden otra vez.");
    antesDeOrden.current = { clips: p.sobre, ajustes: ajustesActuales(), voice };
    setHayDeshacerOrden(true);
    editar(() => p.r.estado.clips);
    ponerAjustes(p.r.estado.ajustes);
    setElegido(-1);
    setResultadoDir({ mensaje: p.mensaje, hecho: p.r.hecho, avisos: p.r.avisos });
    if (p.r.pendientes.length) setCola(p.r.pendientes);
  }

  function deshacerOrden() {
    const a = antesDeOrden.current;
    if (!a) return;
    antesDeOrden.current = null;
    setHayDeshacerOrden(false);
    setCola(null);
    setAlFinal(null);
    ajustarTrasVoz.current = false;
    editar(() => reconciliar(a.clips));
    ponerAjustes(a.ajustes);
    setVoice(a.voice);
    setElegido(-1);
    setResultadoDir(null);
  }

  // Lo pendiente de la orden se hace cuando la app queda libre, ya con los ajustes nuevos puestos
  useEffect(() => {
    if (!cola || busy || viendo) return;
    const pendientes = cola;
    setCola(null);
    void run("Haciendo lo que pediste…", async () => {
      const fallas: string[] = [];
      const falla = (e: unknown) => {
        const m = friendlyError((e as Error).message);
        if (!fallas.includes(m)) fallas.push(m);
      };
      // Imágenes de 3 en 3 para no saturar el límite gratuito de Cloudflare
      const imagenes = pendientes.flatMap((p) => (p.tipo === "imagen" ? [p] : []));
      for (let k = 0; k < imagenes.length; k += 3) {
        const lote = imagenes.slice(k, k + 3);
        setBusy(`Creando imágenes ${k + 1}–${k + lote.length} de ${imagenes.length}…`);
        const rs = await Promise.allSettled(lote.map((p) => makeImage(p.clipId, p.descripcion)));
        rs.forEach((x) => x.status === "rejected" && falla(x.reason));
      }
      for (const p of pendientes) {
        if (p.tipo === "quitar_voz") setVoice("");
        if (p.tipo === "voz") {
          setBusy("Generando voz…");
          try {
            await generarVoz(voiceId, script);
            ajustarTrasVoz.current = p.ajustarFotos;
          } catch (e) {
            falla(e);
          }
        }
      }
      if (fallas.length) setResultadoDir((r) => (r ? { ...r, avisos: [...r.avisos, ...fallas] } : r));
      const fin = pendientes.find((p) => p.tipo === "vista_previa" || p.tipo === "crear_video");
      if (fin) setAlFinal(fin.tipo as "vista_previa" | "crear_video");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cola, busy, viendo]);

  // Al armar un video, cuando se conoce cuánto dura la voz, las fotos se reparten para cubrirla
  useEffect(() => {
    if (!ajustarTrasVoz.current || vozSegundos <= 0) return;
    ajustarTrasVoz.current = false;
    editar((c) => ajustarAVoz(c, vozSegundos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vozSegundos]);

  // «Muéstrame la vista previa» o «crea el video»: al final, con todo ya en su lugar
  useEffect(() => {
    if (!alFinal || busy || viendo || cola) return;
    if (voice && vozSegundos === 0) return; // falta medir la voz recién generada
    const que = alFinal;
    setAlFinal(null);
    if (que === "vista_previa") void verPrevia();
    else void buildReel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alFinal, busy, viendo, cola, voice, vozSegundos]);

  // Lo que se hace con los clips desde la línea de tiempo
  const alMover = (de: number, a: number) => {
    editar((c) => mover(c, de, a));
    setElegido(a);
  };
  const alDuplicar = (i: number) => {
    editar((c) => duplicar(c, i));
    setElegido(i + 1);
  };
  const alBorrar = (i: number) => {
    const id = clipsRef.current[i]?.imageId;
    editar((c) => borrar(c, i));
    if (id && !clipsRef.current.some((x) => x.imageId === id)) olvidarFoto(id);
    setElegido(Math.min(i, clipsRef.current.length - 1));
    setPicking(null);
  };
  const alCambiar = (i: number, cambios: Partial<Clip>) => {
    const campo = Object.keys(cambios).join(",");
    // Escribir o arrastrar la duración: varios cambios seguidos cuentan como un solo paso
    const seguido = campo === "caption" || campo === "movimiento" || campo === "segundos";
    editar((c) => cambiar(c, i, cambios), seguido ? `${clipsRef.current[i]?.id}:${campo}` : "");
  };
  const alAgregar = () => {
    editar((c) => [...c, nuevoClip()]);
    setElegido(clipsRef.current.length - 1);
  };

  // La foto del clip elegido y sus botones
  const panelImagen = (i: number) => {
    const sc = clips[i];
    if (!sc) return null;
    return (
      <>
        <div className="scene-img" style={{ aspectRatio: ratioStyle }}>
          {sc.loading ? <span className="muted">Creando…</span> : sc.image ? <img src={sc.image} alt={`Escena ${i + 1}`} /> : <span className="muted">Sin foto todavía</span>}
        </div>
        <div className="actions">
          <label className="btn ghost small" style={{ margin: 0 }}>
            Subir foto
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) run("Cargando foto…", async () => editar(porId(sc.id, { image: await fileToResizedDataUrl(f, 1280) })));
              }}
            />
          </label>
          <button className="btn ghost small" onClick={() => setPicking(picking === i ? null : i)}>
            Galería
          </button>
          <button
            className="btn ghost small"
            disabled={!!busy || sc.loading}
            onClick={() => run("Creando imagen…", () => makeImage(sc.id, sc.prompt || `${topic}, ${sc.caption}, advertising photography`))}
          >
            Crear con IA
          </button>
          {sc.image && (
            <button className="btn small" onClick={() => onEditScene(i, sc.image)}>
              Editar
            </button>
          )}
          {sc.image && (
            <button
              className="btn ghost small"
              onClick={() => {
                editar(porId(sc.id, { image: "", imageId: undefined }));
                olvidarFoto(sc.imageId);
              }}
            >
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
                onClick={async () => {
                  const image = await toDataUrl(g.url);
                  editar(porId(sc.id, { image }));
                  setPicking(null);
                }}
              />
            ))}
          </div>
        )}
      </>
    );
  };

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
            detenerPrevia();
            clips.forEach((sc) => olvidarFoto(sc.imageId));
            poner(clipsIniciales().map((c) => nuevoClip({ ...c, id: "" })));
            hist.current = { pasado: [], futuro: [] };
            setPasos({ atras: 0, adelante: 0 });
            setElegido(-1);
            setCta("");
            setScript("");
            setVoice("");
            setResult(null);
            setError("");
            setEstadoIa("");
            setVozCambio(false);
            ultimosClips.current = null;
            setInvitarPlan(false);
            setPendientes(null);
            setPropuesta(null);
            setResultadoDir(null);
            setCola(null);
            setAlFinal(null);
            antesDeOrden.current = null;
            setHayDeshacerOrden(false);
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

      <Director
        ocupado={!!busy}
        cfHeaders={cfHeaders}
        onEnviar={enviarOrden}
        confirmar={propuesta ? { texto: propuesta.costo, onSi: () => confirmarOrden(propuesta), onNo: () => setPropuesta(null) } : null}
        resultado={resultadoDir}
        onDeshacer={hayDeshacerOrden ? deshacerOrden : null}
      />

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
          <label>Formato</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as ReelFormat)}>
            <option value="9:16">Vertical 9:16 (Reels, TikTok, Historias)</option>
            <option value="1:1">Cuadrado 1:1 (feed)</option>
            <option value="16:9">Horizontal 16:9 (YouTube, web)</option>
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
        «Crear todo» escribe los textos, el cierre y el guion de voz, y crea una imagen para cada clip vacío. Si quieres más escenas, agrega clips abajo antes de tocarlo.
      </p>

      {/* 2. Escenas: la línea de tiempo */}
      <h3 className="step">2. Escenas</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Cada clip es una foto de tu video. Toca uno para cambiar su foto, su texto y cuánto dura; muévelo con «Antes» y «Después» (en computadora también puedes arrastrarlo).
      </p>
      <div className="lt-barra">
        <span className={`lt-tiempo${total > MAX_VIDEO ? " pasado" : ""}`} data-no-translate aria-label={`${formatoTiempo(total)} / ${formatoTiempo(MAX_VIDEO)}`}>
          {formatoTiempo(total)} / {formatoTiempo(MAX_VIDEO)}
        </span>
        <button className="btn ghost small" disabled={!!busy || pasos.atras === 0} onClick={() => pasoHistorial(deshacer)}>
          <Undo2 size={15} aria-hidden /> Deshacer
        </button>
        <button className="btn ghost small" disabled={!!busy || pasos.adelante === 0} onClick={() => pasoHistorial(rehacer)}>
          <Redo2 size={15} aria-hidden /> Rehacer
        </button>
        {viendo ? (
          <button className="btn small" onClick={detenerPrevia}>
            <Square size={14} aria-hidden /> Detener
          </button>
        ) : (
          <button className="btn small" disabled={!!busy || !clips.some((s) => s.image)} onClick={verPrevia}>
            <Eye size={15} aria-hidden /> Vista previa
          </button>
        )}
      </div>
      {total > MAX_VIDEO && <div className="error">{validar(clips)}</div>}
      <LineaTiempo
        clips={clips}
        elegido={elegido}
        onElegir={(i) => (setElegido(i), setPicking(null))}
        onMover={alMover}
        onDuplicar={alDuplicar}
        onBorrar={alBorrar}
        onCambiar={alCambiar}
        onAgregar={alAgregar}
        conIa={conCuenta}
        tomasMarcadas={tomasMarcadas}
        ocupado={!!busy}
        panelImagen={panelImagen}
      />
      {vozLarga && (
        <div className="acct-upsell">
          <span>
            {`La voz dura ${formatoTiempo(vozSegundos)} y tus clips ${formatoTiempo(segundosClips)}: la voz se cortaría.`}
            {!sePuedeRepartir && " Agrega más fotos para cubrirla."}
          </span>
          {sePuedeRepartir && (
            <button className="btn small" disabled={!!busy} onClick={() => editar(() => repartidos)}>
              Repartir las fotos para cubrir la voz
            </button>
          )}
        </div>
      )}
      <div className="reel-output" style={{ display: viendo ? "flex" : "none" }}>
        <canvas ref={lienzoPrevia} className="reel-canvas" style={{ aspectRatio: ratioStyle }} aria-label="Vista previa del video" />
        {estadoPrevia && <span className="muted">{estadoPrevia}</span>}
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
      <VoicePicker value={voiceId} onChange={elegirVoz} headers={cfHeaders} />
      <p className="hint" style={{ marginTop: 6 }}>
        Para que suene más natural, escribe como hablas: usa comas para las pausas, puntos para respirar y signos de ¡exclamación! o ¿pregunta? para dar emoción.
      </p>
      <div className="actions" style={{ alignItems: "center" }}>
        <button className="btn ghost small" disabled={!!busy || !script.trim()} onClick={() => makeVoice()}>
          <Mic size={16} aria-hidden /> Generar voz
        </button>
        {voice && (
          <>
            <audio src={voice} controls style={{ height: 36, marginTop: 8 }} />
            <button className="btn ghost small" onClick={() => (setVoice(""), result && setVozCambio(true))}>
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
Si la voz dura más que el video, te avisamos en el paso 2 para alargar las fotos. Si cambias el guion, vuelve a generar la voz para que los subtítulos coincidan.
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
Crear el reel sin IA es gratis: las fotos marcadas con IA se ven con zoom hasta que las generes. Solo «Generar con IA» usa tus tomas con IA.
        </p>
      )}
      <div className="actions">
        <button className="btn" disabled={!!busy || viendo || !canRecord || !clips.some((s) => s.image)} onClick={buildReel}>
          <Clapperboard size={16} aria-hidden /> {tomasMarcadas > 0 ? "Crear reel sin IA (gratis)" : "Crear reel"}
        </button>
        {conCuenta && tomasMarcadas > 0 && (
          <button className="btn" disabled={!!busy || viendo || !canRecord} onClick={generarConIa}>
            <Sparkles size={16} aria-hidden /> Generar con IA
            {esDemo && <span className="acct-pro">Demo gratis</span>}
          </button>
        )}
      </div>
      {!busy && vozCambio && (
        <div className="acct-upsell">
          <span>Cambiaste la voz. Actualiza el video para escucharla: no gasta tomas con IA.</span>
          <button className="btn small" disabled={!canRecord} onClick={conCuenta && tomasMarcadas > 0 ? generarConIa : buildReel}>
            Actualizar video
          </button>
        </div>
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
