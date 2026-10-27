"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Brand, brandAccent, brandContext, brandVisual, emptyBrand, normalizeBrand, textOn } from "@/lib/brand";
import { FONTS } from "@/lib/editor-model";
import type { EditorIncoming } from "./image-editor";
import { friendlyError } from "@/lib/errors";
import { fileToResizedDataUrl } from "@/lib/resize";
import { usePersistentState } from "@/lib/persist";
import { useGallery } from "@/lib/use-gallery";
import { useDemo } from "@/lib/use-demo";
import { getLang, installLangHeader, locale, setLang, startDomTranslation } from "@/lib/i18n";
import { Bug, Languages, MessagesSquare } from "lucide-react";
import MicButton from "./mic-button";
import { Bot, CalendarDays, Clapperboard, Download, Eraser, Film, FolderOpen, ImageIcon, ImagePlus, Images, Palette, Pencil, PenLine, Plug, RefreshCw, Rocket, Scissors, Settings as SettingsIcon, Shapes, Trash2, type LucideIcon, Wand2 } from "lucide-react";
import { CheckList, CloudflareWizard, testCloudflare, Welcome } from "./setup-wizard";
import { formatBytes, storageUsage, toDataUrl } from "@/lib/media-store";
import type { Item, Settings } from "@/lib/types";
import ReelStudio from "./reel-studio";
import ContentCalendar from "./content-calendar";
import AssistantChat from "./assistant-chat";
import { extract, phrases } from "@/lib/phrases";

type Tab = "texto" | "imagen" | "editor" | "video" | "galeria" | "marca" | "config";

// «Remover fondo» (solo en el navegador)
const BgRemover = dynamic(() => import("./bg-remover"), { ssr: false });
const ShapeCrop = dynamic(() => import("./shape-crop"), { ssr: false });
const VideoEditor = dynamic(() => import("./video-editor"), {
  ssr: false,
  loading: () => <section className="card">Cargando editor de video…</section>,
});

// El editor usa el lienzo del navegador: se carga solo en el navegador.
const ImageEditor = dynamic(() => import("./image-editor"), {
  ssr: false,
  loading: () => <section className="card">Cargando editor…</section>,
});

const defaultSettings: Settings = {
  anthropicKey: "",
  textProvider: "cloudflare",
  cfTextModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  replicateKey: "",
  imageProvider: "cloudflare",
  cfAccountId: "",
  cfToken: "",
  cfImageModel: "@cf/black-forest-labs/flux-1-schnell",
  cfRefModel: "@cf/black-forest-labs/flux-2-klein-4b",
  editModel: "black-forest-labs/flux-kontext-pro",
  textModel: "claude-sonnet-5-5",
  imageModel: "black-forest-labs/flux-schnell",
  videoModel: "minimax/video-01",
};

// Todo se guarda solo en el navegador de cada persona.
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function rawLoad(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible */
  }
}


export default function Home() {
  const [tab, setTab] = usePersistentState<Tab>("tab", "texto");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [brand, setBrand] = useState<Brand>(emptyBrand);
  // Galería permanente (IndexedDB): no se pierde al cerrar la app
  const galleryStore = useGallery();
  const gallery = galleryStore.items;
  const [imagePrompt, setImagePrompt] = usePersistentState("imagen:prompt", "");
  const [videoPrompt, setVideoPrompt] = usePersistentState("video:prompt", "");
  // Imagen enviada con «Animar en video» desde la pestaña Imágenes
  const [handoff, setHandoff] = useState<{ url: string; n: number } | null>(null);
  // Imagen enviada al editor con «Editar»
  const [toEditor, setToEditor] = useState<EditorIncoming | null>(null);
  const openInEditor = async (src: string, returnTo?: { scene: number }) => {
    const url = await toDataUrl(src); // los enlaces locales temporales se convierten para el borrador
    setToEditor((h) => ({ url, returnTo, n: (h?.n || 0) + 1 }));
    setTab("editor");
  };
  const textToEditor = (text: string) => {
    setToEditor((h) => ({ text, n: (h?.n || 0) + 1 }));
    setTab("editor");
  };
  const [textMode, setTextMode] = usePersistentState<"chat" | "post" | "calendario">("texto:modo-v2", "chat");
  const [reelTopic, setReelTopic] = useState<{ text: string; n: number } | null>(null);
  // Escena editada que vuelve al reel
  const [sceneUpdate, setSceneUpdate] = useState<{ scene: number; url: string; n: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [videoMode, setVideoMode] = usePersistentState<"reel" | "editor" | "ia">("video:mode", "reel");
  const { status: demo } = useDemo();
  const [welcomeDone, setWelcomeDone] = usePersistentState("bienvenida", false);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    setSettings(load("its-settings", defaultSettings));
    setBrand(
      normalizeBrand(load<Partial<Brand>>("its-brand", emptyBrand), {
        logo: rawLoad("its-logo"),
        accent: rawLoad("its-accent"),
      })
    );
    // Accesos directos de la app instalada (?tab=imagen, etc.)
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && ["texto", "imagen", "editor", "video", "galeria", "marca", "config"].includes(t)) setTimeout(() => setTab(t as Tab), 0);
    setReady(true);
  }, []);

  const addToGallery = (items: Item[]) =>
    galleryStore.add(items.map((i) => ({ kind: i.kind, url: i.url, prompt: i.prompt })));
  const imageKeysMissing =
    settings.imageProvider === "cloudflare" ? !settings.cfAccountId || !settings.cfToken : !settings.replicateKey;
  const usesCf = settings.textProvider === "cloudflare" || settings.imageProvider === "cloudflare";
  const textKeysMissing = settings.textProvider === "anthropic" && !settings.anthropicKey;
  const hasOwnCf = !!(settings.cfAccountId && settings.cfToken);
  const demoActive = !!demo?.demo && usesCf && !hasOwnCf;
  const missingKeys =
    ready && (textKeysMissing || (imageKeysMissing && !(settings.imageProvider === "cloudflare" && demoActive)) || (usesCf && !hasOwnCf && !demoActive));
  const openSetup = () => {
    setWelcomeDone(true);
    setWizardOpen(true);
    setTab("config");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };
  const NAV: [Tab, LucideIcon, string, string][] = [
    ["texto", PenLine, "Textos", "Textos"],
    ["imagen", ImageIcon, "Imágenes", "Imágenes"],
    ["editor", Wand2, "Editor", "Editor"],
    ["video", Clapperboard, "Videos", "Videos"],
    ["galeria", FolderOpen, "Galería", "Galería"],
    ["marca", Palette, "Mi marca", "Marca"],
    ["config", SettingsIcon, "Configuración", "Ajustes"],
  ];
  const [lang, setLangState] = useState<"es" | "en">("es");
  const [device, setDevice] = useState("");
  useEffect(() => {
    setLangState(getLang());
    setDevice(navigator.userAgent);
    installLangHeader();
    return startDomTranslation();
  }, []);
  const reportUrl = () => {
    const q = new URLSearchParams({
      template: "reporte.yml",
      seccion: tab,
      dispositivo: device,
      version: (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
    });
    return `https://github.com/innovationtech1/innovationtech-studio/issues/new?${q}`;
  };
  const go = (id: Tab) => {
    setTab(id);
    window.scrollTo({ top: 0 });
  };
  const estado = hasOwnCf
    ? { cls: "on", text: "Cuenta conectada" }
    : demoActive
      ? { cls: "demo", text: "Modo demo" }
      : { cls: "off", text: "Sin conectar" };

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <img src="/icons/icon-192.png" alt="" />
          <div className="logo">
            Innovation<span>TECH</span>
            <small>Studio</small>
          </div>
        </div>
        <nav className="tabs" aria-label="Secciones">
          {NAV.map(([id, Icon, label]) => (
            <button key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} title={label} onClick={() => go(id)}>
              <Icon size={19} strokeWidth={1.9} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <button className={`status-chip ${estado.cls}`} onClick={() => go("config")} title="Ver configuración">
            <i aria-hidden />
            {estado.text}
          </button>
          <button className="lang-btn" onClick={() => setLang(lang === "es" ? "en" : "es")} title={lang === "es" ? "Switch to English" : "Cambiar a español"} data-no-translate>
            <Languages size={16} aria-hidden />
            <span>{lang === "es" ? "English" : "Español"}</span>
          </button>
          <a className="rail-link" href={reportUrl()} target="_blank" rel="noreferrer">
            <Bug size={16} aria-hidden />
            <span>Reportar un problema</span>
          </a>
        </div>
      </aside>

      <main className="shell">

      {demoActive && tab !== "config" && (
        <div className="demo-banner">
          <span>
            <Rocket size={16} aria-hidden /> <strong>Modo demo</strong> · hoy te quedan {demo?.remaining?.image ?? 0} imágenes, {demo?.remaining?.text ?? 0} textos y{" "}
            {demo?.remaining?.voice ?? 0} voces
          </span>
          <button className="btn small" onClick={openSetup}>
            Conectar mi cuenta gratis
          </button>
        </div>
      )}
      {missingKeys && tab !== "config" && (
        <div className="demo-banner">
          <span>Para crear con IA, conecta tu cuenta gratis de Cloudflare (toma unos 5 minutos).</span>
          <button className="btn small" onClick={openSetup}>
            Empezar
          </button>
        </div>
      )}
      {ready && !welcomeDone && !hasOwnCf && demo && (
        <Welcome
          demo={demo}
          onDemo={() => setWelcomeDone(true)}
          onSetup={openSetup}
          onHaveKeys={() => (setWelcomeDone(true), setTab("config"))}
        />
      )}

      {/* Todas las secciones permanecen abiertas en segundo plano: al cambiar de pestaña no se pierde nada. */}
      <div hidden={tab !== "texto"}>
        <div className="mode-switch" role="tablist">
          <button className={textMode === "chat" ? "active" : ""} onClick={() => setTextMode("chat")}>
            <MessagesSquare size={16} aria-hidden /> Asistente
          </button>
          <button className={textMode === "post" ? "active" : ""} onClick={() => setTextMode("post")}>
            <PenLine size={16} aria-hidden /> Una publicación
          </button>
          <button className={textMode === "calendario" ? "active" : ""} onClick={() => setTextMode("calendario")}>
            <CalendarDays size={16} aria-hidden /> Calendario de 30 días
          </button>
        </div>
        <div hidden={textMode !== "chat"}>
          <AssistantChat
            settings={settings}
            brand={brand}
            onImage={(p) => (setImagePrompt(p), go("imagen"))}
            onEditor={textToEditor}
          />
        </div>
        <div hidden={textMode !== "post"}>
          <TextStudio
            settings={settings}
            brand={brand}
            onUseImage={(p) => (setImagePrompt(p), setTab("imagen"))}
            onToEditor={textToEditor}
            onUseVideo={(p) => (setVideoPrompt(p), setVideoMode("ia"), setTab("video"))}
          />
        </div>
        <div hidden={textMode !== "calendario"}>
          <ContentCalendar
            settings={settings}
            brand={brand}
            onImage={(p) => (setImagePrompt(p), go("imagen"))}
            onEditor={textToEditor}
            onReel={(t) => (setReelTopic((r) => ({ text: t, n: (r?.n || 0) + 1 })), setVideoMode("reel"), go("video"))}
          />
        </div>
      </div>
      <div hidden={tab !== "imagen"}>
        <ImageStudio
          settings={settings}
          brand={brand}
          prompt={imagePrompt}
          setPrompt={setImagePrompt}
          onDone={addToGallery}
          onEdit={openInEditor}
          onAnimate={async (src, p) => {
            const url = await toDataUrl(src);
            setVideoPrompt(p);
            setHandoff((h) => ({ url, n: (h?.n || 0) + 1 }));
            setTab("video");
          }}
        />
      </div>
      <div hidden={tab !== "editor"}>
        <ImageEditor
          incoming={toEditor}
          brand={brand}
          onOpenBrand={() => go("marca")}
          onReturn={(url, to) => {
            setSceneUpdate((u) => ({ scene: to.scene, url, n: (u?.n || 0) + 1 }));
            setVideoMode("reel");
            go("video");
          }}
          gallery={gallery}
          onSaveToGallery={(url) =>
            addToGallery([{ kind: "imagen", url, prompt: "Diseño editado", date: new Date().toISOString() }])
          }
        />
      </div>
      <div hidden={tab !== "video"}>
          <div className="mode-switch" role="tablist">
            <button className={videoMode === "reel" ? "active" : ""} onClick={() => setVideoMode("reel")}>
              <Film size={16} aria-hidden /> Reel con mis imágenes · gratis
            </button>
            <button className={videoMode === "editor" ? "active" : ""} onClick={() => setVideoMode("editor")}>
              <Scissors size={16} aria-hidden /> Editor de video + música
            </button>
            <button className={videoMode === "ia" ? "active" : ""} onClick={() => setVideoMode("ia")}>
              <Bot size={16} aria-hidden /> Video con IA · Replicate (de pago)
            </button>
          </div>
          <div hidden={videoMode !== "reel"}>
            <ReelStudio
              settings={settings}
              brand={brand}
              gallery={gallery}
              onImages={addToGallery}
              onVideo={(blob, prompt) => galleryStore.add([{ kind: "video", blob, prompt }])}
              handoff={handoff}
              sceneUpdate={sceneUpdate}
              incomingTopic={reelTopic}
              onEditScene={(i, src) => openInEditor(src, { scene: i })}
              onOpenBrand={() => go("marca")}
            />
          </div>
          <div hidden={videoMode !== "editor"}>
            <VideoEditor
              gallery={gallery}
              settings={settings}
              accent={brandAccent(brand)}
              onVideo={(blob, prompt) => galleryStore.add([{ kind: "video", blob, prompt }])}
            />
          </div>
          <div hidden={videoMode !== "ia"}>
            <VideoStudio
              settings={settings}
              brand={brand}
              prompt={videoPrompt}
              setPrompt={setVideoPrompt}
              onDone={addToGallery}
              handoff={handoff}
            />
          </div>
      </div>
      <div hidden={tab !== "galeria"}>
        <Gallery
          items={gallery}
          ready={galleryStore.ready}
          persistent={galleryStore.persistent}
          storeError={galleryStore.error}
          onRemove={galleryStore.remove}
          onClear={galleryStore.clear}
          onEdit={openInEditor}
          visible={tab === "galeria"}
        />
      </div>
      <div hidden={tab !== "marca"}>
        <BrandKit
          brand={brand}
          onSave={(b) => {
            setBrand(b);
            save("its-brand", b);
          }}
        />
      </div>
      <div hidden={tab !== "config"}>
        <Config
          settings={settings}
          wizardOpen={wizardOpen || !hasOwnCf}
          demo={!!demo?.demo}
          onFinish={() => (setWizardOpen(false), setTab("texto"))}
          onSave={(s) => {
            setSettings(s);
            save("its-settings", s);
          }}
        />
      </div>

        <footer>
          Proyecto open source de InnovationTECH, licencia MIT. Tus claves se guardan solo en tu navegador.
          <span className="footer-links">
            <a href="https://github.com/innovationtech1/innovationtech-studio" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={reportUrl()} target="_blank" rel="noreferrer">
              Reportar un problema
            </a>
            <a href="https://github.com/innovationtech1/innovationtech-studio/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer">
              Cómo contribuir
            </a>
          </span>
        </footer>
      </main>

      <nav className="bottom-nav" aria-label="Secciones">
        {NAV.map(([id, Icon, , short]) => (
          <button key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => go(id)}>
            <Icon size={22} strokeWidth={1.8} aria-hidden />
            {short}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------------- Textos ---------------- */

function TextStudio({
  settings,
  brand,
  onUseImage,
  onUseVideo,
  onToEditor,
}: {
  settings: Settings;
  brand: Brand;
  onUseImage: (p: string) => void;
  onUseVideo: (p: string) => void;
  onToEditor: (text: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [prompt, setPrompt] = usePersistentState("texto:prompt", "");
  const [platform, setPlatform] = usePersistentState("texto:plataforma", "Instagram");
  const [result, setResult] = usePersistentState("texto:resultado", "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/text", {
        method: "POST",
        headers:
          settings.textProvider === "cloudflare"
            ? { "content-type": "application/json", "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken }
            : { "content-type": "application/json", "x-anthropic-key": settings.anthropicKey },
        body: JSON.stringify({
          prompt,
          platform,
          brand: brandContext(brand),
          provider: settings.textProvider,
          model: settings.textProvider === "cloudflare" ? settings.cfTextModel : settings.textModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data.text);
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  const imgP = extract(result, "PROMPT DE IMAGEN");
  const vidP = extract(result, "PROMPT DE VIDEO");

  return (
    <section className="card">
      <div className="card-head">
        <h2>Crear textos de marketing</h2>
        {(prompt || result) && (
          <button className="btn ghost small" disabled={loading} onClick={() => (setPrompt(""), setResult(""), setError(""))}>
            Limpiar
          </button>
        )}
      </div>
      <p className="hint">Describe tu campaña o publicación. La IA escribe el copy, ganchos, hashtags y las ideas visuales.</p>
      <div className="row">
        <div>
          <label>Plataforma</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {["Instagram", "Facebook", "TikTok", "LinkedIn", "X (Twitter)", "YouTube", "Anuncio pagado", "Email"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="label-row">
        <label>¿Qué quieres publicar?</label>
        <MicButton
          cfHeaders={{ "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken }}
          onText={(t) => setPrompt((v) => (v && !v.endsWith(" ") ? `${v} ${t}` : v + t))}
        />
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ej.: Promoción de 2x1 en tortas los martes, para jóvenes y familias de San Antonio"
      />
      <button className="btn" disabled={loading || !prompt} onClick={generate}>
        {loading ? "Escribiendo…" : "Generar textos"}
      </button>
      {error && <div className="error">{error}</div>}
      {result && (
        <>
          <pre className="result">{result}</pre>
          <div className="actions">
            <button className="btn ghost small" onClick={() => navigator.clipboard.writeText(result)}>
              Copiar todo
            </button>
            {imgP && (
              <button className="btn small" onClick={() => onUseImage(imgP)}>
                Crear la imagen
              </button>
            )}
            {vidP && (
              <button className="btn small" onClick={() => onUseVideo(vidP)}>
                Crear el video
              </button>
            )}
            <button className="btn ghost small" onClick={() => setPicking((v) => !v)}>
              Llevar al editor
            </button>
          </div>
          {picking && (
            <div className="phrase-pick">
              <p className="muted">Elige la frase que quieres poner en tu diseño:</p>
              {phrases(result).map((ph) => (
                <button key={ph} onClick={() => (onToEditor(ph), setPicking(false))}>
                  {ph}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ---------------- Imágenes ---------------- */

function ImageStudio({
  settings,
  brand,
  prompt,
  setPrompt,
  onDone,
  onAnimate,
  onEdit,
}: {
  settings: Settings;
  brand: Brand;
  prompt: string;
  setPrompt: (p: string) => void;
  onDone: (items: Item[]) => void;
  onAnimate: (url: string, prompt: string) => void;
  onEdit: (url: string) => void;
}) {
  const [ratio, setRatio] = usePersistentState("imagen:formato", "1:1");
  const [count, setCount] = usePersistentState("imagen:cantidad", 1);
  const [useBrand, setUseBrand] = usePersistentState("imagen:marca", true);
  const [warning, setWarning] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [cutSrc, setCutSrc] = useState<string | null>(null);
  const [cutEraser, setCutEraser] = useState(false);
  const [shapeSrc, setShapeSrc] = useState<string | null>(null);
  const [cutResults, setCutResults] = useState<string[]>([]);
  const [refs, setRefs] = useState<string[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cfProvider = settings.imageProvider === "cloudflare";
  const maxRefs = cfProvider ? 4 : 1;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    try {
      // Cloudflare exige referencias menores a 512×512; Replicate acepta más grandes.
      const side = cfProvider ? 500 : 1280;
      const room = maxRefs - refs.length;
      const picked = Array.from(files).slice(0, Math.max(room, 0));
      if (picked.length < files.length) setError(`Puedes usar hasta ${maxRefs} imagen(es) con este proveedor.`);
      const urls = await Promise.all(picked.map((f) => fileToResizedDataUrl(f, side)));
      setRefs((r) => [...r, ...urls].slice(0, maxRefs));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function generate(withoutRefs = false) {
    setLoading(true);
    setError("");
    setWarning("");
    setFlagged(false);
    setUrls([]);
    const full = prompt + (useBrand ? brandVisual(brand) : "");
    const useRefs = withoutRefs ? [] : refs.slice(0, maxRefs);
    try {
      const cf = settings.imageProvider === "cloudflare";
      const res = await fetch("/api/image", {
        method: "POST",
        headers: cf
          ? { "content-type": "application/json", "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken }
          : { "content-type": "application/json", "x-replicate-key": settings.replicateKey },
        body: JSON.stringify({
          prompt: full,
          aspectRatio: ratio,
          count,
          provider: settings.imageProvider,
          model: cf ? settings.cfImageModel : settings.imageModel,
          refModel: settings.cfRefModel,
          editModel: settings.editModel,
          references: useRefs,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.flagged) setFlagged(true);
        throw new Error(data.error);
      }
      setUrls(data.urls);
      if (data.warning) setWarning(data.warning);
      const date = new Date().toISOString();
      onDone(data.urls.map((url: string) => ({ kind: "imagen", url, prompt, date })));
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    {/* ---------- Remover fondo ---------- */}
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Recortar, quitar fondo y borrar</h2>
          <p className="hint" style={{ margin: 0 }}>
            Quita el fondo, recorta con figuras modernas (círculo, arco, corazón, estrella…) o borra a mano zonas. Se descarga en PNG
            transparente. Gratis, en tu dispositivo.
          </p>
        </div>
        <div className="actions">
          <label className="btn" style={{ margin: 0 }}>
            <ImagePlus size={16} aria-hidden /> Quitar fondo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) (setShapeSrc(null), setCutEraser(false), setCutSrc(await fileToResizedDataUrl(f, 2048, 0.95, f.type === "image/png")));
              }}
            />
          </label>
          <label className="btn ghost" style={{ margin: 0 }}>
            <Shapes size={16} aria-hidden /> Recortar con forma
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) (setCutSrc(null), setShapeSrc(await fileToResizedDataUrl(f, 2048, 0.95, f.type === "image/png")));
              }}
            />
          </label>
          <label className="btn ghost" style={{ margin: 0 }}>
            <Eraser size={16} aria-hidden /> Borrador
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) (setShapeSrc(null), setCutEraser(true), setCutSrc(await fileToResizedDataUrl(f, 2048, 0.95, f.type === "image/png")));
              }}
            />
          </label>
        </div>
      </div>
      {cutSrc && (
        <BgRemover
          src={cutSrc}
          startWithEraser={cutEraser}
          title="tu imagen"
          onClose={() => setCutSrc(null)}
          onApply={(png) => {
            setCutResults((r) => [png, ...r]);
            onDone([{ kind: "imagen", url: png, prompt: "Imagen sin fondo", date: new Date().toISOString() }]);
            setCutSrc(null);
            setTimeout(() => document.getElementById("cut-results")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
          }}
        />
      )}
      {shapeSrc && (
        <ShapeCrop
          src={shapeSrc}
          title="tu imagen"
          onClose={() => setShapeSrc(null)}
          onApply={(png) => {
            setCutResults((r) => [png, ...r]);
            onDone([{ kind: "imagen", url: png, prompt: "Recorte con forma", date: new Date().toISOString() }]);
            setShapeSrc(null);
            setTimeout(() => document.getElementById("cut-results")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
          }}
        />
      )}
      {cutResults.length > 0 && (
        <div className="grid" id="cut-results">
          {cutResults.map((u, i) => (
            <div className="media" key={i}>
              <div className="checker" style={{ minHeight: 0, borderRadius: 0 }}>
                <img src={u} alt="Sin fondo" style={{ maxHeight: 260, width: "auto", maxWidth: "100%", background: "transparent" }} />
              </div>
              <div className="meta actions">
                <a href={u} download="innovationtech-sin-fondo.png">
                  <Download size={16} aria-hidden /> Descargar PNG
                </a>
                ·
                <a href="#" onClick={(e) => (e.preventDefault(), onEdit(u))}>
                  <Pencil size={16} aria-hidden /> Editar
                </a>
                · <span className="muted">Guardado en la galería</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>

    <section className="card">
      <h2>Crear imágenes</h2>
      <p className="hint">
        Funciona mejor si describes la imagen en inglés, con estilo, luz y composición. Proveedor:{" "}
        <strong>{settings.imageProvider === "cloudflare" ? "Cloudflare (gratis)" : "Replicate"}</strong>
      </p>
      <label>Imágenes de referencia (opcional)</label>
      <div className="upload">
        {refs.map((r, i) => (
          <div className="thumb" key={i}>
            <img src={r} alt={`Referencia ${i + 1}`} />
            <button title="Quitar" onClick={() => setRefs(refs.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        {refs.length < maxRefs && (
          <label className="pick">
            <input
              type="file"
              accept="image/*"
              multiple={maxRefs > 1}
              onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))}
            />
            <span>＋ Subir foto</span>
          </label>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {refs.length > 0
          ? "La IA usará tus fotos como base. Describe qué quieres: por ejemplo, «put this product on a wooden table with warm light» o «same person, now in a professional studio portrait»."
          : `Sube hasta ${maxRefs} foto(s) de tu producto, local o logo para crear imágenes a partir de ellas, o déjalo vacío para crear desde cero.`}
      </p>
      <label>{refs.length > 0 ? "¿Qué hacer con tus imágenes?" : "Descripción de la imagen"}</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={
          refs.length > 0
            ? "Ej.: place this torta on a rustic wooden table, warm restaurant light, food photography"
            : "Ej.: appetizing Mexican torta on a rustic wooden table, warm light, food photography, close-up"
        }
      />
      <div className="row">
        <div>
          <label>Formato</label>
          <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
            <option value="1:1">Cuadrado 1:1 (post)</option>
            <option value="4:5">Vertical 4:5 (feed)</option>
            <option value="9:16">Historia / Reel 9:16</option>
            <option value="16:9">Horizontal 16:9 (YouTube, web)</option>
          </select>
        </div>
        <div>
          <label>Cantidad</label>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Kit de marca</label>
          <select value={useBrand ? "si" : "no"} onChange={(e) => setUseBrand(e.target.value === "si")}>
            <option value="si">Aplicar mis colores</option>
            <option value="no">No aplicar</option>
          </select>
        </div>
      </div>
      <button className="btn" disabled={loading || !prompt} onClick={() => generate()}>
        {loading ? "Generando… (hasta 1 min)" : "Generar imagen"}
      </button>
      {error && (
        <div className="error">
          {error}
          {flagged && (
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="btn small" disabled={loading} onClick={() => generate()}>
                <RefreshCw size={16} aria-hidden /> Intentar otra vez
              </button>
              {refs.length > 0 && (
                <button className="btn ghost small" disabled={loading} onClick={() => generate(true)}>
                  Intentar sin fotos de referencia
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {warning && <div className="notice">{warning}</div>}
      {urls.length > 0 && (
        <div className="grid">
          {urls.map((u) => (
            <div className="media" key={u}>
              <img src={u} alt={prompt} />
              <div className="meta actions">
                <a href={u} target={u.startsWith("data:") ? undefined : "_blank"} rel="noreferrer" download="innovationtech-imagen">
                  Descargar
                </a>
                ·
                <a href="#" onClick={(e) => (e.preventDefault(), onEdit(u))}>
                  <Pencil size={16} aria-hidden /> Editar
                </a>
                ·
                <a
                  href="#"
                  onClick={async (e) => {
                    e.preventDefault();
                    setCutEraser(false);
                    setCutSrc(await toDataUrl(u));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <Scissors size={16} aria-hidden /> Quitar fondo
                </a>
                ·
                <a
                  href="#"
                  onClick={async (e) => {
                    e.preventDefault();
                    setCutSrc(null);
                    setShapeSrc(await toDataUrl(u));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <Shapes size={16} aria-hidden /> Forma
                </a>
                ·
                <a href="#" onClick={(e) => (e.preventDefault(), onAnimate(u, prompt))}>
                  Animar en video
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
    </>
  );
}

/* ---------------- Videos ---------------- */

function VideoStudio({
  settings,
  brand,
  prompt,
  setPrompt,
  onDone,
  handoff,
}: {
  settings: Settings;
  brand: Brand;
  prompt: string;
  setPrompt: (p: string) => void;
  onDone: (items: Item[]) => void;
  handoff: { url: string; n: number } | null;
}) {
  const [firstFrame, setFirstFrame] = useState("");
  const [status, setStatus] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (handoff) setFirstFrame(handoff.url);
  }, [handoff]);

  async function generate() {
    setLoading(true);
    setError("");
    setUrls([]);
    setStatus("Enviando…");
    const headers = { "content-type": "application/json", "x-replicate-key": settings.replicateKey };
    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: prompt + brandVisual(brand),
          model: settings.videoModel,
          imageUrl: firstFrame || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const started = Date.now();
      // Consultamos cada 5 segundos hasta 15 minutos.
      while (Date.now() - started < 15 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 5000));
        const mins = Math.floor((Date.now() - started) / 60000);
        const sres = await fetch(`/api/video/${data.id}`, { headers });
        const s = await sres.json();
        if (!sres.ok) throw new Error(s.error);
        if (s.status === "succeeded") {
          setUrls(s.urls);
          setStatus("¡Listo!");
          onDone(s.urls.map((url: string) => ({ kind: "video", url, prompt, date: new Date().toISOString() })));
          return;
        }
        if (s.status === "failed" || s.status === "canceled") throw new Error(s.error || "El video no se pudo generar.");
        setStatus(`Generando video… ${mins} min. Los videos suelen tardar de 2 a 6 minutos.`);
      }
      throw new Error("Se agotó el tiempo de espera. Revisa tu panel de Replicate.");
    } catch (e) {
      setError(friendlyError((e as Error).message));
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>Crear videos</h2>
      <p className="hint">Clips cortos para reels y anuncios. Describe la escena y el movimiento de cámara, idealmente en inglés.</p>
      <label>Descripción del video</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ej.: slow cinematic dolly-in on a sizzling torta being assembled, steam rising, warm restaurant light"
      />
      <label>Imagen inicial (opcional)</label>
      <div className="upload">
        {firstFrame ? (
          <div className="thumb">
            <img src={firstFrame} alt="Imagen inicial" />
            <button title="Quitar" onClick={() => setFirstFrame("")}>
              ×
            </button>
          </div>
        ) : (
          <label className="pick">
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  setError("");
                  setFirstFrame(await fileToResizedDataUrl(file, 1280));
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
            <span>＋ Subir foto</span>
          </label>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {firstFrame
          ? "El video empezará con esta imagen. Describe el movimiento: por ejemplo, «slow camera zoom in, steam rising, people smiling»."
          : "Sube una foto de tu producto o local para darle vida, o déjalo vacío para crear el video solo con la descripción."}
      </p>
      <button className="btn" disabled={loading || !prompt} onClick={generate}>
        {loading ? "Generando…" : "Generar video"}
      </button>
      {status && <div className="ok">{status}</div>}
      {error && <div className="error">{error}</div>}
      {urls.length > 0 && (
        <div className="grid">
          {urls.map((u) => (
            <div className="media" key={u}>
              <video src={u} controls playsInline />
              <div className="meta">
                <a href={u} target="_blank" rel="noreferrer" download>
                  Descargar video
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- Galería ---------------- */

function Gallery({
  items,
  ready,
  persistent,
  storeError,
  onRemove,
  onClear,
  onEdit,
  visible,
}: {
  items: Item[];
  ready: boolean;
  persistent: boolean;
  storeError: string;
  onRemove: (id: string) => void;
  onClear: () => void;
  onEdit: (url: string) => void;
  visible: boolean;
}) {
  const [filter, setFilter] = useState<"todo" | "imagen" | "video">("todo");
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [open, setOpen] = useState<Item | null>(null);

  useEffect(() => {
    if (visible) storageUsage().then(setUsage);
  }, [visible, items.length]);

  const shown = items.filter((i) => filter === "todo" || i.kind === filter);
  const nImg = items.filter((i) => i.kind === "imagen").length;
  const nVid = items.length - nImg;
  const ext = (it: Item) => {
    const m = it.mime || "";
    if (it.kind === "video") return m.includes("webm") ? "webm" : "mp4";
    return m.includes("png") ? "png" : m.includes("webp") ? "webp" : "jpg";
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Galería</h2>
        {usage && usage.quota > 0 && (
          <span className="muted">
            Usado: {formatBytes(usage.used)} de {formatBytes(usage.quota)} disponibles
          </span>
        )}
      </div>
      <p className="hint">
        Todo lo que creas se guarda aquí, en tu dispositivo, aunque cierres la app.
        {persistent ? " Protegida: el navegador no la borrará." : ""}
      </p>
      {storeError && <div className="error">{storeError}</div>}

      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={filter === "todo" ? "active" : ""} onClick={() => setFilter("todo")}>
          Todo ({items.length})
        </button>
        <button className={filter === "imagen" ? "active" : ""} onClick={() => setFilter("imagen")}>
          <Images size={16} aria-hidden /> Imágenes ({nImg})
        </button>
        <button className={filter === "video" ? "active" : ""} onClick={() => setFilter("video")}>
          <Clapperboard size={16} aria-hidden /> Videos ({nVid})
        </button>
      </div>

      {!ready && <div className="notice">Cargando galería…</div>}
      {ready && shown.length === 0 && <div className="notice">Aún no hay nada aquí. Lo que crees aparecerá automáticamente.</div>}

      <div className="gallery-grid">
        {shown.map((it) => (
          <div className="gallery-item" key={it.id || it.url}>
            <button className="gallery-thumb" onClick={() => setOpen(it)} aria-label="Ver en grande">
              {it.kind === "imagen" ? (
                <img src={it.url} alt={it.prompt} loading="lazy" />
              ) : (
                <>
                  <video src={it.url} muted playsInline preload="metadata" />
                  <span className="badge-video">Video</span>
                </>
              )}
            </button>
            <div className="gallery-meta">
              <span className="muted">{new Date(it.date).toLocaleDateString(locale(), { day: "numeric", month: "short" })}</span>
              <div className="gallery-actions">
                {it.kind === "imagen" && (
                  <button title="Editar" onClick={() => onEdit(it.url)}>
                    <Pencil size={17} aria-hidden />
                  </button>
                )}
                <a title="Descargar" href={it.url} download={`innovationtech-${it.kind}.${ext(it)}`}>
                  <Download size={17} aria-hidden />
                </a>
                <button
                  title="Eliminar"
                  onClick={() => it.id && confirm("¿Eliminar este elemento de la galería?") && onRemove(it.id)}
                >
                  <Trash2 size={17} aria-hidden />
                </button>
              </div>
            </div>
            {it.external && <span className="muted" style={{ fontSize: 11 }}>Enlace externo: descárgalo para conservarlo</span>}
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <button
          className="btn ghost small"
          onClick={() => confirm("¿Borrar TODA la galería? Esto no se puede deshacer.") && onClear()}
        >
          Vaciar galería
        </button>
      )}

      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {open.kind === "imagen" ? <img src={open.url} alt={open.prompt} /> : <video src={open.url} controls autoPlay playsInline />}
            <p className="muted">{open.prompt}</p>
            <div className="actions">
              {open.kind === "imagen" && (
                <button className="btn small" onClick={() => (onEdit(open.url), setOpen(null))}>
                  <Pencil size={16} aria-hidden /> Editar
                </button>
              )}
              <a className="btn ghost small" href={open.url} download={`innovationtech-${open.kind}.${ext(open)}`}>
                <Download size={16} aria-hidden /> Descargar
              </a>
              <button className="btn ghost small" onClick={() => setOpen(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Kit de marca ---------------- */

function BrandKit({ brand, onSave }: { brand: Brand; onSave: (b: Brand) => void }) {
  const [b, setB] = useState(brand);
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState("");
  useEffect(() => setB(brand), [brand]);
  const set = (patch: Partial<Brand>) => (setB((x) => ({ ...x, ...patch })), setSaved(false));
  const f = (k: "name" | "industry" | "audience" | "tone" | "colors" | "extra" | "contact") => ({
    value: b[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [k]: e.target.value }),
  });
  const accent = brandAccent(b);
  const bg = b.palette[1] || "#0d1630";
  const font = b.font || "Montserrat";

  return (
    <section className="card">
      <h2>Mi marca</h2>
      <p className="hint">
        Guarda tu identidad una sola vez. La IA la usa en cada texto e imagen, y en el editor y los reels la aplicas con un toque.
      </p>

      <div className="brand-kit">
        <div className="brand-kit-form">
          <h3 className="step" style={{ marginTop: 0 }}>Identidad visual</h3>
          <label>Logo</label>
          <div className="actions">
            {b.logo && <img className="brand-logo-prev" src={b.logo} alt="Logo" />}
            <label className="btn ghost small" style={{ margin: 0 }}>
              {b.logo ? "Cambiar logo" : "Subir logo"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setLogoError("");
                  try {
                    set({ logo: await fileToResizedDataUrl(file, 512, 0.9, true) });
                  } catch {
                    setLogoError("No se pudo leer esa imagen. Prueba con un PNG o JPG.");
                  }
                }}
              />
            </label>
            {b.logo && (
              <button className="btn ghost small" onClick={() => set({ logo: "" })}>
                Quitar
              </button>
            )}
          </div>
          <p className="muted">Lo ideal es un PNG sin fondo. Si tu logo tiene fondo, quítalo en Imágenes → Quitar fondo.</p>
          {logoError && <div className="error">{logoError}</div>}

          <label>Colores (el primero es el principal)</label>
          <div className="palette-edit">
            {b.palette.map((c, i) => (
              <div key={i} className="palette-chip">
                <input
                  type="color"
                  value={c}
                  aria-label={`Color ${i + 1}`}
                  onChange={(e) => set({ palette: b.palette.map((x, k) => (k === i ? e.target.value : x)) })}
                />
                <button aria-label="Quitar color" onClick={() => set({ palette: b.palette.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </div>
            ))}
            {b.palette.length < 5 && (
              <button className="palette-add" onClick={() => set({ palette: [...b.palette, b.palette.length ? "#ffffff" : "#e5243b"] })}>
                + Color
              </button>
            )}
          </div>

          <label>Letra de títulos</label>
          <div className="font-pick">
            {FONTS.map((ft) => (
              <button key={ft} className={font === ft ? "active" : ""} style={{ fontFamily: `${ft}, sans-serif` }} onClick={() => set({ font: ft })}>
                {b.name || "Aa"}
              </button>
            ))}
          </div>

          <h3 className="step">Tu negocio</h3>
          <div className="row">
            <div>
              <label>Nombre del negocio</label>
              <input {...f("name")} placeholder="Ej.: Tortas Tortuga" />
            </div>
            <div>
              <label>Contacto (teléfono, web o redes)</label>
              <input {...f("contact")} placeholder="Ej.: (210) 555-0123 · @tortastortuga" />
            </div>
          </div>
          <div className="row">
            <div>
              <label>Giro</label>
              <input {...f("industry")} placeholder="Ej.: restaurante de tortas mexicanas" />
            </div>
            <div>
              <label>Público objetivo</label>
              <input {...f("audience")} placeholder="Ej.: familias y estudiantes" />
            </div>
          </div>
          <label>Tono de voz</label>
          <input {...f("tone")} placeholder="Ej.: divertido, cercano, con humor" />
          <label>Colores en palabras (para la IA, opcional)</label>
          <input {...f("colors")} placeholder="Ej.: dark navy blue and red" />
          <label>Notas adicionales</label>
          <textarea {...f("extra")} placeholder="Promociones fijas, palabras que sí o no usar, etc." />
        </div>

        <aside className="brand-preview" aria-label="Vista previa">
          <span className="muted">Vista previa</span>
          <div className="brand-post" style={{ background: bg }}>
            {b.logo && <img src={b.logo} alt="" />}
            <div className="brand-post-title" style={{ fontFamily: `${font}, sans-serif`, color: textOn(bg) }}>
              Promo de la semana
            </div>
            <div className="brand-post-tag" style={{ background: accent, color: textOn(accent), fontFamily: `${font}, sans-serif` }}>
              {b.name || "Tu negocio"}
            </div>
            {b.contact && <div className="brand-post-contact" style={{ color: textOn(bg) }}>{b.contact}</div>}
          </div>
        </aside>
      </div>

      <div className="actions">
        <button className="btn" onClick={() => (onSave(b), setSaved(true))}>
          Guardar marca
        </button>
        {saved && <span className="ok" style={{ marginTop: 18 }}>Marca guardada.</span>}
      </div>
    </section>
  );
}

/* ---------------- Configuración ---------------- */

function Config({
  settings,
  onSave,
  wizardOpen,
  demo,
  onFinish,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  wizardOpen: boolean;
  demo: boolean;
  onFinish: () => void;
}) {
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [showWizard, setShowWizard] = useState(wizardOpen);
  const [checks, setChecks] = useState<{ ok: boolean; label: string; help?: string }[] | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => setShowWizard((v) => v || wizardOpen), [wizardOpen]);
  useEffect(() => setS(settings), [settings]);
  const f = (k: keyof Settings) => ({
    value: s[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => (setS({ ...s, [k]: e.target.value.trim() }), setSaved(false)),
  });

  return (
    <>
    <section className="card">
      <div className="card-head">
        <h2>Conecta tu cuenta gratis de Cloudflare</h2>
        {!showWizard && (
          <button className="btn ghost small" onClick={() => setShowWizard(true)}>
            Abrir asistente
          </button>
        )}
      </div>
      {settings.cfAccountId && settings.cfToken ? (
        <p className="ok" style={{ marginTop: 0 }}>Tu cuenta de Cloudflare está conectada.</p>
      ) : (
        <p className="hint" style={{ marginTop: 0 }}>
          Con tu cuenta gratis tienes uso diario de IA sin los límites del modo demo{demo ? "" : " (necesaria para crear con IA)"}.
        </p>
      )}
      {showWizard && (
        <CloudflareWizard
          settings={settings}
          onSave={(n) => (onSave(n), setS(n))}
          onFinish={() => (setShowWizard(false), onFinish())}
        />
      )}
    </section>
    <section className="card">
      <h2>Configuración avanzada</h2>
      <p className="hint">
        Cada persona usa sus propias claves. Se guardan únicamente en este navegador y en cada pedido pasan por el
        servidor de la plataforma hacia el proveedor, sin guardarse ni registrarse.
      </p>
      <h2 style={{ marginTop: 28 }}>Textos</h2>
      <label>Proveedor de textos</label>
      <select
        value={s.textProvider}
        onChange={(e) => (setS({ ...s, textProvider: e.target.value as Settings["textProvider"] }), setSaved(false))}
      >
        <option value="cloudflare">Cloudflare Workers AI — gratis (límite diario)</option>
        <option value="anthropic">Claude de Anthropic — de pago, máxima calidad</option>
      </select>
      {s.textProvider === "anthropic" && (
        <>
          <label>Clave de Anthropic — console.anthropic.com</label>
          <input type="password" {...f("anthropicKey")} placeholder="sk-ant-…" autoComplete="off" />
        </>
      )}

      <h2 style={{ marginTop: 28 }}>Imágenes</h2>
      <label>Proveedor de imágenes</label>
      <select
        value={s.imageProvider}
        onChange={(e) => (setS({ ...s, imageProvider: e.target.value as Settings["imageProvider"] }), setSaved(false))}
      >
        <option value="cloudflare">Cloudflare Workers AI — gratis (límite diario)</option>
        <option value="replicate">Replicate — de pago, más modelos</option>
      </select>

      {(s.textProvider === "cloudflare" || s.imageProvider === "cloudflare") && (
        <>
          <h2 style={{ marginTop: 28 }}>Cloudflare (gratis)</h2>
          <p className="hint">
            Los mismos datos sirven para textos e imágenes. En dash.cloudflare.com entra a AI → Workers AI → «Use REST
            API»: ahí copias tu Account ID y creas un token de Workers AI. El límite gratuito diario se comparte entre
            textos e imágenes.
          </p>
          <div className="row">
            <div>
              <label>Account ID de Cloudflare</label>
              <input {...f("cfAccountId")} placeholder="32 caracteres" autoComplete="off" />
            </div>
            <div>
              <label>Token de API de Cloudflare</label>
              <input type="password" {...f("cfToken")} placeholder="Token de Workers AI" autoComplete="off" />
            </div>
          </div>
          <div className="actions">
            <button
              className="btn ghost small"
              disabled={testing || !s.cfAccountId || !s.cfToken}
              onClick={async () => {
                setTesting(true);
                setChecks(null);
                try {
                  setChecks((await testCloudflare(s.cfAccountId, s.cfToken)).checks);
                } finally {
                  setTesting(false);
                }
              }}
            >
              <Plug size={16} aria-hidden /> {testing ? "Probando…" : "Probar conexión"}
            </button>
          </div>
          {checks && <CheckList checks={checks} />}
        </>
      )}

      <h2 style={{ marginTop: 28 }}>Videos</h2>
      <label>
        Clave de Replicate (videos{s.imageProvider === "replicate" ? " e imágenes" : ""}) —
        replicate.com/account/api-tokens
      </label>
      <input type="password" {...f("replicateKey")} placeholder="r8_…" autoComplete="off" />

      <h2 style={{ marginTop: 28 }}>Modelos</h2>
      <p className="hint">
        Puedes cambiar de modelo escribiendo su nombre tal como aparece en replicate.com o en el catálogo de Workers AI
        de Cloudflare (empiezan con @cf/).
      </p>
      <div className="row">
        <div>
          <label>Modelo de texto (Cloudflare)</label>
          <input {...f("cfTextModel")} />
        </div>
        <div>
          <label>Modelo de texto (Anthropic)</label>
          <input {...f("textModel")} />
        </div>
        <div>
          <label>Modelo de imagen (Cloudflare)</label>
          <input {...f("cfImageModel")} />
        </div>
        <div>
          <label>Imagen con fotos (Cloudflare)</label>
          <input {...f("cfRefModel")} />
        </div>
        <div>
          <label>Modelo de imagen (Replicate)</label>
          <input {...f("imageModel")} />
        </div>
        <div>
          <label>Imagen con foto (Replicate)</label>
          <input {...f("editModel")} />
        </div>
        <div>
          <label>Modelo de video</label>
          <input {...f("videoModel")} />
        </div>
      </div>
      <button className="btn" onClick={() => (onSave(s), setSaved(true))}>
        Guardar configuración
      </button>
      {saved && <div className="ok">Configuración guardada.</div>}
    </section>
    </>
  );
}
