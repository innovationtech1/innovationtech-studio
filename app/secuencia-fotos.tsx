"use client";

// «Crear secuencia de fotos» (pestaña Videos): la IA propone de 3 a 8 fotos distintas que cuentan una
// historia en orden, se crean una por una con /api/image y «Hacer el video con NOVA» las manda al
// Creador de Reels. Las fotos se guardan en el aparato (IndexedDB) para que no se pierdan al recargar;
// en el borrador solo va el id de cada foto. Funciones puras en lib/secuencia-pantalla.ts.

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Clapperboard, Download, Images, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Brand, brandContext, brandVisual } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { tr } from "@/lib/i18n";
import { deleteFile, getFile, newId, putFile, toBlob } from "@/lib/media-store";
import { usePersistentState } from "@/lib/persist";
import type { ReelFormat } from "@/lib/reel";
import { ESTILOS_FOTO, MAX_FOTOS, MIN_FOTOS, MAX_MOMENTO, type IdeaFoto } from "@/lib/secuencia";
import {
  AVISO_SIN_GUARDAR,
  MIN_FOTOS_VIDEO,
  agregarIdea,
  fotosParaVideo,
  moverIdea,
  promptDeFoto,
  quedanDe,
  quitarIdea,
  textoConfirmarFotos,
  textoProgreso,
  type IdeaSecuencia,
} from "@/lib/secuencia-pantalla";
import type { Item, Settings } from "@/lib/types";
import { refrescarCuenta, useCuenta } from "./account-context";
import CompartirBotones from "./compartir-botones";

type Actual = { tema: string; titulo: string; ideas: IdeaSecuencia[] };
const VACIA: Actual = { tema: "", titulo: "", ideas: [] };

export type SecuenciaParaVideo = { tema: string; momentos: string[]; fotos: string[]; formato: ReelFormat };

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

const extension = (url: string) => {
  const m = url.match(/^data:image\/(\w+)/);
  return m ? (m[1] === "jpeg" ? "jpg" : m[1]) : "jpg";
};

export default function SecuenciaFotos({
  settings,
  brand,
  onImages,
  onHacerVideo,
}: {
  settings: Settings;
  brand: Brand;
  onImages: (items: Item[]) => void;
  onHacerVideo: (s: SecuenciaParaVideo) => void;
}) {
  const [actual, setActual] = usePersistentState<Actual>("secuencia:actual", VACIA);
  const [cantidad, setCantidad] = usePersistentState("secuencia:cantidad", 5);
  const [estilo, setEstilo] = usePersistentState<string>("secuencia:estilo", ESTILOS_FOTO[0].id);
  const [formato, setFormato] = usePersistentState<ReelFormat>("secuencia:formato", "9:16");
  // Fotos cargadas en memoria: id de la foto → enlace (data: o https)
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [detalle, setDetalle] = useState<string | null>(null); // idea con la descripción en inglés abierta
  const [ocupado, setOcupado] = useState(""); // texto de lo que se está haciendo
  const [cargando, setCargando] = useState<string | null>(null); // idea cuya foto se está creando
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const pedidas = useRef(new Set<string>());

  const { tema, ideas } = actual;
  const { activo, cuenta } = useCuenta();
  const quedan = activo && cuenta && "limites" in cuenta ? quedanDe(cuenta, "imagenes") : undefined;
  const cfHeaders = { "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken };

  const cambiar = (cambios: Partial<Actual>) => setActual((a) => ({ ...a, ...cambios }));
  const cambiarIdea = (id: string, cambios: Partial<IdeaSecuencia>) =>
    setActual((a) => ({ ...a, ideas: a.ideas.map((x) => (x.id === id ? { ...x, ...cambios } : x)) }));
  const olvidar = (fotoId?: string) => {
    if (!fotoId) return;
    void deleteFile(fotoId).catch(() => {});
    setUrls((u) => {
      const resto = { ...u };
      delete resto[fotoId];
      return resto;
    });
  };

  // La foto guardada ya no está (o no se puede leer): la idea queda con «Rehacer» y «Crear las fotos» la vuelve a crear
  const sinFoto = (id: string) =>
    setActual((a) => ({ ...a, ideas: a.ideas.map((x) => (x.foto === id ? { ...x, foto: undefined, fallo: true } : x)) }));

  // Al volver (o recargar), las fotos guardadas en el aparato se cargan otra vez
  useEffect(() => {
    for (const idea of ideas) {
      const id = idea.foto;
      if (!id || urls[id] || pedidas.current.has(id)) continue;
      pedidas.current.add(id);
      getFile(id)
        .then(async (blob) => {
          if (blob) {
            const url = await blobToDataUrl(blob);
            setUrls((u) => ({ ...u, [id]: url }));
          } else sinFoto(id); // se borró del aparato
        })
        .catch(() => {
          // No se pudo leer: se quita (si no, se quedaría «cargando» para siempre)
          void deleteFile(id).catch(() => {});
          sinFoto(id);
        });
    }
  }, [ideas, urls, setActual]);

  const conFoto = ideas.filter((x) => x.foto).length;
  const listas = fotosParaVideo(ideas, urls);

  async function crearIdeas() {
    setError("");
    setAviso("");
    if (!tema.trim()) return setError("Escribe de qué trata la historia.");
    if (conFoto > 0 && !confirm(tr("¿Crear ideas nuevas? Se reemplazan las ideas y las fotos de aquí (las de la Galería se quedan)."))) return;
    setOcupado("Creando las ideas…");
    try {
      const res = await fetch("/api/text", {
        method: "POST",
        headers:
          settings.textProvider === "cloudflare"
            ? { "content-type": "application/json", ...cfHeaders }
            : { "content-type": "application/json", "x-anthropic-key": settings.anthropicKey },
        body: JSON.stringify({
          mode: "secuencia",
          prompt: tema,
          n: cantidad,
          estilo,
          brand: brandContext(brand),
          provider: settings.textProvider,
          model: settings.textProvider === "cloudflare" ? settings.cfTextModel : settings.textModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const fotos = (data.fotos ?? []) as IdeaFoto[];
      ideas.forEach((x) => olvidar(x.foto));
      setActual((a) => ({
        ...a,
        titulo: String(data.titulo ?? ""),
        ideas: fotos.map((f) => ({ id: newId(), momento: f.momento, prompt: f.prompt })),
      }));
      setDetalle(null);
      void refrescarCuenta();
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setOcupado("");
    }
  }

  // Crea la foto de una idea: «ok», «fallo» (la idea queda con «Rehacer») o «parar» (sin sesión, sin plan
  // o sin límite: las que siguen fallarían igual, así que no se piden).
  async function hacerFoto(idea: IdeaSecuencia): Promise<"ok" | "fallo" | "parar"> {
    const prompt = promptDeFoto(idea, tema, estilo);
    setCargando(idea.id);
    cambiarIdea(idea.id, { fallo: false });
    try {
      const cf = settings.imageProvider === "cloudflare";
      const res = await fetch("/api/image", {
        method: "POST",
        headers: cf
          ? { "content-type": "application/json", ...cfHeaders }
          : { "content-type": "application/json", "x-replicate-key": settings.replicateKey },
        body: JSON.stringify({
          prompt: prompt + brandVisual(brand),
          aspectRatio: formato,
          count: 1,
          provider: settings.imageProvider,
          model: cf ? settings.cfImageModel : settings.imageModel,
          refModel: settings.cfRefModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status });
      const url: string = data.urls[0];
      // Ya se cobró: desde aquí la foto se queda aunque no se pueda guardar en el aparato
      const fotoId = newId();
      setUrls((u) => ({ ...u, [fotoId]: url }));
      pedidas.current.add(fotoId);
      cambiarIdea(idea.id, { foto: fotoId, fallo: false });
      olvidar(idea.foto); // la de antes (con «Rehacer»)
      onImages([{ kind: "imagen", url, prompt: idea.momento.trim() || prompt, date: new Date().toISOString() }]);
      void toBlob(url)
        .then((b) => {
          if (!b) throw new Error("sin_leer");
          return putFile(fotoId, b);
        })
        .catch(() => setAviso(AVISO_SIN_GUARDAR));
      void refrescarCuenta();
      return "ok";
    } catch (e) {
      cambiarIdea(idea.id, { fallo: true });
      setError(friendlyError((e as Error).message));
      const status = (e as { status?: number }).status;
      // Un 4xx (sin sesión, sin plan, sin límite, pedido rechazado) fallaría igual en las que siguen
      return typeof status === "number" && status >= 400 && status < 500 ? "parar" : "fallo";
    } finally {
      setCargando(null);
    }
  }

  async function crearFotos() {
    setError("");
    setAviso("");
    const faltan = ideas.filter((x) => !x.foto);
    if (!faltan.length) return setAviso("Todas las fotos ya están creadas.");
    if (faltan.some((x) => !promptDeFoto(x, tema, estilo))) return setError("Escribe el momento o la descripción de esta foto.");
    if (!confirm(tr(textoConfirmarFotos(faltan.length, quedan)))) return;
    let fallas = 0;
    try {
      // Una por una: cada foto aparece en cuanto llega
      for (let k = 0; k < faltan.length; k++) {
        setOcupado(textoProgreso(k + 1, faltan.length));
        const r = await hacerFoto(faltan[k]);
        if (r === "parar") return;
        if (r === "fallo") fallas++;
      }
    } finally {
      setOcupado("");
    }
    if (fallas) setAviso("Algunas fotos no se pudieron crear. Toca «Rehacer» en cada una.");
  }

  async function rehacer(idea: IdeaSecuencia) {
    setError("");
    setAviso("");
    if (!promptDeFoto(idea, tema, estilo)) return setError("Escribe el momento o la descripción de esta foto.");
    if (!confirm(tr(textoConfirmarFotos(1, quedan)))) return;
    setOcupado(textoProgreso(1, 1));
    try {
      await hacerFoto(idea);
    } finally {
      setOcupado("");
    }
  }

  function quitar(i: number) {
    const idea = ideas[i];
    const nuevas = quitarIdea(ideas, i);
    if (nuevas === ideas) return;
    olvidar(idea.foto);
    cambiar({ ideas: nuevas });
  }

  function nueva() {
    if (conFoto > 0 && !confirm(tr("¿Empezar una secuencia nueva? Se borran la historia, las ideas y las fotos de aquí (las de la Galería se quedan)."))) return;
    ideas.forEach((x) => olvidar(x.foto));
    setActual(VACIA);
    setError("");
    setAviso("");
    setDetalle(null);
  }

  function hacerVideo() {
    if (listas.fotos.length < MIN_FOTOS_VIDEO) return setError("Crea al menos 2 fotos para hacer el video.");
    onHacerVideo({ tema: tema.trim() || actual.titulo, momentos: listas.momentos, fotos: listas.fotos, formato });
  }

  const enCurso = !!ocupado;
  const proporcion = formato === "9:16" ? "9 / 16" : formato === "1:1" ? "1 / 1" : "16 / 9";

  return (
    <section className="card secuencia">
      <h2>
        <Images size={20} aria-hidden /> Crear secuencia de fotos
      </h2>
      <p className="hint">La IA crea de 3 a 8 fotos distintas que cuentan tu historia en orden. Después NOVA arma el video con voz.</p>

      <label htmlFor="sec-tema">¿De qué trata la historia?</label>
      <textarea
        id="sec-tema"
        value={tema}
        onChange={(e) => cambiar({ tema: e.target.value })}
        placeholder="Ej.: un día en mi taquería, desde que llega la carne hasta que el cliente prueba su torta"
        disabled={enCurso}
      />

      <div className="sec-opciones">
        <div>
          <label htmlFor="sec-cantidad">Cuántas fotos</label>
          <select id="sec-cantidad" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} disabled={enCurso}>
            {Array.from({ length: MAX_FOTOS - MIN_FOTOS + 1 }, (_, i) => MIN_FOTOS + i).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sec-formato">Formato</label>
          <select id="sec-formato" value={formato} onChange={(e) => setFormato(e.target.value as ReelFormat)} disabled={enCurso}>
            <option value="9:16">Vertical 9:16 (Reels, TikTok, Historias)</option>
            <option value="1:1">Cuadrado 1:1 (feed)</option>
            <option value="16:9">Horizontal 16:9 (YouTube, web)</option>
          </select>
        </div>
      </div>
      <label id="sec-estilo">Estilo</label>
      <div className="seg" role="radiogroup" aria-labelledby="sec-estilo">
        {ESTILOS_FOTO.map((e) => (
          <button key={e.id} role="radio" aria-checked={estilo === e.id} className={estilo === e.id ? "active" : ""} onClick={() => setEstilo(e.id)} disabled={enCurso}>
            {e.nombre}
          </button>
        ))}
      </div>

      <div className="actions">
        <button className="btn" onClick={crearIdeas} disabled={enCurso}>
          {ocupado === "Creando las ideas…" ? <Loader2 size={16} className="spin" aria-hidden /> : <Sparkles size={16} aria-hidden />} Crear ideas
        </button>
        {(ideas.length > 0 || tema) && (
          <button className="btn ghost" onClick={nueva} disabled={enCurso}>
            Nueva secuencia
          </button>
        )}
      </div>

      {ideas.length > 0 && (
        <>
          <h3 className="step">
            Momentos de la historia{actual.titulo ? <span className="muted"> · {actual.titulo}</span> : null}
          </h3>
          <ol className="sec-lista">
            {ideas.map((idea, i) => {
              const url = idea.foto ? urls[idea.foto] : "";
              const abierto = detalle === idea.id;
              return (
                <li key={idea.id} className="sec-idea">
                  <div className="sec-cabeza">
                    <span className="sec-num" aria-hidden>
                      {i + 1}
                    </span>
                    <input
                      aria-label="Momento"
                      value={idea.momento}
                      maxLength={MAX_MOMENTO}
                      onChange={(e) => cambiarIdea(idea.id, { momento: e.target.value })}
                      disabled={enCurso}
                    />
                  </div>
                  <div className="sec-foto" style={{ aspectRatio: proporcion }}>
                    {url ? (
                      <img src={url} alt={idea.momento} />
                    ) : cargando === idea.id || (idea.foto && !url) ? (
                      <Loader2 size={22} className="spin" aria-hidden />
                    ) : idea.fallo ? (
                      <span className="muted">No se pudo crear esta foto.</span>
                    ) : (
                      <Images size={22} aria-hidden className="muted" />
                    )}
                  </div>
                  <div className="actions sec-botones">
                    <button className="btn ghost small" title="Subir" aria-label="Subir" onClick={() => cambiar({ ideas: moverIdea(ideas, i, -1) })} disabled={enCurso || i === 0}>
                      <ArrowUp size={16} aria-hidden />
                    </button>
                    <button className="btn ghost small" title="Bajar" aria-label="Bajar" onClick={() => cambiar({ ideas: moverIdea(ideas, i, 1) })} disabled={enCurso || i === ideas.length - 1}>
                      <ArrowDown size={16} aria-hidden />
                    </button>
                    <button className="btn ghost small" title="Quitar" aria-label="Quitar" onClick={() => quitar(i)} disabled={enCurso || ideas.length <= 1}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                    {(url || idea.fallo) && (
                      <button className="btn ghost small" onClick={() => rehacer(idea)} disabled={enCurso}>
                        <RefreshCw size={16} aria-hidden /> Rehacer
                      </button>
                    )}
                    <button className="btn ghost small" aria-expanded={abierto} onClick={() => setDetalle(abierto ? null : idea.id)}>
                      {abierto ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />} {abierto ? "Ocultar detalle" : "Ver detalle"}
                    </button>
                  </div>
                  {abierto && (
                    <>
                      <label htmlFor={`sec-prompt-${idea.id}`}>Descripción de la foto (en inglés)</label>
                      <textarea
                        id={`sec-prompt-${idea.id}`}
                        value={idea.prompt}
                        onChange={(e) => cambiarIdea(idea.id, { prompt: e.target.value })}
                        disabled={enCurso}
                      />
                    </>
                  )}
                  {url && (
                    <div className="actions">
                      <a className="btn ghost small" href={url} download={`secuencia-${i + 1}.${extension(url)}`}>
                        <Download size={16} aria-hidden /> Descargar
                      </a>
                      <CompartirBotones key={url} compacto src={url} nombre={`secuencia-${i + 1}.${extension(url)}`} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="actions">
            <button
              className="btn ghost"
              onClick={() => cambiar({ ideas: agregarIdea(ideas, { id: newId(), momento: "", prompt: "" }) })}
              disabled={enCurso || ideas.length >= MAX_FOTOS}
            >
              <Plus size={16} aria-hidden /> Agregar momento
            </button>
            <button className="btn" onClick={crearFotos} disabled={enCurso}>
              {enCurso && ocupado !== "Creando las ideas…" ? <Loader2 size={16} className="spin" aria-hidden /> : <Images size={16} aria-hidden />} Crear las fotos
            </button>
          </div>
        </>
      )}

      {ocupado && (
        <p className="muted" role="status" aria-live="polite">
          {ocupado}
        </p>
      )}
      {aviso && <div className="notice">{aviso}</div>}
      {error && <div className="error">{error}</div>}

      {ideas.length > 0 && (
        <div className="sec-pie">
          <button className="btn" onClick={hacerVideo} disabled={enCurso || listas.fotos.length < MIN_FOTOS_VIDEO}>
            <Clapperboard size={16} aria-hidden /> Hacer el video con NOVA
          </button>
          {listas.fotos.length < MIN_FOTOS_VIDEO && <p className="muted">Crea al menos 2 fotos para hacer el video.</p>}
        </div>
      )}
    </section>
  );
}
