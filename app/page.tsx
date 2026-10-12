"use client";

import { useEffect, useState } from "react";
import { Brand, brandContext, brandVisual, emptyBrand } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { fileToResizedDataUrl } from "@/lib/resize";

type Tab = "texto" | "imagen" | "video" | "galeria" | "marca" | "config";

type Settings = {
  anthropicKey: string;
  textProvider: "cloudflare" | "anthropic";
  cfTextModel: string;
  replicateKey: string;
  imageProvider: "cloudflare" | "replicate";
  cfAccountId: string;
  cfToken: string;
  cfImageModel: string;
  cfRefModel: string;
  editModel: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
};

type Item = { kind: "imagen" | "video"; url: string; prompt: string; date: string };

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

// Las imágenes de Cloudflare llegan como datos dentro de la página (pesan más),
// así que la galería guarda solo las más recientes para no llenar el navegador.
function trimGallery(items: Item[]): Item[] {
  let embedded = 0;
  return items.slice(0, 100).filter((it) => {
    if (!it.url.startsWith("data:")) return true;
    embedded++;
    return embedded <= 8;
  });
}

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
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible */
  }
}

function extract(text: string, label: string): string {
  const m = text.match(new RegExp(`${label}:?\\**\\s*(.+)`, "i"));
  return m ? m[1].replace(/\*+/g, "").trim() : "";
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("texto");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [brand, setBrand] = useState<Brand>(emptyBrand);
  const [gallery, setGallery] = useState<Item[]>([]);
  const [imagePrompt, setImagePrompt] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(load("its-settings", defaultSettings));
    setBrand(load("its-brand", emptyBrand));
    setGallery(loadList<Item>("its-gallery"));
    // Accesos directos de la app instalada (?tab=imagen, etc.)
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && ["texto", "imagen", "video", "galeria", "marca", "config"].includes(t)) setTab(t as Tab);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) save("its-gallery", trimGallery(gallery));
  }, [gallery, ready]);

  const addToGallery = (items: Item[]) => setGallery((g) => [...items, ...g]);
  const imageKeysMissing =
    settings.imageProvider === "cloudflare" ? !settings.cfAccountId || !settings.cfToken : !settings.replicateKey;
  const usesCf = settings.textProvider === "cloudflare" || settings.imageProvider === "cloudflare";
  const textKeysMissing = settings.textProvider === "anthropic" && !settings.anthropicKey;
  const missingKeys = ready && (textKeysMissing || imageKeysMissing || (usesCf && (!settings.cfAccountId || !settings.cfToken)));

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <img src="/icons/icon-192.png" alt="InnovationTECH" />
          <div>
            <div className="logo">
              Innovation<span>TECH</span> Studio
            </div>
            <div className="tag">Textos, imágenes y videos de marketing con IA · Open source</div>
          </div>
        </div>
      </header>

      <nav className="tabs">
        {(
          [
            ["texto", "✍️ Textos"],
            ["imagen", "🖼️ Imágenes"],
            ["video", "🎬 Videos"],
            ["galeria", "📁 Galería"],
            ["marca", "🎨 Mi marca"],
            ["config", "⚙️ Configuración"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {missingKeys && tab !== "config" && (
        <div className="notice" style={{ marginBottom: 16 }}>
          Para empezar, agrega tus claves de API en{" "}
          <a href="#" onClick={(e) => (e.preventDefault(), setTab("config"))} style={{ color: "#fff" }}>
            Configuración
          </a>
          .
        </div>
      )}

      {tab === "texto" && (
        <TextStudio
          settings={settings}
          brand={brand}
          onUseImage={(p) => (setImagePrompt(p), setTab("imagen"))}
          onUseVideo={(p) => (setVideoPrompt(p), setTab("video"))}
        />
      )}
      {tab === "imagen" && (
        <ImageStudio
          settings={settings}
          brand={brand}
          prompt={imagePrompt}
          setPrompt={setImagePrompt}
          onDone={addToGallery}
          onAnimate={(url, p) => {
            setVideoPrompt(p);
            setTab("video");
            sessionStorage.setItem("its-first-frame", url);
          }}
        />
      )}
      {tab === "video" && (
        <VideoStudio
          settings={settings}
          brand={brand}
          prompt={videoPrompt}
          setPrompt={setVideoPrompt}
          onDone={addToGallery}
        />
      )}
      {tab === "galeria" && <Gallery items={gallery} onClear={() => setGallery([])} />}
      {tab === "marca" && (
        <BrandKit
          brand={brand}
          onSave={(b) => {
            setBrand(b);
            save("its-brand", b);
          }}
        />
      )}
      {tab === "config" && (
        <Config
          settings={settings}
          onSave={(s) => {
            setSettings(s);
            save("its-settings", s);
          }}
        />
      )}

      <footer>
        Proyecto open source de InnovationTECH · Licencia MIT · Tus claves se guardan solo en tu navegador.
      </footer>
    </div>
  );
}

/* ---------------- Textos ---------------- */

function TextStudio({
  settings,
  brand,
  onUseImage,
  onUseVideo,
}: {
  settings: Settings;
  brand: Brand;
  onUseImage: (p: string) => void;
  onUseVideo: (p: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [result, setResult] = useState("");
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
      <h2>Crear textos de marketing</h2>
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
      <label>¿Qué quieres publicar?</label>
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
                Crear la imagen →
              </button>
            )}
            {vidP && (
              <button className="btn small" onClick={() => onUseVideo(vidP)}>
                Crear el video →
              </button>
            )}
          </div>
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
}: {
  settings: Settings;
  brand: Brand;
  prompt: string;
  setPrompt: (p: string) => void;
  onDone: (items: Item[]) => void;
  onAnimate: (url: string, prompt: string) => void;
}) {
  const [ratio, setRatio] = useState("1:1");
  const [count, setCount] = useState(1);
  const [useBrand, setUseBrand] = useState(true);
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

  async function generate() {
    setLoading(true);
    setError("");
    setUrls([]);
    const full = prompt + (useBrand ? brandVisual(brand) : "");
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
          references: refs.slice(0, maxRefs),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUrls(data.urls);
      const date = new Date().toISOString();
      onDone(data.urls.map((url: string) => ({ kind: "imagen", url, prompt, date })));
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  return (
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
      <button className="btn" disabled={loading || !prompt} onClick={generate}>
        {loading ? "Generando… (hasta 1 min)" : "Generar imagen"}
      </button>
      {error && <div className="error">{error}</div>}
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
                <a href="#" onClick={(e) => (e.preventDefault(), onAnimate(u, prompt))}>
                  Animar en video
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- Videos ---------------- */

function VideoStudio({
  settings,
  brand,
  prompt,
  setPrompt,
  onDone,
}: {
  settings: Settings;
  brand: Brand;
  prompt: string;
  setPrompt: (p: string) => void;
  onDone: (items: Item[]) => void;
}) {
  const [firstFrame, setFirstFrame] = useState("");
  const [status, setStatus] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const f = sessionStorage.getItem("its-first-frame");
      if (f) {
        setFirstFrame(f);
        sessionStorage.removeItem("its-first-frame");
      }
    } catch {
      /* nada */
    }
  }, []);

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

function Gallery({ items, onClear }: { items: Item[]; onClear: () => void }) {
  return (
    <section className="card">
      <h2>Galería</h2>
      <p className="hint">
        Tus últimas creaciones. Los enlaces de Replicate caducan después de un tiempo: descarga lo que quieras conservar.
      </p>
      {items.length === 0 && <div className="notice">Aún no has creado nada.</div>}
      <div className="grid">
        {items.map((it, i) => (
          <div className="media" key={it.url + i}>
            {it.kind === "imagen" ? <img src={it.url} alt={it.prompt} /> : <video src={it.url} controls playsInline />}
            <div className="meta">
              {it.prompt.slice(0, 90)}
              <br />
              <a href={it.url} target={it.url.startsWith("data:") ? undefined : "_blank"} rel="noreferrer" download={`innovationtech-${it.kind}`}>
                Descargar
              </a>{" "}
              · {new Date(it.date).toLocaleString("es-MX")}
            </div>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <button className="btn ghost small" onClick={onClear}>
          Vaciar galería
        </button>
      )}
    </section>
  );
}

/* ---------------- Kit de marca ---------------- */

function BrandKit({ brand, onSave }: { brand: Brand; onSave: (b: Brand) => void }) {
  const [b, setB] = useState(brand);
  const [saved, setSaved] = useState(false);
  useEffect(() => setB(brand), [brand]);
  const f = (k: keyof Brand) => ({
    value: b[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => (setB({ ...b, [k]: e.target.value }), setSaved(false)),
  });

  return (
    <section className="card">
      <h2>Mi marca</h2>
      <p className="hint">La IA usa estos datos en cada texto, imagen y video para que todo salga con tu identidad.</p>
      <div className="row">
        <div>
          <label>Nombre del negocio</label>
          <input {...f("name")} placeholder="Ej.: Tortas Tortuga" />
        </div>
        <div>
          <label>Giro</label>
          <input {...f("industry")} placeholder="Ej.: restaurante de tortas mexicanas" />
        </div>
      </div>
      <div className="row">
        <div>
          <label>Público objetivo</label>
          <input {...f("audience")} placeholder="Ej.: familias y estudiantes" />
        </div>
        <div>
          <label>Tono de voz</label>
          <input {...f("tone")} placeholder="Ej.: divertido, cercano, con humor" />
        </div>
      </div>
      <label>Colores de marca</label>
      <input {...f("colors")} placeholder="Ej.: dark navy blue and red" />
      <label>Notas adicionales</label>
      <textarea {...f("extra")} placeholder="Promociones fijas, palabras que sí o no usar, etc." />
      <button className="btn" onClick={() => (onSave(b), setSaved(true))}>
        Guardar marca
      </button>
      {saved && <div className="ok">Marca guardada.</div>}
    </section>
  );
}

/* ---------------- Configuración ---------------- */

function Config({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setS(settings), [settings]);
  const f = (k: keyof Settings) => ({
    value: s[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => (setS({ ...s, [k]: e.target.value.trim() }), setSaved(false)),
  });

  return (
    <section className="card">
      <h2>Configuración</h2>
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
  );
}
