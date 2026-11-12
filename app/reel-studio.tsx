"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brand, brandAccent, brandContext, brandVisual } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { fileToResizedDataUrl } from "@/lib/resize";
import { ReelFormat, ReelOptions, renderReel, supportedRecording, vistaPrevia } from "@/lib/reel";
import type { Item, Settings } from "@/lib/types";
import { clearDrafts, usePersistentState } from "@/lib/persist";
import { deleteFile, getFile, putFile, toBlob, toDataUrl } from "@/lib/media-store";
import { AVISO_SIN_ESPACIO, guardarConfirmado } from "@/lib/guardado";

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
  clipDeVideo,
  dividir,
  duplicar,
  duracionTotal,
  efectosDe,
  formatoTiempo,
  mover,
  normalizarClips,
  nuevoClip,
  ponerToma,
  ponerEnLibre,
  descartaToma,
  sinFuente,
  presente,
  quitarToma,
  recortar,
  rehacerToma,
  sustituir,
  tomasDistintas,
  transicionATodos,
  transicionesAlAzar,
  validar,
  volverAnterior,
  type Clip,
} from "@/lib/linea-tiempo";
import { abrirVideo, guardarVideo, idDeArchivo, leerVideo, limpiarHuerfanos, revisarArchivo } from "@/lib/video-propio";
import CamaraVideo from "./camara-video";
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
import { terminado, textoEstado, type TrabajoVisto } from "@/lib/estados-video";
import { consultarTomas, pedirTomas, prepararFoto, subirFoto } from "@/lib/video-ia-cliente";

import { Clapperboard, Dices, Download, Eye, Mic, Play, Redo2, Sparkles, Square, Undo2, Video } from "lucide-react";
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
  videosDeOtros = [],
  onOcupado,
}: {
  videosDeOtros?: string[]; // videos subidos que usan otros proyectos guardados: no se borran al limpiar
  onOcupado?: (ocupado: boolean) => void; // avisa cuando está grabando o generando (para no cambiar de proyecto a medias)
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
  // Videos propios: archivoId → enlace local para verlo y grabarlo (null = el archivo ya no está en este dispositivo)
  const [urlsVideo, setUrlsVideo] = useState<Record<string, string | null>>({});
  const urlsRef = useRef(urlsVideo);
  urlsRef.current = urlsVideo;
  useEffect(() => {
    const faltan = [...new Set(clips.flatMap((c) => (c.tipo === "video" && c.archivoId && !(c.archivoId in urlsRef.current) ? [c.archivoId] : [])))];
    if (faltan.length === 0) return;
    let vivo = true;
    (async () => {
      for (const id of faltan) {
        const blob = await abrirVideo(id);
        if (!vivo) return;
        if (id in urlsRef.current) continue;
        // El enlace se crea una sola vez, fuera del cambio de estado (React puede repetir esa función)
        const enlace = blob ? URL.createObjectURL(blob) : null;
        setUrlsVideo((u) => {
          if (!(id in u)) return { ...u, [id]: enlace };
          if (enlace) URL.revokeObjectURL(enlace);
          return u;
        });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clips]);
  // Al salir se sueltan los enlaces locales
  useEffect(() => () => Object.values(urlsRef.current).forEach((u) => u && URL.revokeObjectURL(u)), []);
  const [volVoz, setVolVoz] = usePersistentState("reel:vol-voz", 1);
  const [volClips, setVolClips] = usePersistentState("reel:vol-clips", 1);

  // id guardado → foto que tiene (para saber si cambió)
  const savedImages = useRef(new Map<string, string>());
  const restored = useRef(false);
  const [recuperado, setRecuperado] = useState(false); // ya se recuperaron las fotos guardadas
  const [avisosVideo, setAvisosVideo] = useState<string[]>([]); // lo que no salió como se pidió en el último video
  const [sinEspacio, setSinEspacio] = useState(false); // un guardado en el dispositivo no entró
  const guardando = useRef(new Map<string, string>()); // id del clip → foto que se está guardando
  const noGuardadas = useRef(new Map<string, string>()); // id del clip → foto que no se pudo guardar (no se reintenta sola)

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
        if (!blob) {
          // El archivo ya no está en el dispositivo: el clip queda vacío de verdad (y libre para otra foto)
          interno((all) => all.map((x) => (x.imageId === sc.imageId && !x.image ? { ...x, imageId: undefined } : x)));
          continue;
        }
        const url = await blobToDataUrl(blob);
        savedImages.current.set(sc.imageId!, url);
        interno((all) => all.map((x) => (x.imageId === sc.imageId && !x.image ? { ...x, image: url } : x)));
      }
      // Los videos subidos que ya no usa ningún clip se borran del dispositivo (al abrir no hay nada que deshacer)
      void limpiarHuerfanos([...clipsRef.current.flatMap((c) => (c.archivoId ? [c.archivoId] : [])), ...videosDeOtros]);
      setRecuperado(true); // lo que llegó mientras tanto (una imagen enviada desde otra sección) ya se puede guardar
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
      if (guardando.current.get(sc.id) === sc.image || noGuardadas.current.get(sc.id) === sc.image) return;
      const old = sc.imageId;
      const imagen = sc.image;
      const id = `reel-${Math.random().toString(36).slice(2, 10)}`;
      guardando.current.set(sc.id, imagen);
      (async () => {
        // Primero se escribe. Solo si quedó guardada, el clip apunta a la foto nueva y se borra la anterior.
        const r = await guardarConfirmado({
          id,
          blob: await toBlob(imagen).catch(() => null),
          poner: putFile,
          quitar: deleteFile,
          vigente: () => clipsRef.current.some((x) => x.id === sc.id && x.image === imagen),
        });
        if (guardando.current.get(sc.id) === imagen) guardando.current.delete(sc.id);
        if (r === "fallo") {
          noGuardadas.current.set(sc.id, imagen);
          setSinEspacio(true);
          return;
        }
        if (r !== "ok") return;
        noGuardadas.current.delete(sc.id);
        savedImages.current.set(id, imagen);
        interno((all) => all.map((x) => (x.id === sc.id && x.image === imagen ? { ...x, imageId: id } : x)));
        // La foto anterior se borra solo si ningún otro clip la sigue usando
        if (old && !clipsRef.current.some((x) => x.imageId === old)) olvidarFoto(old);
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, recuperado]);
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
  const [musicSource, setMusicSource] = usePersistentState<"generated" | "library" | "propia">("reel:musica-fuente", "generated");
  // Canción propia: se guarda en el dispositivo y se usa como música de fondo
  const [cancionPropia, setCancionPropia] = usePersistentState<{ id: string; nombre: string } | null>("reel:cancion-propia", null);
  const [urlCancion, setUrlCancion] = useState("");
  useEffect(() => {
    if (!cancionPropia?.id) return setUrlCancion("");
    let vivo = true;
    let enlace = "";
    (async () => {
      const blob = await getFile(cancionPropia.id).catch(() => null);
      if (!vivo) return;
      if (!blob) return setCancionPropia(null); // ya no está en este dispositivo
      enlace = URL.createObjectURL(blob);
      setUrlCancion(enlace);
    })();
    return () => {
      vivo = false;
      if (enlace) URL.revokeObjectURL(enlace);
    };
  }, [cancionPropia, setCancionPropia]);
  const subirCancion = (f: File) =>
    run("Guardando tu canción…", async () => {
      if (f.size > 25 * 1024 * 1024) throw new Error("Esa canción pesa más de 25 MB.");
      // Se comprueba que el navegador la puede abrir antes de guardarla
      await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await f.arrayBuffer()).catch(() => {
        throw new Error("Ese archivo de audio no se puede abrir en tu navegador.");
      });
      const id = `reelsong-${Math.random().toString(36).slice(2, 10)}`;
      await putFile(id, f);
      if (cancionPropia?.id) deleteFile(cancionPropia.id).catch(() => {});
      setCancionPropia({ id, nombre: f.name.slice(0, 60) });
      setMusicSource("propia");
      setMusicOn(true);
    });
  const conCancionPropia = musicSource === "propia" && !!urlCancion;
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
  // La voz generada se guarda en el dispositivo: al recargar no hay que generarla (ni pagarla) otra vez
  const [vozArchivo, setVozArchivo] = usePersistentState<{ id: string } | null>("reel:voz-archivo", null);
  const vozLista = useRef(false); // ya se intentó recuperar la voz guardada
  const vozGuardada = useRef(""); // el audio que corresponde al archivo guardado
  useEffect(() => {
    if (vozLista.current) return;
    const t = setTimeout(async () => {
      vozLista.current = true;
      if (!vozArchivo?.id) return;
      const blob = await getFile(vozArchivo.id).catch(() => null);
      if (!blob) return setVozArchivo(null);
      const audio = await blobToDataUrl(blob);
      vozGuardada.current = audio;
      setVoice((v) => v || audio);
    }, 400); // espera a que se cargue el borrador guardado
    return () => clearTimeout(t);
  }, [vozArchivo, setVozArchivo]);
  useEffect(() => {
    if (!vozLista.current || voice === vozGuardada.current) return;
    const anterior = vozArchivo?.id;
    vozGuardada.current = voice;
    if (!voice) {
      setVozArchivo(null);
      if (anterior) deleteFile(anterior).catch(() => {});
      return;
    }
    const id = `reelvoz-${Math.random().toString(36).slice(2, 10)}`;
    const audio = voice;
    (async () => {
      // Primero se escribe; solo si quedó guardada se apunta a ella
      const r = await guardarConfirmado({
        id,
        blob: await toBlob(audio).catch(() => null),
        poner: putFile,
        quitar: deleteFile,
        vigente: () => vozGuardada.current === audio,
      });
      if (r === "cambio") return; // ya hay otra voz: esa se guarda por su cuenta
      // La voz anterior ya no es la del video: su archivo se quita en cualquier caso
      if (anterior) deleteFile(anterior).catch(() => {});
      if (r === "ok") return setVozArchivo({ id });
      setVozArchivo(null);
      setSinEspacio(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice]);
  const [voiceId, setVoiceId] = usePersistentState<string>("reel:voz", DEFAULT_VOICE[getLang()]);
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; ext: string; seconds: number } | null>(null);
  const [error, setError] = useState("");
  const preview = useRef<HTMLCanvasElement>(null);

  // Portada: un cuadro del video terminado, para descargarlo como imagen
  const videoFinal = useRef<HTMLVideoElement>(null);
  const salida = useRef<HTMLDivElement>(null);
  // Al empezar a grabar y al terminar, la pantalla baja a donde se ve el video
  const aLaVista = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: "smooth", block: "center" });
  const [momentoPortada, setMomentoPortada] = useState(0);
  function descargarPortada() {
    const v = videoFinal.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/jpeg", 0.92);
    a.download = "portada-innovationtech.jpg";
    a.click();
  }

  useEffect(() => {
    // Si la app se cerró mientras se creaba una imagen, quitamos el «Creando…».
    const t = setTimeout(() => setClips((s) => s.map((sc) => (sc.loading ? { ...sc, loading: false } : sc))), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Imagen enviada desde «Animar en video»: va al primer clip libre (o a uno nuevo al final).
  useEffect(() => {
    if (!handoff) return;
    setClips((s) => ponerEnLibre(s, handoff.url));
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
      const pending = clipsRef.current.map((sc, i) => ({ id: sc.id, i, vacio: !presente(sc) })).filter((x) => x.vacio);
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
      escenas: aEscenas(lista, { tomas: clipsIa, videos: urlsVideo }),
      volumenes: { voz: volVoz, clips: volClips },
      cierre: cierreDe(lista),
      format,
      accent,
      brandName,
      cta,
      logo: (useLogo && logo) || undefined,
      font: brand.font || undefined,
      voice: voice || undefined,
      subtitles: voice && subtitlesOn ? { script, highlight: accent } : null,
      // Con «Mi canción» elegida pero sin archivo, se usa la música compuesta por la app
      music: musicOn ? { style: musicStyle, seed: musicSeed, volume: musicVolume, song: musicSource === "library" ? songId : undefined, propia: conCancionPropia ? urlCancion : undefined } : null,
      efectos: efectosDe(lista),
    };
  }
  const opcionesAhora = useRef(opcionesReel);
  opcionesAhora.current = opcionesReel;

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
    setTimeout(() => aLaVista(lienzoPrevia.current), 50);
    try {
      const tomas = await fuentesTomas(lista);
      if (control.signal.aborted) return;
      await vistaPrevia({ ...opcionesReel(lista, tomas), onStatus: setEstadoPrevia, previewCanvas: lienzoPrevia.current || undefined }, control.signal);
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

  // ---------- Tomas con IA por clip ----------
  // Cada clip animado guarda el id de su toma (trabajoId): así se puede retomar, duplicar y volver a
  // grabar sin pedirla ni cobrarla de nuevo. Los enlaces de los clips caducan en 1 hora: se piden frescos.
  const enlacesToma = useRef(new Map<string, { url: string; cuando: number }>());
  const [estadoToma, setEstadoToma] = useState<Record<string, string>>({}); // id del clip → qué está pasando
  const [animando, setAnimando] = useState<string[]>([]); // clips con una toma en camino
  // El mismo dato, pero al instante: dos toques seguidos no deben pedir (ni cobrar) dos tomas
  const animandoYa = useRef(new Set<string>());
  // Mientras se graba o se anima una toma no se cambia de proyecto ni se empieza otro
  useEffect(() => onOcupado?.(!!busy || animando.length > 0), [busy, animando, onOcupado]);

  // Consulta tomas y guarda el enlace de las que ya están listas
  async function verTomas(ids: string[]): Promise<{ vistos: TrabajoVisto[]; topeHoy: boolean }> {
    const vistos: TrabajoVisto[] = [];
    let topeHoy = false;
    // De 10 en 10: es lo que el servidor acepta por consulta
    for (let k = 0; k < ids.length; k += 10) {
      const r = await consultarTomas(ids.slice(k, k + 10));
      vistos.push(...r.trabajos);
      topeHoy = topeHoy || r.topeHoy;
    }
    for (const t of vistos) if (t.estado === "listo" && t.clipUrl) enlacesToma.current.set(t.id, { url: t.clipUrl, cuando: Date.now() });
    return { vistos, topeHoy };
  }

  // Las tomas ya generadas de una lista de clips, con enlace fresco: id del clip → enlace
  async function fuentesTomas(lista: Clip[]): Promise<Record<string, string | null>> {
    const conToma = lista.filter((c) => c.tipo === "toma" && c.image && c.trabajoId);
    if (conToma.length === 0 || !conCuenta) return {};
    const viejos = [...new Set(conToma.map((c) => c.trabajoId!))].filter((id) => {
      const e = enlacesToma.current.get(id);
      return !e || Date.now() - e.cuando > 45 * 60 * 1000;
    });
    if (viejos.length) await verTomas(viejos).catch(() => {}); // sin conexión: esas fotos se verán con zoom
    return Object.fromEntries(conToma.map((c) => [c.id, enlacesToma.current.get(c.trabajoId!)?.url ?? null]));
  }

  // Sube la foto (si hace falta) y pide una toma para ese clip. Devuelve el id de la toma.
  async function pedirTomaDe(c: Clip): Promise<string> {
    const f = await prepararFoto(c.image);
    let llave = subidas.current.get(f.sha256);
    if (!llave) {
      llave = await subirFoto(f, () => {});
      subidas.current.set(f.sha256, llave);
    }
    const [id] = await pedirTomas([{ imagenKey: llave, movimiento: c.movimiento ?? "", variacion: c.variacion ?? 0 }]);
    return id;
  }

  // Espera a que terminen las tomas. enProceso = se acabó la espera (o el cupo del día) y siguen en camino.
  async function esperarTomas(ids: string[], pinta: (t: string) => void): Promise<{ vistos: TrabajoVisto[]; enProceso: boolean; texto: string }> {
    const inicio = Date.now();
    for (;;) {
      const r = await verTomas(ids);
      if (r.vistos.length === 0) return { vistos: [], enProceso: false, texto: "" };
      const texto = textoEstado({ tipo: "trabajos", trabajos: r.vistos, topeHoy: r.topeHoy });
      pinta(texto);
      if (terminado(r.vistos)) return { vistos: r.vistos, enProceso: false, texto };
      const hayCupo = !(r.topeHoy && !r.vistos.some((t) => t.estado === "enviado"));
      if (!hayCupo || Date.now() - inicio > MAX_ESPERA) return { vistos: r.vistos, enProceso: true, texto: hayCupo ? "" : texto };
      await new Promise((res) => setTimeout(res, ESPERA_TOMAS));
    }
  }

  // Anima (o rehace) la foto de un solo clip. El resto del editor sigue usable mientras tanto.
  async function animarClip(clipId: string, rehacer = false) {
    if (busy || animandoYa.current.has(clipId)) return;
    const lugar = () => clipsRef.current.findIndex((x) => x.id === clipId);
    let c = clipsRef.current[lugar()];
    if (!c || c.tipo !== "toma" || !c.image) return;
    animandoYa.current.add(clipId);
    const pinta = (t: string) => setEstadoToma((e) => ({ ...e, [clipId]: t }));
    setAnimando((a) => [...a, clipId]);
    setError("");
    let subioVariacion = false;
    try {
      if (esDemo) marcarDemoALaVista(true); // si la prueba vence mientras tanto, no se tapa el video
      let id = rehacer ? undefined : c.trabajoId;
      if (rehacer && c.trabajoId) {
        interno((l) => rehacerToma(l, lugar()));
        subioVariacion = true;
        c = clipsRef.current[lugar()];
      }
      if (!id) {
        pinta("Subiendo la foto…");
        id = await pedirTomaDe(c);
        subioVariacion = false; // ya quedó pedida con esa variación
        const pedida = id;
        interno((l) => ponerToma(l, lugar(), pedida));
        void refrescarCuenta(); // actualiza «te quedan X tomas»
      }
      const r = await esperarTomas([id], pinta);
      if (r.enProceso) return pinta(r.texto || "Sigue en proceso. Vuelve en unos minutos y toca «Animar» otra vez: no se cobra de nuevo.");
      const t = r.vistos[0];
      if (!t || t.estado === "fallo") {
        const fallida = id;
        interno((l) => quitarToma(l, fallida));
        pinta("");
        setError(t ? "No se pudo generar la toma, te devolvimos tu crédito" : "No encontramos esa toma. Vuelve a animar la foto.");
        void refrescarCuenta();
        return;
      }
      pinta(t.desdeCache ? "Listo al instante" : "Listo");
      void refrescarCuenta();
    } catch (e) {
      // No se llegó a pedir: la variación vuelve a como estaba
      if (subioVariacion) interno((l) => l.map((x) => (x.id === clipId && x.variacion ? { ...x, variacion: x.variacion - 1 } : x)));
      pinta("");
      setError(friendlyError((e as Error).message));
    } finally {
      animandoYa.current.delete(clipId);
      setAnimando((a) => a.filter((x) => x !== clipId));
    }
  }

  // Graba el video. Las fotos con toma ya generada salen con su movimiento; las demás, con zoom.
  async function grabar(lista: Clip[]) {
    const problema = validar(lista);
    if (problema) throw new Error(problema);
    detenerPrevia();
    setResult(null);
    setAvisosVideo([]);
    setProgress(0);
    if (result) URL.revokeObjectURL(result.url);
    const tomas = await fuentesTomas(lista);
    // Nada se vuelve imagen fija en silencio: un video que ya no está en el dispositivo detiene la grabación;
    // una toma con IA que no se pudo traer (sin conexión) se avisa al terminar.
    // Si los videos del proyecto aún se están abriendo (recién cargada la app), se espera un momento
    const idsVideo = lista.flatMap((c) => (c.tipo === "video" && c.archivoId ? [c.archivoId] : []));
    for (let k = 0; k < 50 && idsVideo.some((id) => !(id in urlsRef.current)); k++) await new Promise((r) => setTimeout(r, 100));
    const faltan = sinFuente(lista, { tomas, videos: urlsRef.current });
    if (faltan.videos.length) {
      throw new Error(`El video del clip ${faltan.videos.join(", ")} no está en este dispositivo. Vuelve a subirlo o quita ese clip.`);
    }
    const avisos = faltan.tomas.length
      ? [`No se pudo traer la toma con IA del clip ${faltan.tomas.join(", ")} (revisa tu conexión): ahí la foto se ve con zoom. Vuelve a crear el video cuando tengas señal; no se cobra de nuevo.`]
      : [];
    aLaVista(salida.current);
    const r = await renderReel({
      // Las opciones se leen AHORA (no las de cuando se tocó el botón): tras esperar las tomas con IA,
      // el video sale con la voz, la música y la marca que hay en pantalla en este momento.
      ...opcionesAhora.current(lista, tomas),
      onStatus: (m) => setBusy(m || "Grabando tu reel…"),
      onProgress: setProgress,
      previewCanvas: preview.current || undefined,
    });
    setResult({ url: r.url, ext: r.ext, seconds: r.seconds });
    setAvisosVideo([...avisos, ...r.avisos]);
    setVozCambio(false);
    setTimeout(() => aLaVista(salida.current), 100);
    onVideo(r.blob, `Reel: ${topic || brandName || "sin título"}`); // se guarda solo en la galería
  }

  const buildReel = () =>
    run("Grabando tu reel…", async () => {
      await grabar(clipsRef.current);
      const sinGenerar = clipsRef.current.some((c) => c.tipo === "toma" && c.image && !c.trabajoId);
      if (sinGenerar) setEstadoIa("Video listo: las fotos marcadas que aún no se animan se ven con zoom.");
    });

  // Genera las tomas con IA que falten (una por foto distinta), espera los clips y graba el video final.
  const generandoYa = useRef(false); // dos toques seguidos al botón = un solo pedido
  const generarConIa = async () => {
    if (generandoYa.current) return;
    generandoYa.current = true;
    try {
      await generarTodo();
    } finally {
      generandoYa.current = false;
    }
  };
  const generarTodo = () =>
    run("Preparando las tomas con IA…", async () => {
      if (animandoYa.current.size > 0) throw new Error("Espera a que termine la toma que se está animando y vuelve a intentar.");
      const problema = validar(clipsRef.current);
      if (problema) throw new Error(problema);
      const marcadas = clipsRef.current.filter((c) => c.tipo === "toma" && c.image);
      if (marcadas.length === 0) throw new Error("Marca primero qué fotos animar con IA.");
      setInvitarPlan(false);
      if (esDemo) marcarDemoALaVista(true);
      // Pide solo las que faltan. Dos clips con la misma foto y movimiento comparten una sola toma.
      const pedidas = new Map<string, string>();
      let n = 0;
      for (const c of marcadas) {
        if (c.trabajoId) continue;
        const llave = `${c.image}\n${(c.movimiento ?? "").trim().toLowerCase()}\n${c.variacion ?? 0}`;
        let id = pedidas.get(llave);
        if (!id) {
          setBusy(`Subiendo la foto ${++n}…`);
          id = await pedirTomaDe(c);
          pedidas.set(llave, id);
        }
        const pedida = id;
        interno((l) => ponerToma(l, l.findIndex((x) => x.id === c.id), pedida));
      }
      if (pedidas.size) void refrescarCuenta();
      const ids = [...new Set(clipsRef.current.flatMap((c) => (c.tipo === "toma" && c.image && c.trabajoId ? [c.trabajoId] : [])))];
      const r = await esperarTomas(ids, setBusy);
      if (r.enProceso) {
        // Quedan guardadas en cada clip: al volver y tocar «Generar con IA» se retoman sin costo
        setEstadoIa(r.texto || "Tus tomas siguen en proceso. Vuelve en unos minutos y toca «Generar con IA» para terminar tu video.");
        return;
      }
      // Las que fallaron (o que el servidor ya no reconoce) se quitan del clip: esa foto se verá con zoom
      const porId = new Map(r.vistos.map((t) => [t.id, t]));
      let fallas = 0; // se intentaron y fallaron: el servidor ya devolvió el crédito
      let perdidas = 0; // el servidor ya no las tiene (muy viejas o de otra cuenta): no hay crédito que devolver
      for (const id of ids) {
        const t = porId.get(id);
        if (t && t.estado !== "fallo") continue;
        if (t) fallas++;
        else perdidas++;
        interno((l) => quitarToma(l, id));
      }
      void refrescarCuenta();
      setBusy("Grabando tu reel…");
      await grabar(clipsRef.current);
      setEstadoIa(
        fallas
          ? "No se pudo generar la toma, te devolvimos tu crédito"
          : perdidas
            ? "Una toma anterior ya no está disponible: esa foto se ve con zoom. Tócala y elige «Animar» para generarla de nuevo."
            : textoEstado({ tipo: "trabajos", trabajos: r.vistos, topeHoy: false }),
      );
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
  const [alFinal, setAlFinal] = useState<"vista_previa" | "crear_video" | "generar_ia" | null>(null);
  const ajustarTrasVoz = useRef(false);

  const ajustesActuales = (): Ajustes => ({
    formato: format,
    tema: topic,
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
    setTopic(a.tema);
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

  const enviarOrden = async (orden: string): Promise<boolean> => {
    let entendida = false;
    await enviarLaOrden(orden, () => (entendida = true));
    return entendida;
  };
  const enviarLaOrden = (orden: string, entendida: () => void) =>
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
        entendida();
        setHayDeshacerOrden(false);
        setResultadoDir({ mensaje, hecho: [], avisos: [] });
        return;
      }
      entendida();
      const r = aplicarAcciones(estado, acciones, catalogo, { voz: puedeVoz, ia: conCuenta });
      const gasto = costoDe(r.pendientes);
      let costo = textoCosto(gasto);
      // Con tomas de IA se dice cuántas quedan en el saldo, para decidir con el dato a la vista
      const saldoTomas = cuenta?.usuario ? cuenta.saldo?.tomas_ia : undefined;
      if (costo && gasto.tomas > 0 && typeof saldoTomas === "number") costo += saldoTomas === 1 ? " Te queda 1 toma." : ` Te quedan ${saldoTomas} tomas.`;
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
      const fin = pendientes.find((p) => p.tipo === "vista_previa" || p.tipo === "crear_video" || p.tipo === "generar_ia");
      if (fin) setAlFinal(fin.tipo as "vista_previa" | "crear_video" | "generar_ia");
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

  // «Muéstrame la vista previa», «crea el video» o «genéralo con IA»: al final, con todo ya en su lugar
  useEffect(() => {
    if (!alFinal || busy || viendo || cola) return;
    if (voice && vozSegundos === 0) return; // falta medir la voz recién generada
    const que = alFinal;
    setAlFinal(null);
    if (que === "vista_previa") void verPrevia();
    else if (que === "generar_ia") void generarConIa(); // sube las fotos marcadas, espera las tomas y graba el video
    else void buildReel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alFinal, busy, viendo, cola, voice, vozSegundos]);

  // ---------- Videos propios en los clips ----------
  const galleryVideos = gallery.filter((g) => g.kind === "video" && g.id);
  const [camaraVideo, setCamaraVideo] = useState<string | null>(null); // id del clip que recibirá lo grabado
  const [eligiendoVideo, setEligiendoVideo] = useState<string | null>(null); // id del clip que elige de la galería

  // Pone un video en un clip (conserva su lugar, su texto y el estilo del texto)
  function ponerVideo(clipId: string, datos: { archivoId: string; duracion: number; portada: string }, archivo: Blob) {
    const fotoAnterior = clipsRef.current.find((x) => x.id === clipId)?.imageId;
    if (!urlsRef.current[datos.archivoId]) {
      const enlace = URL.createObjectURL(archivo);
      setUrlsVideo((u) => ({ ...u, [datos.archivoId]: enlace }));
    }
    editar((c) => sustituir(c, c.findIndex((x) => x.id === clipId), clipDeVideo(datos)));
    if (fotoAnterior && !clipsRef.current.some((x) => x.imageId === fotoAnterior)) olvidarFoto(fotoAnterior);
    setEligiendoVideo(null);
  }
  const subirVideo = (clipId: string, f: File) =>
    run("Guardando tu video…", async () => {
      const problema = revisarArchivo(f);
      if (problema) throw new Error(problema);
      ponerVideo(clipId, await guardarVideo(f), f);
    });
  // Lo grabado con la cámara de Studio entra al clip y además queda en la galería
  const videoGrabado = (clipId: string) => async (blob: Blob) => {
    ponerVideo(clipId, await guardarVideo(blob), blob);
    onVideo(blob, "Video grabado con la cámara");
  };
  const videoDeGaleria = (clipId: string, id: string) =>
    run("Abriendo el video…", async () => {
      const archivoId = idDeArchivo("galeria", id);
      const blob = await abrirVideo(archivoId);
      if (!blob) throw new Error("Ese video ya no está en tu galería.");
      const problema = revisarArchivo(blob);
      if (problema) throw new Error(problema);
      ponerVideo(clipId, { archivoId, ...(await leerVideo(blob)) }, blob);
    });

  // De dónde sale el video de un clip: grabarlo, subirlo o tomarlo de la galería
  const botonesVideo = (sc: Clip) => (
    <>
      <div className="lt-origen">
        <button className="btn ghost small" disabled={!!busy} onClick={() => setCamaraVideo(sc.id)}>
          <Video size={15} aria-hidden /> Grabar video
        </button>
        <label className="btn ghost small" style={{ margin: 0 }}>
          Subir video
          <input
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void subirVideo(sc.id, f);
            }}
          />
        </label>
        <button className="btn ghost small" disabled={!!busy} onClick={() => setEligiendoVideo(eligiendoVideo === sc.id ? null : sc.id)}>
          Video de mi galería
        </button>
      </div>
      {eligiendoVideo === sc.id && (
        <div className="picker">
          {galleryVideos.length === 0 && <span className="muted">No tienes videos en tu galería.</span>}
          {galleryVideos.slice(0, 12).map((g) => (
            <video key={g.id} src={g.url} muted playsInline preload="metadata" title={g.prompt} onClick={() => void videoDeGaleria(sc.id, g.id!)} />
          ))}
        </div>
      )}
    </>
  );

  // El lado izquierdo del panel de un clip de video: su portada y cómo cambiarlo
  const panelVideo = (i: number) => {
    const sc = clips[i];
    if (!sc) return null;
    return (
      <>
        <div className="scene-img" style={{ aspectRatio: ratioStyle }}>
          {sc.image ? <img src={sc.image} alt={`Escena ${i + 1}`} /> : <span className="muted">Video</span>}
        </div>
        <p className="hint" style={{ margin: 0 }}>Cambiar este video por otro:</p>
        {botonesVideo(sc)}
        <div className="actions">
          <button className="btn ghost small" disabled={!!busy} onClick={() => editar((c) => sustituir(c, c.findIndex((x) => x.id === sc.id), nuevoClip()))}>
            Quitar video
          </button>
        </div>
      </>
    );
  };

  const alRecortar = (i: number, inicio: number, fin: number) => editar((c) => recortar(c, i, inicio, fin), `${clipsRef.current[i]?.id}:recorte`);
  const alDividir = (i: number, segundo: number) => editar((c) => dividir(c, i, segundo));
  // Congelar un cuadro: queda como foto después del video (y en la galería), lista para usarse o animarse con IA
  const alCongelar = (i: number, cuadro: string) => {
    editar((c) => [...c.slice(0, i + 1), nuevoClip({ image: cuadro }), ...c.slice(i + 1)]);
    onImages([{ kind: "imagen", url: cuadro, prompt: "Cuadro de un video", date: new Date().toISOString() }]);
    setElegido(i + 1);
  };

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
  // Antes de tirar una toma con IA ya generada se pregunta (una sola vez: después ya no hay toma que perder)
  const seguroDe = (clip: Clip | undefined, cambios: Partial<Clip>) =>
    !descartaToma(clip, cambios) ||
    confirm("Este clip ya tiene su toma con IA. Con este cambio se quita y habrá que animarlo otra vez. ¿Continuar?");
  const alCambiar = (i: number, cambios: Partial<Clip>) => {
    if (!seguroDe(clipsRef.current[i], cambios)) return;
    const campo = Object.keys(cambios).join(",");
    // Escribir o arrastrar la duración: varios cambios seguidos cuentan como un solo paso
    const seguido = campo === "caption" || campo === "movimiento" || campo === "segundos" || campo === "prompt";
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
                if (f && seguroDe(sc, { image: "" })) run("Cargando foto…", async () => editar(porId(sc.id, { image: await fileToResizedDataUrl(f, 1280) })));
              }}
            />
          </label>
          <button className="btn ghost small" onClick={() => setPicking(picking === i ? null : i)}>
            Galería
          </button>
          <button
            className="btn ghost small"
            disabled={!!busy || sc.loading}
            onClick={() => seguroDe(sc, { image: "" }) && run("Creando imagen…", () => makeImage(sc.id, sc.prompt || `${topic}, ${sc.caption}, advertising photography`))}
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
                if (!seguroDe(sc, { image: "" })) return;
                editar(porId(sc.id, { image: "", imageId: undefined }));
                olvidarFoto(sc.imageId);
              }}
            >
              Quitar
            </button>
          )}
        </div>
        <p className="hint" style={{ margin: 0 }}>O usa un video en este clip:</p>
        {botonesVideo(sc)}
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
        <h2>Creador de Reels</h2>
        <button
          className="btn ghost small"
          disabled={!!busy || animando.length > 0}
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
            // La canción propia también se quita del dispositivo (si no, se queda ocupando espacio)
            if (cancionPropia?.id) deleteFile(cancionPropia.id).catch(() => {});
            setCancionPropia(null);
            setSinEspacio(false);
            setAvisosVideo([]);
            setResult(null);
            setError("");
            setEstadoIa("");
            setVozCambio(false);
            ultimosClips.current = null;
            enlacesToma.current.clear();
            setEstadoToma({});
            setInvitarPlan(false);
            setPendientes(null);
            Object.values(urlsVideo).forEach((u) => u && URL.revokeObjectURL(u));
            setUrlsVideo({});
            void limpiarHuerfanos(videosDeOtros);
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
      <p className="hint">Pídele el video a la IA o ármalo tú con tus fotos y videos. Se crea en tu navegador.</p>
      {!canRecord && (
        <div className="error">Este navegador no puede grabar video. Usa Chrome, Edge o Safari actualizados.</div>
      )}

      <Director
        sugerida={incomingTopic ?? null}
        ocupado={!!busy}
        cfHeaders={cfHeaders}
        onEnviar={enviarOrden}
        confirmar={propuesta ? { texto: propuesta.costo, onSi: () => confirmarOrden(propuesta), onNo: () => setPropuesta(null) } : null}
        resultado={resultadoDir}
        onDeshacer={hayDeshacerOrden ? deshacerOrden : null}
      />

      {/* 2. Escenas: la línea de tiempo */}
      <h3 className="step">Clips</h3>
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
        tomasMarcadas={tomasDistintas(clips)}
        estadoToma={(id) => ({ texto: estadoToma[id] ?? "", ocupada: animando.includes(id) })}
        onAnimar={(i) => void animarClip(clips[i].id)}
        onRehacer={(i) => void animarClip(clips[i].id, true)}
        onVolver={(i) => interno((l) => volverAnterior(l, i))}
        onTransicionATodos={(i) => editar((c) => transicionATodos(c, i))}
        onSorpresa={() => editar((c) => transicionesAlAzar(c))}
        ocupado={!!busy}
        panelImagen={panelImagen}
        videoDe={(id) => urlsVideo[id]}
        onRecortar={alRecortar}
        onDividir={alDividir}
        onCongelar={alCongelar}
        panelVideo={panelVideo}
      />
      {clips.some((c) => c.tipo === "video" && !c.sinSonido) && (
        <div className="slider">
          <div className="slider-head">
            <span>Volumen del sonido de tus videos</span>
            <span>{Math.round(volClips * 100)}%</span>
          </div>
          <input type="range" aria-label="Volumen del sonido de tus videos" min={0} max={1} step={0.05} value={volClips} onChange={(e) => setVolClips(Number(e.target.value))} />
        </div>
      )}
      {camaraVideo && <CamaraVideo onVideo={videoGrabado(camaraVideo)} onCerrar={() => setCamaraVideo(null)} />}
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

      {/* Marca y cierre */}
      <details className="plegable">
        <summary>
          <strong>Marca y cierre</strong>
          <span className="muted" data-no-translate>{[brandName, cta].filter(Boolean).join(" · ")}</span>
        </summary>
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

      </details>

      {/* Sonido: voz y música */}
      <details className="plegable">
        <summary>
          <strong>Sonido</strong>
          <span className="muted">{voice ? "Con voz" : "Sin voz"}</span>
          <span className="muted">{musicOn ? "Con música" : "Sin música"}</span>
        </summary>
      <h4 className="sub">Voz en off (opcional)<ProTag h="voz" /></h4>
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
          <div className="slider">
            <div className="slider-head">
              <span>Volumen de la voz</span>
              <span>{Math.round(volVoz * 100)}%</span>
            </div>
            <input type="range" aria-label="Volumen de la voz" min={0} max={1} step={0.05} value={volVoz} onChange={(e) => setVolVoz(Number(e.target.value))} />
          </div>
          <label className="check">
            <input type="checkbox" checked={subtitlesOn} onChange={(e) => setSubtitlesOn(e.target.checked)} />
            Subtítulos de la voz, palabra por palabra (estilo TikTok)<ProTag h="subtitulos" />
          </label>
          <p className="hint" style={{ marginTop: 6 }}>
Si la voz dura más que el video, te avisamos en el paso 2 para alargar las fotos. Si cambias el guion, vuelve a generar la voz para que los subtítulos coincidan.
          </p>
        </>
      )}

      <h4 className="sub">Música de fondo (gratis, sin derechos de autor)</h4>
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
        <button className={musicOn && musicSource === "propia" ? "active" : ""} onClick={() => (stopListen(), setMusicOn(true), setMusicSource("propia"))}>
          Mi canción
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
      {musicOn && musicSource === "propia" && (
        <div className="lt-grupo" style={{ marginTop: 8 }}>
          {cancionPropia && urlCancion ? (
            <>
              <span className="muted" data-no-translate>{cancionPropia.nombre}</span>
              <audio src={urlCancion} controls style={{ height: 36, maxWidth: "100%" }} />
            </>
          ) : (
            <p className="hint" style={{ margin: 0 }}>Sube una canción tuya (MP3, M4A o WAV, hasta 25 MB). Se queda en tu dispositivo. Usa solo música que tengas derecho a usar.</p>
          )}
          <label className="btn ghost small" style={{ margin: 0, alignSelf: "flex-start" }}>
            {cancionPropia ? "Cambiar canción" : "Subir canción"}
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void subirCancion(f);
              }}
            />
          </label>
        </div>
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
          <div className="actions" style={{ display: musicSource === "propia" ? "none" : undefined }}>
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

      </details>

      {/* Formato */}
      <details className="plegable">
        <summary>
          <strong>Formato</strong>
          <span className="muted">{format === "9:16" ? "Vertical 9:16" : format === "1:1" ? "Cuadrado 1:1" : "Horizontal 16:9"}</span>
        </summary>
        <select value={format} aria-label="Formato" onChange={(e) => setFormat(e.target.value as ReelFormat)}>
          <option value="9:16">Vertical 9:16 (Reels, TikTok, Historias)</option>
          <option value="1:1">Cuadrado 1:1 (feed)</option>
          <option value="16:9">Horizontal 16:9 (YouTube, web)</option>
        </select>
      </details>

      <div className="reel-output" ref={salida}>
        <canvas
          ref={preview}
          className="reel-canvas"
          style={{ aspectRatio: ratioStyle, display: busy.startsWith("Grabando") ? "block" : "none" }}
        />
        {result && !busy && (
          <div className="media" style={{ maxWidth: format === "16:9" ? 640 : 360 }}>
            <video ref={videoFinal} src={result.url} controls playsInline onTimeUpdate={(e) => setMomentoPortada(e.currentTarget.currentTime)} />
            <div className="meta actions">
              <a href={result.url} download={`reel-innovationtech.${result.ext}`}>
                <Download size={16} aria-hidden /> Descargar video ({result.seconds} s, {result.ext.toUpperCase()})
              </a>
              <span className="muted">· Guardado en tu galería</span>
            </div>
            <div className="portada">
              <div className="slider">
                <div className="slider-head">
                  <span>Portada: elige el momento del video</span>
                  <span data-no-translate>{formatoTiempo(momentoPortada)}</span>
                </div>
                <input
                  type="range"
                  aria-label="Portada: elige el momento del video"
                  min={0}
                  max={result.seconds}
                  step={0.1}
                  value={Math.min(momentoPortada, result.seconds)}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setMomentoPortada(t);
                    if (videoFinal.current) {
                      videoFinal.current.pause();
                      videoFinal.current.currentTime = t;
                    }
                  }}
                />
              </div>
              <button className="btn ghost small" onClick={descargarPortada}>
                <Download size={15} aria-hidden /> Descargar portada
              </button>
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
      {/* Crear: barra fija abajo, siempre a la vista */}
      <div className="reel-barra">
        {!busy && vozCambio && (
          <div className="acct-upsell">
            <span>Cambiaste la voz. Actualiza el video para escucharla: no gasta tomas con IA.</span>
            <button className="btn small" disabled={!canRecord} onClick={buildReel}>
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
        {!busy && result && avisosVideo.map((a) => (
          <div className="notice" key={a}>
            {a}
          </div>
        ))}
        {sinEspacio && (
          <div className="notice">
            {AVISO_SIN_ESPACIO}{" "}
            <button className="btn ghost small" onClick={() => setSinEspacio(false)}>
              Entendido
            </button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <div className="reel-barra-fila">
          <span className={`lt-tiempo${total > MAX_VIDEO ? " pasado" : ""}`} data-no-translate>
            {formatoTiempo(total)}
          </span>
          {viendo ? (
            <button className="btn ghost" onClick={detenerPrevia}>
              <Square size={14} aria-hidden /> Detener
            </button>
          ) : (
            <button className="btn ghost" disabled={!!busy || !clips.some(presente)} onClick={verPrevia}>
              <Eye size={15} aria-hidden /> Vista previa
            </button>
          )}
          <button className="btn" disabled={!!busy || viendo || !canRecord || !clips.some(presente)} onClick={buildReel}>
            <Clapperboard size={16} aria-hidden /> Crear reel
          </button>
          {conCuenta && tomasMarcadas > 0 && (
            <button className="btn" disabled={!!busy || viendo || !canRecord || animando.length > 0} onClick={generarConIa} title="Anima las fotos marcadas que faltan (usa tus tomas) y graba el video">
              <Sparkles size={16} aria-hidden /> Generar con IA
              {esDemo && <span className="acct-pro">Demo gratis</span>}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
