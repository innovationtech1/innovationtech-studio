"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Download, ImagePlus, Plus, Save, Share2, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { Brand, brandContext } from "@/lib/brand";
import { buildSlideDoc, CAROUSEL_STYLES, CarouselFormat, CarouselStyle, Slide } from "@/lib/carousel";
import type { Doc } from "@/lib/editor-model";
import { friendlyError } from "@/lib/errors";
import { usePersistentState } from "@/lib/persist";
import { fileToResizedDataUrl } from "@/lib/resize";
import { loadTemplateFonts } from "@/lib/templates";
import { brandFont } from "@/lib/editor-model";
import { tr } from "@/lib/i18n";
import type { Item, Settings } from "@/lib/types";
import { renderDocImage } from "./image-editor";
import MicButton from "./mic-button";

// Carrusel de Instagram: la IA escribe la portada, los puntos y el cierre;
// la app los diseña con tu marca y los descargas juntos, listos para publicar.

const sid = () => Math.random().toString(36).slice(2, 9);

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(tr("La imagen no se pudo abrir.")));
    im.src = src;
  });

const blank = (n: number): Slide[] =>
  Array.from({ length: n }, (_, i) => ({
    id: sid(),
    title: i === 0 ? tr("Tu gancho aquí") : i === n - 1 ? tr("¿Te ayudamos?") : tr("Punto importante"),
    body: i === 0 ? tr("Desliza para descubrirlo") : i === n - 1 ? tr("Escríbenos y te damos más información.") : tr("Explica aquí este punto en una o dos frases."),
  }));

const slideLabel = (i: number, n: number) => (i === 0 ? "Portada" : i === n - 1 ? "Cierre" : `Punto ${i}`);

export default function CarouselStudio({
  settings,
  brand,
  onSave,
  onEditSlide,
  slideUpdate,
}: {
  settings: Settings;
  brand: Brand;
  onSave: (items: Item[]) => void;
  onEditSlide: (doc: Doc, index: number) => void;
  slideUpdate: { slide: number; url: string; n: number } | null;
}) {
  const [topic, setTopic] = usePersistentState("carrusel:tema", "");
  const [count, setCount] = usePersistentState("carrusel:cantidad", 7);
  const [format, setFormat] = usePersistentState<CarouselFormat>("carrusel:formato", "4:5");
  const [style, setStyle] = usePersistentState<CarouselStyle>("carrusel:estilo", "oscuro");
  // Si no caben las fotos en el navegador, se guardan solo los textos.
  const [slides, setSlides] = usePersistentState<Slide[]>("carrusel:diapositivas", [], (list) =>
    list.map(({ photo, photoSize, edited, ...rest }) => (void photo, void photoSize, void edited, rest))
  );
  const [caption, setCaption] = usePersistentState("carrusel:texto", "");
  const [coverPrompt, setCoverPrompt] = usePersistentState("carrusel:foto-portada", "");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [copied, setCopied] = useState(false);
  const [logo, setLogo] = useState<{ src: string; w: number; h: number } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const fileFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Logo y letras de la marca (hacen falta para medir y dibujar los textos)
  useEffect(() => {
    let off = false;
    (async () => {
      await loadTemplateFonts(["Montserrat", brandFont(brand)]);
      if (!off) setFontsReady(true);
      if (!brand.logo) return setLogo(null);
      const im = await loadImage(brand.logo).catch(() => null);
      if (!off) setLogo(im ? { src: brand.logo, w: im.naturalWidth, h: im.naturalHeight } : null);
    })();
    return () => {
      off = true;
    };
  }, [brand.logo, brand.font]);

  const opts = { style, format, brand, logo };
  const docFor = (i: number) => buildSlideDoc(slides[i], i, slides.length, opts);

  // Vistas previas: se vuelven a dibujar al cambiar textos, estilo o marca.
  const previewKey = JSON.stringify([slides, style, format, brand.palette, brand.font, brand.name, brand.contact, !!logo, fontsReady]);
  useEffect(() => {
    if (!slides.length || !fontsReady) return;
    let off = false;
    const t = setTimeout(async () => {
      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const url = s.edited || (await renderDocImage(buildSlideDoc(s, i, slides.length, opts), { width: 420, quality: 0.82 }).catch(() => ""));
        if (off) return;
        setThumbs((m) => (m[s.id] === url ? m : { ...m, [s.id]: url }));
      }
    }, 250);
    return () => {
      off = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  // La diapositiva vuelve del editor ya terminada.
  useEffect(() => {
    if (!slideUpdate) return;
    setSlides((list) => list.map((s, j) => (j === slideUpdate.slide ? { ...s, edited: slideUpdate.url } : s)));
    setDone(`Diapositiva ${slideUpdate.slide + 1} actualizada con tus ajustes del editor.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideUpdate]);

  const headers: Record<string, string> =
    settings.textProvider === "cloudflare"
      ? { "content-type": "application/json", "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken }
      : { "content-type": "application/json", "x-anthropic-key": settings.anthropicKey };

  async function generate() {
    setError("");
    setDone("");
    setBusy("La IA está escribiendo tu carrusel…");
    try {
      const res = await fetch("/api/text", {
        method: "POST",
        headers,
        body: JSON.stringify({
          mode: "carousel",
          prompt: topic,
          scenes: count,
          platform: "Instagram",
          brand: brandContext(brand),
          provider: settings.textProvider,
          model: settings.textProvider === "cloudflare" ? settings.cfTextModel : settings.textModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const next: Slide[] = (data.slides as { title: string; body: string }[]).map((s) => ({ id: sid(), title: s.title, body: s.body }));
      setThumbs({});
      setSlides(next);
      setCaption(data.caption || "");
      setCoverPrompt(data.coverImagePrompt || "");
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setBusy("");
    }
  }

  const update = (id: string, patch: Partial<Slide>) =>
    setSlides((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        // Si cambian los textos, se vuelve al diseño automático (la versión del editor ya no coincide).
        const textChanged = ("title" in patch && patch.title !== s.title) || ("body" in patch && patch.body !== s.body);
        return { ...s, ...patch, ...(textChanged ? { edited: undefined } : {}) };
      })
    );
  const move = (i: number, d: -1 | 1) =>
    setSlides((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy.map((s) => ({ ...s, edited: undefined })); // cambian el número y la barra de avance
    });
  const remove = (i: number) => setSlides((list) => list.filter((_, j) => j !== i).map((s) => ({ ...s, edited: undefined })));
  const addSlide = () =>
    setSlides((list) => {
      const at = Math.max(1, list.length - 1);
      const copy: Slide[] = list.map((s) => ({ ...s, edited: undefined }));
      copy.splice(at, 0, { id: sid(), title: tr("Nuevo punto"), body: tr("Explica aquí este punto en una o dos frases.") });
      return copy;
    });

  async function setPhotoFrom(id: string, src: string) {
    const im = await loadImage(src);
    update(id, { photo: src, photoSize: [im.naturalWidth, im.naturalHeight], edited: undefined });
  }

  async function onFile(file: File | undefined) {
    const id = fileFor.current;
    if (!file || !id) return;
    setPhotoBusy(id);
    try {
      await setPhotoFrom(id, await fileToResizedDataUrl(file, 1600));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(null);
    }
  }

  async function aiPhoto(i: number) {
    const s = slides[i];
    setError("");
    setPhotoBusy(s.id);
    const cf = settings.imageProvider === "cloudflare";
    const prompt =
      i === 0 && coverPrompt
        ? coverPrompt
        : `${s.title}. ${topic}. Advertising photography, high quality, natural light, no text in the image`;
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: cf
          ? { "content-type": "application/json", "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken }
          : { "content-type": "application/json", "x-replicate-key": settings.replicateKey },
        body: JSON.stringify({
          prompt,
          aspectRatio: format,
          count: 1,
          provider: settings.imageProvider,
          model: cf ? settings.cfImageModel : settings.imageModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const url = data.urls?.[0];
      if (!url) throw new Error("No se pudo generar la imagen.");
      onSave([{ kind: "imagen", url, prompt, date: new Date().toISOString() }]);
      await setPhotoFrom(s.id, url);
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setPhotoBusy(null);
    }
  }

  // Imágenes finales en alta resolución
  async function renderAll(): Promise<{ url: string; ext: string }[]> {
    const out: { url: string; ext: string }[] = [];
    for (let i = 0; i < slides.length; i++) {
      setBusy(`Preparando diapositiva ${i + 1} de ${slides.length}…`);
      const s = slides[i];
      const url = s.edited || (await renderDocImage(docFor(i), { mime: "image/jpeg", quality: 0.92 }));
      out.push({ url, ext: url.startsWith("data:image/png") ? "png" : "jpg" });
    }
    return out;
  }
  const fileName = (i: number, ext: string) => `carrusel-${String(i + 1).padStart(2, "0")}.${ext}`;
  const toFile = async (url: string, name: string) => {
    const blob = await (await fetch(url)).blob();
    return new File([blob], name, { type: blob.type });
  };

  async function downloadZip() {
    setDone("");
    setError("");
    try {
      const files = await renderAll();
      setBusy("Armando el archivo .zip…");
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      files.forEach((f, i) => zip.file(fileName(i, f.ext), f.url.split(",")[1], { base64: true }));
      if (caption.trim()) zip.file("texto-para-publicar.txt", caption);
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "innovationtech-carrusel.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setDone(`Listo: ${files.length} diapositivas en un .zip. En Instagram súbelas en orden (01, 02, 03…).`);
    } catch {
      setError("No se pudo exportar: una de las fotos viene de un enlace protegido. Descárgala y súbela desde tu dispositivo.");
    } finally {
      setBusy("");
    }
  }

  const canShareFiles = typeof navigator !== "undefined" && !!navigator.canShare;
  async function share() {
    setDone("");
    setError("");
    try {
      const imgs = await renderAll();
      setBusy("Abriendo compartir…");
      const files = await Promise.all(imgs.map((f, i) => toFile(f.url, fileName(i, f.ext))));
      if (!navigator.canShare?.({ files })) throw new Error("share");
      if (caption.trim()) await navigator.clipboard?.writeText(caption).catch(() => {});
      await navigator.share({ files });
      setDone(caption.trim() ? "Se copió el texto para publicar: pégalo en la descripción." : "Listo.");
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError("Este navegador no permite compartir varias imágenes juntas. Usa «Descargar (.zip)».");
    } finally {
      setBusy("");
    }
  }

  async function saveAll() {
    setDone("");
    setError("");
    try {
      const files = await renderAll();
      const date = new Date().toISOString();
      onSave(files.map((f, i) => ({ kind: "imagen", url: f.url, prompt: `Carrusel ${i + 1}/${files.length}: ${slides[i].title}`, date })));
      setDone(`Guardadas ${files.length} diapositivas en tu galería.`);
    } catch {
      setError("No se pudo guardar una de las diapositivas.");
    } finally {
      setBusy("");
    }
  }

  const copyCaption = async () => {
    await navigator.clipboard?.writeText(caption).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const scrollTo = (i: number) => {
    const el = stripRef.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };
  const ratio = format === "4:5" ? "4 / 5" : "1 / 1";

  return (
    <section className="card carousel">
      <div className="card-head">
        <h2>Carrusel para Instagram</h2>
        {slides.length > 0 && (
          <button
            className="btn ghost small"
            disabled={!!busy}
            onClick={() => confirm("¿Borrar este carrusel y empezar otro?") && (setSlides([]), setCaption(""), setCoverPrompt(""), setThumbs({}), setDone(""))}
          >
            Empezar nuevo
          </button>
        )}
      </div>
      <p className="hint">
        Escribe el tema y la IA arma la portada, los puntos y el cierre. Sale con tus colores, tu letra y tu logo de Mi marca; cambia cualquier texto y se vuelve a diseñar solo.
      </p>

      <div className="label-row">
        <label>¿De qué trata tu carrusel?</label>
        <MicButton
          cfHeaders={{ "x-cf-account": settings.cfAccountId, "x-cf-token": settings.cfToken }}
          onText={(t) => setTopic((v) => (v && !v.endsWith(" ") ? `${v} ${t}` : v + t))}
        />
      </div>
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Ej.: 5 razones para pedir tortas para tu evento de oficina en lugar de pizza"
      />
      <div className="row">
        <div>
          <label>Diapositivas</label>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Formato</label>
          <div className="seg">
            <button className={format === "4:5" ? "active" : ""} onClick={() => setFormat("4:5")}>
              Vertical 4:5
            </button>
            <button className={format === "1:1" ? "active" : ""} onClick={() => setFormat("1:1")}>
              Cuadrado 1:1
            </button>
          </div>
        </div>
        <div>
          <label>Estilo</label>
          <div className="seg">
            {CAROUSEL_STYLES.map((s) => (
              <button key={s.id} className={style === s.id ? "active" : ""} onClick={() => setStyle(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="actions">
        <button className="btn" disabled={!!busy || !topic.trim()} onClick={generate}>
          <Sparkles size={16} aria-hidden /> {slides.length ? "Escribir otro con IA" : "Crear carrusel con IA"}
        </button>
        {!slides.length && (
          <button className="btn ghost" disabled={!!busy} onClick={() => setSlides(blank(count))}>
            Escribir los textos yo mismo
          </button>
        )}
      </div>

      {busy && <div className="notice">{busy}</div>}
      {error && <div className="error">{error}</div>}

      {slides.length > 0 && (
        <>
          <div className="carousel-strip" ref={stripRef} aria-label="Vista previa del carrusel">
            {slides.map((s, i) => (
              <figure key={s.id} className="carousel-thumb" style={{ aspectRatio: ratio }}>
                {thumbs[s.id] ? <img src={thumbs[s.id]} alt={`${slideLabel(i, slides.length)}: ${s.title}`} /> : <span className="muted">…</span>}
                <figcaption>{i + 1}</figcaption>
              </figure>
            ))}
          </div>

          <div className="actions">
            <button className="btn" disabled={!!busy} onClick={downloadZip}>
              <Download size={16} aria-hidden /> {`Descargar ${slides.length} diapositivas (.zip)`}
            </button>
            {canShareFiles && (
              <button className="btn ghost" disabled={!!busy} onClick={share}>
                <Share2 size={16} aria-hidden /> Compartir a Instagram
              </button>
            )}
            <button className="btn ghost" disabled={!!busy} onClick={saveAll}>
              <Save size={16} aria-hidden /> Guardar en galería
            </button>
          </div>
          {done && <div className="ok">{done}</div>}

          <div className="carousel-caption">
              <div className="label-row">
                <label>Texto para publicar</label>
                <button className="btn ghost small" disabled={!caption.trim()} onClick={copyCaption}>
                  <Copy size={14} aria-hidden /> {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Descripción y hashtags del carrusel" />
          </div>

          <h3 className="carousel-sub">Textos de cada diapositiva</h3>
          <div className="carousel-list">
            {slides.map((s, i) => (
              <div key={s.id} className="carousel-item" onFocusCapture={() => scrollTo(i)}>
                <div className="carousel-item-head">
                  <strong>{`${i + 1}. ${slideLabel(i, slides.length)}`}</strong>
                  {s.edited && <span className="tag">Ajustada en el editor</span>}
                  <span className="carousel-tools">
                    <button className="icon-btn" title="Subir" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp size={16} />
                    </button>
                    <button className="icon-btn" title="Bajar" aria-label="Bajar" disabled={i === slides.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown size={16} />
                    </button>
                    <button className="icon-btn" title="Eliminar" aria-label="Eliminar" disabled={slides.length <= 2} onClick={() => remove(i)}>
                      <Trash2 size={16} />
                    </button>
                  </span>
                </div>
                <input value={s.title} onChange={(e) => update(s.id, { title: e.target.value })} placeholder="Título" aria-label="Título" />
                <textarea className="short" value={s.body} onChange={(e) => update(s.id, { body: e.target.value })} placeholder="Texto" aria-label="Texto" />
                <div className="actions">
                  <button className="btn ghost small" disabled={photoBusy === s.id} onClick={() => ((fileFor.current = s.id), fileInput.current?.click())}>
                    <ImagePlus size={14} aria-hidden /> {s.photo ? "Cambiar foto" : "Poner foto"}
                  </button>
                  <button className="btn ghost small" disabled={!!photoBusy} onClick={() => aiPhoto(i)}>
                    <Sparkles size={14} aria-hidden /> {photoBusy === s.id ? "Creando foto…" : "Foto con IA"}
                  </button>
                  {s.photo && (
                    <button className="btn ghost small" onClick={() => update(s.id, { photo: undefined, photoSize: undefined, edited: undefined })}>
                      <X size={14} aria-hidden /> Quitar foto
                    </button>
                  )}
                  <button className="btn ghost small" onClick={() => onEditSlide(docFor(i), i)}>
                    <Wand2 size={14} aria-hidden /> Ajustar en el editor
                  </button>
                  {s.edited && (
                    <button className="btn ghost small" onClick={() => update(s.id, { edited: undefined })}>
                      Volver al diseño automático
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button className="btn ghost" onClick={addSlide} disabled={slides.length >= 10}>
            <Plus size={16} aria-hidden /> Agregar diapositiva
          </button>
        </>
      )}
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />
    </section>
  );
}
