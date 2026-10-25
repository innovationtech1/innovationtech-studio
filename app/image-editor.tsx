"use client";

import Konva from "konva";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Adjust,
  BADGES,
  BadgeLayer,
  changeFormat,
  coverPhoto,
  Doc,
  EMOJIS,
  emptyDoc,
  FONTS,
  FORMATS,
  FormatId,
  ImageLayer,
  isNeutral,
  Layer,
  makeColorFilter,
  NEUTRAL,
  newBadge,
  newImage,
  newShape,
  newText,
  PRESETS,
  ShapeKind,
  ShapeLayer,
  sizeFor,
  SWATCHES,
  TEXT_PRESETS,
  TextLayer,
  uid,
} from "@/lib/editor-model";
import { usePersistentState } from "@/lib/persist";
import { fileToResizedDataUrl } from "@/lib/resize";
import type { Item } from "@/lib/types";
import BgRemover from "./bg-remover";

type Tool = "ajustes" | "filtros" | "texto" | "stickers" | "formas" | "imagen" | "marco" | "capas";

// ---------- Carga de imágenes (siempre como archivo local para poder exportar) ----------

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImg(src: string): Promise<HTMLImageElement> {
  if (!imgCache.has(src)) {
    imgCache.set(
      src,
      (async () => {
        let url = src;
        if (!src.startsWith("data:") && !src.startsWith("blob:")) {
          const res = await fetch(src).catch(() => null);
          if (!res || !res.ok) throw new Error("No se pudo abrir la imagen (quizá el enlace ya caducó).");
          url = URL.createObjectURL(await res.blob());
        }
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error("La imagen no se pudo abrir."));
          im.src = url;
        });
      })()
    );
    imgCache.get(src)!.catch(() => imgCache.delete(src));
  }
  return imgCache.get(src)!;
}

const fontStyle = (l: { bold?: boolean; italic?: boolean }) =>
  [l.italic ? "italic" : "", l.bold ? "bold" : ""].filter(Boolean).join(" ") || "normal";

// ---------- Construye el nodo de Konva para cada capa ----------

function buildNode(l: Layer, images: Map<string, HTMLImageElement>): Konva.Group | null {
  const g = new Konva.Group({
    id: l.id,
    name: "layer",
    x: l.x,
    y: l.y,
    rotation: l.rotation,
    scaleX: l.scaleX,
    scaleY: l.scaleY,
    opacity: l.opacity,
    visible: !l.hidden,
    draggable: !l.locked,
  });

  if (l.type === "text") {
    const t = new Konva.Text({
      text: l.uppercase ? l.text.toUpperCase() : l.text,
      fontFamily: `${l.fontFamily}, Arial, sans-serif`,
      fontSize: l.fontSize,
      fontStyle: fontStyle(l),
      fill: l.fill,
      align: l.align,
      letterSpacing: l.letterSpacing,
      padding: l.bg ? l.padding : 0,
      lineHeight: 1.12,
      stroke: l.strokeWidth ? l.stroke : undefined,
      strokeWidth: l.strokeWidth,
      fillAfterStrokeEnabled: true,
      shadowColor: "#000",
      shadowBlur: l.shadow ? l.fontSize * 0.25 : 0,
      shadowOffsetY: l.shadow ? l.fontSize * 0.04 : 0,
      shadowOpacity: l.shadow ? 0.6 : 0,
    });
    if (l.bg) {
      g.add(new Konva.Rect({ width: t.width(), height: t.height(), fill: l.bg, cornerRadius: l.bgRadius }));
    }
    g.add(t);
  } else if (l.type === "badge") {
    const s = l.size;
    let shape: Konva.Shape;
    if (l.shape === "circle") shape = new Konva.Circle({ x: s / 2, y: s / 2, radius: s / 2, fill: l.fill });
    else if (l.shape === "star")
      shape = new Konva.Star({ x: s / 2, y: s / 2, numPoints: 14, innerRadius: s * 0.41, outerRadius: s / 2, fill: l.fill });
    else if (l.shape === "pill")
      shape = new Konva.Rect({ y: s * 0.3, width: s, height: s * 0.4, cornerRadius: s * 0.2, fill: l.fill });
    else
      shape = new Konva.Line({
        points: [0, s * 0.3, s, s * 0.3, s * 0.9, s * 0.5, s, s * 0.7, 0, s * 0.7, s * 0.1, s * 0.5],
        closed: true,
        fill: l.fill,
      });
    shape.shadowColor("#000");
    shape.shadowBlur(s * 0.06);
    shape.shadowOpacity(0.35);
    shape.shadowOffsetY(s * 0.02);
    g.add(shape);
    const fs = (l.shape === "pill" || l.shape === "ribbon" ? s * 0.22 : s * 0.26) * Math.min(1, 4 / Math.max(3, l.text.length));
    g.add(
      new Konva.Text({
        width: s,
        height: s,
        align: "center",
        verticalAlign: "middle",
        text: l.text,
        fontFamily: `${l.fontFamily}, Arial, sans-serif`,
        fontSize: fs,
        fill: l.color,
      })
    );
  } else if (l.type === "shape") {
    const common = {
      fill: l.fill || undefined,
      stroke: l.stroke || undefined,
      strokeWidth: l.strokeWidth,
      hitStrokeWidth: Math.max(30, l.strokeWidth * 2),
    };
    if (l.kind === "rect") g.add(new Konva.Rect({ width: l.width, height: l.height, cornerRadius: l.radius, ...common }));
    else if (l.kind === "circle")
      g.add(new Konva.Ellipse({ x: l.width / 2, y: l.height / 2, radiusX: l.width / 2, radiusY: l.height / 2, ...common }));
    else if (l.kind === "star")
      g.add(new Konva.Star({ x: l.width / 2, y: l.height / 2, numPoints: 5, innerRadius: l.width * 0.2, outerRadius: l.width / 2, ...common }));
    else if (l.kind === "line") g.add(new Konva.Line({ points: [0, 0, l.width, 0], lineCap: "round", ...common }));
    else
      g.add(
        new Konva.Arrow({
          points: [0, 0, l.width, 0],
          pointerLength: l.strokeWidth * 3,
          pointerWidth: l.strokeWidth * 3,
          lineCap: "round",
          ...common,
          fill: l.stroke || "#fff",
        })
      );
  } else if (l.type === "image") {
    const im = images.get(l.src);
    if (!im) return null;
    g.add(new Konva.Image({ image: im, width: l.width, height: l.height, cornerRadius: l.radius }));
  }
  return g;
}

function layerLabel(l: Layer) {
  if (l.type === "text") return `Texto: ${l.text.slice(0, 18)}`;
  if (l.type === "badge") return `Sticker: ${l.text}`;
  if (l.type === "shape")
    return { rect: "Rectángulo", circle: "Círculo", line: "Línea", arrow: "Flecha", star: "Estrella" }[l.kind];
  return "Imagen / logo";
}

// ---------- Componente ----------

export default function ImageEditor({
  incoming,
  gallery,
  onSaveToGallery,
}: {
  incoming: { url: string; n: number } | null;
  gallery: Item[];
  onSaveToGallery: (dataUrl: string) => void;
}) {
  const [doc, setDocRaw] = usePersistentState<Doc>("editor:doc", emptyDoc(), (d) => ({
    ...d,
    photo: d.photo && d.photo.src.startsWith("data:") ? null : d.photo,
    layers: d.layers.filter((l) => !(l.type === "image" && l.src.startsWith("data:"))),
  }));
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("filtros");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [showGallery, setShowGallery] = useState(false);
  const [exportFmt, setExportFmt] = useState<"png" | "jpg">("jpg");
  const [notice, setNotice] = useState("");
  // Quitar fondo: a qué se aplica (la foto de fondo o una capa de imagen)
  const [cutout, setCutout] = useState<string | null>(null);
  const [, force] = useState(0);

  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const docRef = useRef(doc);
  docRef.current = doc;

  const wrapRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const bgLayer = useRef<Konva.Layer | null>(null);
  const contentLayer = useRef<Konva.Layer | null>(null);
  const uiLayer = useRef<Konva.Layer | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const photoNode = useRef<Konva.Image | null>(null);
  const photoKey = useRef("");
  const images = useRef(new Map<string, HTMLImageElement>());
  const [displayW, setDisplayW] = useState(0);
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guardar en el historial (deshacer/rehacer)
  const setDoc = useCallback(
    (next: Doc | ((d: Doc) => Doc), opts: { history?: boolean } = {}) => {
      const prev = docRef.current;
      const value = typeof next === "function" ? next(prev) : next;
      if (opts.history !== false) {
        past.current = [...past.current.slice(-39), prev];
        future.current = [];
      }
      docRef.current = value; // por si llegan dos cambios seguidos antes de redibujar
      setDocRaw(value);
    },
    [setDocRaw]
  );

  // Para deslizadores: guarda una sola entrada de historial por gesto.
  const setDocSlider = (fn: (d: Doc) => Doc) => {
    const first = !sliderTimer.current;
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    sliderTimer.current = setTimeout(() => (sliderTimer.current = null), 600);
    setDoc(fn, { history: first });
  };

  const undo = () => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(docRef.current);
    setDocRaw(p);
    force((n) => n + 1);
  };
  const redo = () => {
    const f = future.current.pop();
    if (!f) return;
    past.current.push(docRef.current);
    setDocRaw(f);
    force((n) => n + 1);
  };

  const updateLayer = (id: string, patch: Partial<Layer>, slider = false) => {
    const fn = (d: Doc) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) });
    if (slider) setDocSlider(fn);
    else setDoc(fn);
  };

  const addLayer = (l: Layer) => {
    setDoc((d) => ({ ...d, layers: [...d.layers, l] }));
    setSelected(l.id);
  };

  // ---------- Abrir fotos ----------

  const openPhoto = useCallback(
    async (src: string, keepDesign = false) => {
      setBusy("Abriendo imagen…");
      setError("");
      try {
        const im = await loadImg(src);
        images.current.set(src, im);
        setDoc((d) => {
          const photo = { src, naturalW: im.naturalWidth, naturalH: im.naturalHeight, cx: 0, cy: 0, scale: 1, rotation: 0, flipX: false, flipY: false };
          const base = keepDesign ? d : { ...emptyDoc(), format: "original" as FormatId };
          const [W, H] = sizeFor(base.format, photo);
          const ratioX = W / base.width;
          const ratioY = H / base.height;
          return {
            ...base,
            width: W,
            height: H,
            photo: coverPhoto(photo, W, H),
            layers: base.layers.map((l) => ({ ...l, x: l.x * ratioX, y: l.y * ratioY })),
          };
        });
        setSelected(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy("");
      }
    },
    [setDoc]
  );

  // Imagen enviada desde otra pestaña («Editar»)
  useEffect(() => {
    if (incoming) openPhoto(incoming.url);
  }, [incoming, openPhoto]);

  // ---------- Escenario de Konva ----------

  useEffect(() => {
    const stage = new Konva.Stage({ container: holderRef.current!, width: 10, height: 10 });
    const bg = new Konva.Layer();
    const content = new Konva.Layer();
    const ui = new Konva.Layer();
    const tr = new Konva.Transformer({
      rotateAnchorOffset: 28,
      anchorSize: 14,
      anchorCornerRadius: 7,
      borderStroke: "#e5243b",
      anchorStroke: "#e5243b",
      anchorFill: "#fff",
      borderStrokeWidth: 2,
      keepRatio: true,
      rotationSnaps: [0, 90, 180, 270],
      padding: 6,
    });
    ui.add(tr);
    stage.add(bg, content, ui);
    stageRef.current = stage;
    bgLayer.current = bg;
    contentLayer.current = content;
    uiLayer.current = ui;
    trRef.current = tr;

    // Tocar el fondo vacío quita la selección
    stage.on("mousedown touchstart", (e) => {
      if (e.target === stage || e.target.name() === "bgrect") setSelected(null);
    });

    // Al terminar de mover o transformar, guardamos en el modelo
    const commit = (node: Konva.Node) => {
      const id = node.id();
      if (id !== "photo" && node.name() !== "layer") return; // p. ej. el propio Transformer
      if (id === "photo") {
        setDoc((d) =>
          d.photo
            ? {
                ...d,
                photo: { ...d.photo, cx: node.x(), cy: node.y(), scale: Math.abs(node.scaleX()), rotation: node.rotation() },
              }
            : d
        );
        return;
      }
      setDoc((d) => ({
        ...d,
        layers: d.layers.map((l) =>
          l.id === id
            ? { ...l, x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: node.scaleX(), scaleY: node.scaleY() }
            : l
        ),
      }));
    };
    stage.on("dragend", (e) => commit(e.target));
    tr.on("transformend", () => tr.nodes().forEach(commit));

    return () => {
      stage.destroy();
    };
  }, [setDoc]);

  // Tamaño en pantalla (se adapta al ancho disponible)
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setDisplayW(el.clientWidth));
    ro.observe(el);
    setDisplayW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Dibuja el documento cada vez que cambia
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !displayW) return;
    let cancelled = false;

    (async () => {
      // Cargar imágenes que falten
      const srcs = [doc.photo?.src, ...doc.layers.filter((l): l is ImageLayer => l.type === "image").map((l) => l.src)].filter(
        Boolean
      ) as string[];
      await Promise.all(
        srcs
          .filter((s) => !images.current.has(s))
          .map((s) =>
            loadImg(s)
              .then((im) => images.current.set(s, im))
              .catch(() => {})
          )
      );
      // Esperar a que carguen las fuentes que se usan
      const fonts = new Set(doc.layers.flatMap((l) => (l.type === "text" || l.type === "badge" ? [l.fontFamily] : [])));
      await Promise.all(
        [...fonts].map((f) =>
          document.fonts ? Promise.all([document.fonts.load(`40px "${f}"`), document.fonts.load(`bold 40px "${f}"`)]).catch(() => {}) : null
        )
      );
      if (cancelled) return;

      const maxH = Math.max(320, window.innerHeight * 0.62);
      const s = Math.min(displayW / doc.width, maxH / doc.height);
      stage.width(Math.round(doc.width * s));
      stage.height(Math.round(doc.height * s));
      stage.scale({ x: s, y: s });

      // --- Fondo, foto, degradado y marco ---
      const bg = bgLayer.current!;
      bg.destroyChildren();
      photoNode.current = null;
      bg.add(
        new Konva.Rect({ name: "bgrect", width: doc.width, height: doc.height, fill: doc.transparent ? "rgba(0,0,0,0)" : doc.background })
      );
      if (doc.photo && images.current.get(doc.photo.src)) {
        const p = doc.photo;
        const im = images.current.get(p.src)!;
        const node = new Konva.Image({
          id: "photo",
          image: im,
          x: p.cx,
          y: p.cy,
          offsetX: p.naturalW / 2,
          offsetY: p.naturalH / 2,
          width: p.naturalW,
          height: p.naturalH,
          scaleX: p.scale * (p.flipX ? -1 : 1),
          scaleY: p.scale * (p.flipY ? -1 : 1),
          rotation: p.rotation,
          // Solo se mueve después de tocarla (evita moverla por accidente)
          draggable: false,
        });
        bg.add(node);
        photoNode.current = node;
        const key = JSON.stringify([p.src, doc.adjust]);
        if (!isNeutral(doc.adjust) || doc.adjust.blur) {
          // Filtros sobre una copia reducida (rápido) del tamaño necesario
          const pr = Math.min(1, 1600 / Math.max(p.naturalW, p.naturalH));
          node.cache({ pixelRatio: pr });
          const filters: Konva.Filter[] = [];
          if (!isNeutral(doc.adjust)) filters.push(makeColorFilter(doc.adjust) as unknown as Konva.Filter);
          if (doc.adjust.blur) {
            filters.push(Konva.Filters.Blur);
            node.blurRadius(doc.adjust.blur);
          }
          node.filters(filters);
        }
        photoKey.current = key;
      }
      if (doc.overlay.on) {
        bg.add(
          new Konva.Rect({
            width: doc.width,
            height: doc.height,
            listening: false,
            fillLinearGradientStartPoint: { x: 0, y: doc.height * 0.35 },
            fillLinearGradientEndPoint: { x: 0, y: doc.height },
            fillLinearGradientColorStops: [0, "rgba(0,0,0,0)", 1, hexA(doc.overlay.color, doc.overlay.strength / 100)],
          })
        );
      }

      // --- Capas del usuario ---
      const content = contentLayer.current!;
      content.destroyChildren();
      doc.layers.forEach((l) => {
        const n = buildNode(l, images.current);
        if (n) content.add(n);
      });
      if (doc.frame.on) {
        const w = doc.frame.width;
        content.add(
          new Konva.Rect({
            x: w / 2,
            y: w / 2,
            width: doc.width - w,
            height: doc.height - w,
            stroke: doc.frame.color,
            strokeWidth: w,
            cornerRadius: doc.frame.radius,
            listening: false,
          })
        );
      }

      attachTransformer();
      stage.batchDraw();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, displayW]);

  // Muestra las manijas sobre lo seleccionado SIN volver a dibujar todo
  // (así no se interrumpe un arrastre que acaba de empezar).
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  function attachTransformer() {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    const sel = selectedRef.current;
    photoNode.current?.draggable(sel === "photo");
    const target = sel === "photo" ? photoNode.current : sel ? contentLayer.current?.findOne(`#${sel}`) : null;
    const lay = docRef.current.layers.find((l) => l.id === sel);
    tr.keepRatio(!(lay && lay.type === "shape"));
    tr.enabledAnchors(
      lay && lay.type === "shape"
        ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]
        : ["top-left", "top-right", "bottom-left", "bottom-right"]
    );
    tr.nodes(target && !(lay && lay.locked) ? [target] : []);
    // Las manijas se miden en píxeles de pantalla: más grandes en pantallas táctiles.
    const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    tr.anchorSize(touch ? 20 : 12);
    tr.borderStrokeWidth(2);
    tr.rotateAnchorOffset(touch ? 30 : 24);
    uiLayer.current?.batchDraw();
  }
  useEffect(() => {
    attachTransformer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Seleccionar al tocar una capa
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onTap = (e: Konva.KonvaEventObject<Event>) => {
      let n: Konva.Node | null = e.target;
      while (n && n !== stage) {
        if (n.id() === "photo") return setSelected("photo");
        if (n.name() === "layer") return setSelected(n.id());
        n = n.getParent();
      }
    };
    stage.on("click tap dragstart", onTap);
    return () => {
      stage.off("click tap dragstart");
    };
  }, []);

  // Atajos de teclado (computadora)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!wrapRef.current?.offsetParent) return; // el editor no está visible
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected && selected !== "photo") {
        e.preventDefault();
        removeLayer(selected);
      } else if (selected && selected !== "photo" && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 20 : 4;
        const l = docRef.current.layers.find((x) => x.id === selected);
        if (!l) return;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateLayer(selected, { x: l.x + dx, y: l.y + dy }, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Acciones ----------

  const sel = doc.layers.find((l) => l.id === selected) || null;

  const removeLayer = (id: string) => {
    setDoc((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }));
    setSelected(null);
  };
  const duplicate = (id: string) => {
    const l = doc.layers.find((x) => x.id === id);
    if (!l) return;
    const copy = { ...l, id: uid(), x: l.x + doc.width * 0.03, y: l.y + doc.width * 0.03 } as Layer;
    addLayer(copy);
  };
  const move = (id: string, dir: 1 | -1 | "top" | "bottom") =>
    setDoc((d) => {
      const arr = [...d.layers];
      const i = arr.findIndex((l) => l.id === id);
      const [it] = arr.splice(i, 1);
      const j = dir === "top" ? arr.length : dir === "bottom" ? 0 : Math.max(0, Math.min(arr.length, i + dir));
      arr.splice(j, 0, it);
      return { ...d, layers: arr };
    });
  const centerLayer = (id: string, axis: "h" | "v") => {
    const node = contentLayer.current?.findOne(`#${id}`);
    const l = doc.layers.find((x) => x.id === id);
    if (!node || !l) return;
    const box = node.getClientRect({ relativeTo: stageRef.current! as unknown as Konva.Container });
    if (axis === "h") updateLayer(id, { x: l.x + (doc.width - box.width) / 2 - box.x });
    else updateLayer(id, { y: l.y + (doc.height - box.height) / 2 - box.y });
  };

  const setAdjust = (patch: Partial<Adjust>) => setDocSlider((d) => ({ ...d, adjust: { ...d.adjust, ...patch } }));

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const url = await fileToResizedDataUrl(file, 2048, 0.92);
      await openPhoto(url, !!doc.layers.length && confirm("¿Mantener los textos y stickers del diseño actual?"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addImageLayer(src: string) {
    try {
      const im = await loadImg(src);
      images.current.set(src, im);
      addLayer(newImage(doc, src, im.naturalWidth, im.naturalHeight));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // JPG no admite transparencia: con fondo transparente siempre se exporta PNG.
  const outFmt: "png" | "jpg" = doc.transparent ? "png" : exportFmt;

  async function applyCutout(target: string, png: string, size: { w: number; h: number }) {
    try {
      const im = await loadImg(png);
      images.current.set(png, im);
      if (target === "photo") {
        setDoc((d) => {
          const photo = { ...d.photo!, src: png, naturalW: size.w, naturalH: size.h, rotation: 0 };
          // En «original», el lienzo toma el tamaño del objeto recortado (ideal para descargar el logo solo).
          const [W, H] = sizeFor(d.format, photo);
          const fit = Math.min(W / size.w, H / size.h) * (d.format === "original" ? 1 : 0.9);
          return { ...d, width: W, height: H, transparent: true, photo: { ...photo, cx: W / 2, cy: H / 2, scale: fit } };
        });
        setNotice("Fondo quitado. Activé el fondo transparente: se descargará en PNG (puedes cambiarlo en «Fondo y marco»).");
      } else {
        setDoc((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === target && l.type === "image" ? { ...l, src: png, height: (l.width * size.h) / size.w } : l
          ),
        }));
        setNotice("Fondo quitado.");
      }
      setTimeout(() => setNotice(""), 5000);
      setCutout(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function exportImage(): string | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const tr = trRef.current!;
    const nodes = tr.nodes();
    tr.nodes([]);
    const s = stage.scaleX();
    let url: string | null = null;
    try {
      url = stage.toDataURL({
        pixelRatio: 1 / s,
        mimeType: outFmt === "png" ? "image/png" : "image/jpeg",
        quality: 0.92,
      });
    } catch {
      setError("No se pudo exportar: una de las imágenes viene de un enlace protegido. Descárgala y súbela desde tu dispositivo.");
    }
    tr.nodes(nodes);
    stage.batchDraw();
    return url;
  }

  const download = () => {
    const url = exportImage();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `innovationtech-diseno.${outFmt}`;
    a.click();
  };
  const saveGallery = () => {
    const url = exportImage();
    if (!url) return;
    onSaveToGallery(url);
    setNotice("Guardado en tu galería.");
    setTimeout(() => setNotice(""), 2500);
  };
  const share = async () => {
    const url = exportImage();
    if (!url) return;
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `innovationtech-diseno.${outFmt}`, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (nav.canShare?.({ files: [file] })) await navigator.share({ files: [file] }).catch(() => {});
    else download();
  };

  const newDesign = () => {
    if (!confirm("¿Empezar un diseño nuevo? Podrás deshacerlo con «Deshacer».")) return;
    setDoc(emptyDoc());
    setSelected(null);
  };

  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const galleryImages = gallery.filter((g) => g.kind === "imagen");

  // ---------- Interfaz ----------

  return (
    <section className="card editor">
      <div className="card-head">
        <h2>Editor de imágenes</h2>
        <div className="actions">
          <button className="btn ghost small" onClick={undo} disabled={!past.current.length} title="Deshacer (Ctrl+Z)">
            ↶ Deshacer
          </button>
          <button className="btn ghost small" onClick={redo} disabled={!future.current.length} title="Rehacer">
            ↷ Rehacer
          </button>
          <button className="btn ghost small" onClick={newDesign}>
            Nuevo
          </button>
        </div>
      </div>

      <div className="editor-top">
        <label className="btn small" style={{ margin: 0 }}>
          📷 Abrir foto
          <input type="file" accept="image/*" hidden onChange={(e) => (uploadPhoto(e.target.files?.[0]), (e.target.value = ""))} />
        </label>
        <button className="btn ghost small" onClick={() => setShowGallery((v) => !v)}>
          📁 De la galería
        </button>
        <select
          value={doc.format}
          onChange={(e) => setDoc((d) => changeFormat(d, e.target.value as FormatId))}
          aria-label="Formato"
          style={{ width: "auto", flex: "1 1 180px" }}
        >
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id} disabled={f.id === "original" && !doc.photo}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {showGallery && (
        <div className="picker" style={{ marginBottom: 10 }}>
          {galleryImages.length === 0 && <span className="muted">Tu galería está vacía.</span>}
          {galleryImages.slice(0, 30).map((g, k) => (
            <img key={g.url + k} src={g.url} alt={g.prompt} onClick={() => (openPhoto(g.url), setShowGallery(false))} />
          ))}
        </div>
      )}

      <div className="editor-stage-wrap" ref={wrapRef}>
        <div ref={holderRef} className="editor-stage" />
        {!doc.photo && !doc.layers.length && (
          <div className="editor-empty">
            Abre una foto, elige una de tu galería o empieza a diseñar sobre el fondo de color.
          </div>
        )}
      </div>
      {busy && <div className="notice">{busy}</div>}
      {error && <div className="error">{error}</div>}

      {/* Propiedades de lo seleccionado */}
      {selected === "photo" && doc.photo && (
        <div className="props">
          <strong>Foto de fondo</strong>
          <span className="muted">Ahora puedes arrastrarla para encuadrar y usar las esquinas para acercar o alejar.</span>
          <div className="actions">
            <button className="btn ghost small" onClick={() => setDoc((d) => ({ ...d, photo: coverPhoto({ ...d.photo!, rotation: (d.photo!.rotation + 90) % 360 }, d.width, d.height) }))}>
              ⟳ Girar 90°
            </button>
            <button className="btn ghost small" onClick={() => setDoc((d) => ({ ...d, photo: { ...d.photo!, flipX: !d.photo!.flipX } }))}>
              ⇋ Voltear
            </button>
            <button className="btn ghost small" onClick={() => setDoc((d) => ({ ...d, photo: { ...d.photo!, flipY: !d.photo!.flipY } }))}>
              ⇵ Voltear vertical
            </button>
            <button className="btn ghost small" onClick={() => setDoc((d) => ({ ...d, photo: coverPhoto(d.photo!, d.width, d.height) }))}>
              ⤢ Llenar lienzo
            </button>
            <button
              className="btn ghost small"
              onClick={() =>
                setDoc((d) => {
                  const p = d.photo!;
                  return { ...d, photo: { ...p, cx: d.width / 2, cy: d.height / 2, scale: Math.min(d.width / p.naturalW, d.height / p.naturalH) } };
                })
              }
            >
              ⤡ Mostrar completa
            </button>
            <button className="btn small" onClick={() => setCutout("photo")}>
              ✂️ Quitar fondo
            </button>
            <button className="btn ghost small" onClick={() => (setDoc((d) => ({ ...d, photo: null })), setSelected(null))}>
              Quitar foto
            </button>
          </div>
        </div>
      )}
      {cutout && (cutout === "photo" ? doc.photo : doc.layers.find((l) => l.id === cutout && l.type === "image")) && (
        <BgRemover
          src={cutout === "photo" ? doc.photo!.src : (doc.layers.find((l) => l.id === cutout) as ImageLayer).src}
          title={cutout === "photo" ? "foto de fondo" : "imagen / logo"}
          onClose={() => setCutout(null)}
          onApply={(png, size) => applyCutout(cutout, png, size)}
        />
      )}
      {sel && !cutout && (
        <LayerProps
          onCutout={sel.type === "image" ? () => setCutout(sel.id) : undefined}
          layer={sel}
          docWidth={doc.width}
          onChange={(p, slider) => updateLayer(sel.id, p, slider)}
          onDuplicate={() => duplicate(sel.id)}
          onDelete={() => removeLayer(sel.id)}
          onMove={(d) => move(sel.id, d)}
          onCenter={(a) => centerLayer(sel.id, a)}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Herramientas */}
      <div className="tool-tabs">
        {(
          [
            ["filtros", "🎨 Filtros"],
            ["ajustes", "🎚️ Ajustes"],
            ["texto", "🔤 Texto"],
            ["stickers", "🏷️ Stickers"],
            ["formas", "⬛ Formas"],
            ["imagen", "🖼️ Logo/imagen"],
            ["marco", "🖌️ Fondo y marco"],
            ["capas", "📚 Capas"],
          ] as [Tool, string][]
        ).map(([id, label]) => (
          <button key={id} className={tool === id ? "active" : ""} onClick={() => setTool(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="tool-panel">
        {tool === "filtros" && (
          <>
            {!doc.photo && <p className="muted">Abre una foto para aplicar filtros.</p>}
            <div className="presets">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  disabled={!doc.photo}
                  className={JSON.stringify({ ...NEUTRAL, ...p.adjust }) === JSON.stringify({ ...doc.adjust, blur: 0 }) ? "active" : ""}
                  onClick={() => setDoc((d) => ({ ...d, adjust: { ...NEUTRAL, ...p.adjust, blur: d.adjust.blur } }))}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}

        {tool === "ajustes" && (
          <>
            {!doc.photo && <p className="muted">Abre una foto para ajustarla.</p>}
            {(
              [
                ["brightness", "Brillo", -100, 100],
                ["contrast", "Contraste", -100, 100],
                ["saturation", "Saturación", -100, 100],
                ["warmth", "Temperatura (frío ↔ cálido)", -100, 100],
                ["tint", "Matiz (verde ↔ magenta)", -100, 100],
                ["highlights", "Luces", -100, 100],
                ["shadows", "Sombras", -100, 100],
                ["vignette", "Viñeta", 0, 100],
                ["grain", "Grano", 0, 100],
                ["blur", "Desenfoque", 0, 20],
              ] as [keyof Adjust, string, number, number][]
            ).map(([k, label, min, max]) => (
              <Slider
                key={k}
                label={label}
                min={min}
                max={max}
                value={doc.adjust[k] as number}
                disabled={!doc.photo}
                onChange={(v) => setAdjust({ [k]: v } as Partial<Adjust>)}
              />
            ))}
            <button className="btn ghost small" disabled={!doc.photo} onClick={() => setDoc((d) => ({ ...d, adjust: { ...NEUTRAL } }))}>
              Restablecer ajustes
            </button>
          </>
        )}

        {tool === "texto" && (
          <div className="presets">
            {TEXT_PRESETS.map((p) => (
              <button key={p.name} onClick={() => addLayer(newText(doc, p.make(doc)))}>
                + {p.name}
              </button>
            ))}
          </div>
        )}

        {tool === "stickers" && (
          <>
            <p className="muted">Etiquetas de oferta (puedes cambiarles el texto y colores):</p>
            <div className="presets">
              {BADGES.map((b) => (
                <button key={b.text} onClick={() => addLayer(newBadge(doc, b))} style={{ background: b.fill, color: b.color }}>
                  {b.text}
                </button>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 10 }}>
              Emojis:
            </p>
            <div className="presets emojis">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() =>
                    addLayer(newText(doc, { text: e, fontSize: doc.width * 0.14, x: doc.width * 0.43, y: doc.height * 0.43, fontFamily: "Montserrat" }))
                  }
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}

        {tool === "formas" && (
          <div className="presets">
            {(
              [
                ["rect", "▬ Rectángulo"],
                ["circle", "● Círculo"],
                ["star", "★ Estrella"],
                ["line", "— Línea"],
                ["arrow", "➜ Flecha"],
              ] as [ShapeKind, string][]
            ).map(([k, label]) => (
              <button key={k} onClick={() => addLayer(newShape(doc, k))}>
                {label}
              </button>
            ))}
          </div>
        )}

        {tool === "imagen" && (
          <>
            <p className="muted">Agrega tu logo u otra foto encima del diseño (PNG con fondo transparente es ideal para logos).</p>
            <div className="actions">
              <label className="btn small" style={{ margin: 0 }}>
                Subir logo o imagen
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) addImageLayer(await fileToResizedDataUrl(f, 1200, 0.92, f.type === "image/png"));
                  }}
                />
              </label>
              <SavedLogo onUse={addImageLayer} />
            </div>
          </>
        )}

        {tool === "marco" && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={!!doc.transparent}
                onChange={(e) => setDoc((d) => ({ ...d, transparent: e.target.checked }))}
              />
              Fondo transparente (para logos sin fondo; se descarga en PNG)
            </label>
            <label>Color de fondo (se ve donde no hay foto)</label>
            <ColorRow value={doc.background} onChange={(c) => setDoc((d) => ({ ...d, background: c }))} />
            <label className="check">
              <input type="checkbox" checked={doc.overlay.on} onChange={(e) => setDoc((d) => ({ ...d, overlay: { ...d.overlay, on: e.target.checked } }))} />
              Degradado inferior (hace que los textos se lean mejor)
            </label>
            {doc.overlay.on && (
              <>
                <ColorRow value={doc.overlay.color} onChange={(c) => setDoc((d) => ({ ...d, overlay: { ...d.overlay, color: c } }))} />
                <Slider label="Intensidad" min={10} max={100} value={doc.overlay.strength} onChange={(v) => setDocSlider((d) => ({ ...d, overlay: { ...d.overlay, strength: v } }))} />
              </>
            )}
            <label className="check">
              <input type="checkbox" checked={doc.frame.on} onChange={(e) => setDoc((d) => ({ ...d, frame: { ...d.frame, on: e.target.checked } }))} />
              Marco
            </label>
            {doc.frame.on && (
              <>
                <ColorRow value={doc.frame.color} onChange={(c) => setDoc((d) => ({ ...d, frame: { ...d.frame, color: c } }))} />
                <Slider label="Grosor" min={4} max={Math.round(doc.width * 0.08)} value={doc.frame.width} onChange={(v) => setDocSlider((d) => ({ ...d, frame: { ...d.frame, width: v } }))} />
                <Slider label="Esquinas redondeadas" min={0} max={Math.round(doc.width * 0.08)} value={doc.frame.radius} onChange={(v) => setDocSlider((d) => ({ ...d, frame: { ...d.frame, radius: v } }))} />
              </>
            )}
          </>
        )}

        {tool === "capas" && (
          <div className="layers">
            {doc.layers.length === 0 && <p className="muted">Aún no hay capas. Agrega textos, stickers, formas o tu logo.</p>}
            {[...doc.layers].reverse().map((l) => (
              <div key={l.id} className={`layer-row ${selected === l.id ? "active" : ""}`}>
                <button className="layer-name" onClick={() => setSelected(l.id)}>
                  {layerLabel(l)}
                </button>
                <button title="Mostrar/ocultar" onClick={() => updateLayer(l.id, { hidden: !l.hidden })}>
                  {l.hidden ? "🙈" : "👁️"}
                </button>
                <button title="Bloquear" onClick={() => updateLayer(l.id, { locked: !l.locked })}>
                  {l.locked ? "🔒" : "🔓"}
                </button>
                <button title="Subir" onClick={() => move(l.id, 1)}>
                  ▲
                </button>
                <button title="Bajar" onClick={() => move(l.id, -1)}>
                  ▼
                </button>
                <button title="Eliminar" onClick={() => removeLayer(l.id)}>
                  🗑️
                </button>
              </div>
            ))}
            {doc.photo && (
              <div className={`layer-row ${selected === "photo" ? "active" : ""}`}>
                <button className="layer-name" onClick={() => setSelected("photo")}>
                  Foto de fondo
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Exportar */}
      <div className="editor-export">
        <select
          value={outFmt}
          disabled={!!doc.transparent}
          onChange={(e) => setExportFmt(e.target.value as "png" | "jpg")}
          style={{ width: "auto" }}
          aria-label="Formato de archivo"
        >
          <option value="jpg">JPG (más ligero)</option>
          <option value="png">PNG (máxima calidad)</option>
        </select>
        <button className="btn" onClick={download}>
          ⬇️ Descargar
        </button>
        {canShare && (
          <button className="btn ghost" onClick={share}>
            📤 Compartir
          </button>
        )}
        <button className="btn ghost" onClick={saveGallery}>
          💾 Guardar en galería
        </button>
      </div>
      {notice && <div className="ok">{notice}</div>}
      <p className="hint" style={{ marginTop: 10 }}>
        Toca un elemento para seleccionarlo; arrástralo para moverlo y usa las esquinas para cambiar tamaño o girar. Para mover la foto de fondo, tócala primero. Se exporta en {doc.width}×{doc.height} px.
      </p>
    </section>
  );
}

// ---------- Panel de propiedades de una capa ----------

function LayerProps({
  layer: l,
  docWidth,
  onChange,
  onDuplicate,
  onDelete,
  onMove,
  onCenter,
  onClose,
  onCutout,
}: {
  onCutout?: () => void;
  layer: Layer;
  docWidth: number;
  onChange: (p: Partial<Layer>, slider?: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (d: 1 | -1 | "top" | "bottom") => void;
  onCenter: (a: "h" | "v") => void;
  onClose: () => void;
}) {
  return (
    <div className="props">
      <div className="card-head">
        <strong>{layerLabel(l)}</strong>
        <button className="btn ghost small" onClick={onClose}>
          Listo
        </button>
      </div>

      {l.type === "text" && (
        <>
          <textarea value={l.text} onChange={(e) => onChange({ text: e.target.value } as Partial<TextLayer>, true)} style={{ minHeight: 60 }} />
          <div className="row">
            <div>
              <label>Fuente</label>
              <select value={l.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value } as Partial<TextLayer>)} style={{ fontFamily: l.fontFamily }}>
                {FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Alineación</label>
              <div className="seg">
                {(["left", "center", "right"] as const).map((a) => (
                  <button key={a} className={l.align === a ? "active" : ""} onClick={() => onChange({ align: a } as Partial<TextLayer>)}>
                    {a === "left" ? "⇤" : a === "center" ? "↔" : "⇥"}
                  </button>
                ))}
                <button className={l.bold ? "active" : ""} onClick={() => onChange({ bold: !l.bold } as Partial<TextLayer>)}>
                  <b>B</b>
                </button>
                <button className={l.italic ? "active" : ""} onClick={() => onChange({ italic: !l.italic } as Partial<TextLayer>)}>
                  <i>I</i>
                </button>
                <button className={l.uppercase ? "active" : ""} onClick={() => onChange({ uppercase: !l.uppercase } as Partial<TextLayer>)}>
                  AA
                </button>
              </div>
            </div>
          </div>
          <Slider label="Tamaño" min={Math.round(docWidth * 0.015)} max={Math.round(docWidth * 0.3)} value={Math.round(l.fontSize)} onChange={(v) => onChange({ fontSize: v } as Partial<TextLayer>, true)} />
          <Slider label="Espaciado de letras" min={-5} max={40} value={l.letterSpacing} onChange={(v) => onChange({ letterSpacing: v } as Partial<TextLayer>, true)} />
          <label>Color del texto</label>
          <ColorRow value={l.fill} onChange={(c) => onChange({ fill: c } as Partial<TextLayer>)} />
          <label className="check">
            <input type="checkbox" checked={l.shadow} onChange={(e) => onChange({ shadow: e.target.checked } as Partial<TextLayer>)} />
            Sombra
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={l.strokeWidth > 0}
              onChange={(e) => onChange({ strokeWidth: e.target.checked ? Math.max(2, l.fontSize * 0.06) : 0 } as Partial<TextLayer>)}
            />
            Contorno
          </label>
          {l.strokeWidth > 0 && (
            <>
              <ColorRow value={l.stroke} onChange={(c) => onChange({ stroke: c } as Partial<TextLayer>)} />
              <Slider label="Grosor del contorno" min={1} max={Math.round(l.fontSize * 0.2)} value={Math.round(l.strokeWidth)} onChange={(v) => onChange({ strokeWidth: v } as Partial<TextLayer>, true)} />
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={!!l.bg}
              onChange={(e) =>
                onChange({ bg: e.target.checked ? "#e5243b" : "", padding: l.padding || l.fontSize * 0.25, bgRadius: l.bgRadius || l.fontSize * 0.15 } as Partial<TextLayer>)
              }
            />
            Fondo detrás del texto
          </label>
          {!!l.bg && (
            <>
              <ColorRow value={l.bg} onChange={(c) => onChange({ bg: c } as Partial<TextLayer>)} />
              <Slider label="Margen" min={0} max={Math.round(l.fontSize)} value={Math.round(l.padding)} onChange={(v) => onChange({ padding: v } as Partial<TextLayer>, true)} />
              <Slider label="Esquinas" min={0} max={Math.round(l.fontSize)} value={Math.round(l.bgRadius)} onChange={(v) => onChange({ bgRadius: v } as Partial<TextLayer>, true)} />
            </>
          )}
        </>
      )}

      {l.type === "badge" && (
        <>
          <input value={l.text} onChange={(e) => onChange({ text: e.target.value } as Partial<BadgeLayer>, true)} />
          <div className="seg" style={{ marginTop: 8 }}>
            {(["star", "circle", "pill", "ribbon"] as const).map((s) => (
              <button key={s} className={l.shape === s ? "active" : ""} onClick={() => onChange({ shape: s } as Partial<BadgeLayer>)}>
                {{ star: "✸ Destello", circle: "● Círculo", pill: "▬ Píldora", ribbon: "🎀 Listón" }[s]}
              </button>
            ))}
          </div>
          <label>Color de la etiqueta</label>
          <ColorRow value={l.fill} onChange={(c) => onChange({ fill: c } as Partial<BadgeLayer>)} />
          <label>Color del texto</label>
          <ColorRow value={l.color} onChange={(c) => onChange({ color: c } as Partial<BadgeLayer>)} />
          <label>Fuente</label>
          <select value={l.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value } as Partial<BadgeLayer>)}>
            {FONTS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </>
      )}

      {l.type === "shape" && (
        <>
          {l.kind !== "line" && l.kind !== "arrow" && (
            <>
              <label className="check">
                <input type="checkbox" checked={!!l.fill} onChange={(e) => onChange({ fill: e.target.checked ? "#e5243b" : "" } as Partial<ShapeLayer>)} />
                Relleno
              </label>
              {!!l.fill && <ColorRow value={l.fill} onChange={(c) => onChange({ fill: c } as Partial<ShapeLayer>)} />}
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={!!l.stroke && l.strokeWidth > 0}
              onChange={(e) =>
                onChange({ stroke: e.target.checked ? "#ffffff" : "", strokeWidth: e.target.checked ? Math.max(4, l.strokeWidth || docWidth * 0.008) : 0 } as Partial<ShapeLayer>)
              }
            />
            {l.kind === "line" || l.kind === "arrow" ? "Color y grosor" : "Borde"}
          </label>
          {!!l.stroke && l.strokeWidth > 0 && (
            <>
              <ColorRow value={l.stroke} onChange={(c) => onChange({ stroke: c } as Partial<ShapeLayer>)} />
              <Slider label="Grosor" min={1} max={Math.round(docWidth * 0.05)} value={Math.round(l.strokeWidth)} onChange={(v) => onChange({ strokeWidth: v } as Partial<ShapeLayer>, true)} />
            </>
          )}
          {l.kind === "rect" && (
            <Slider label="Esquinas redondeadas" min={0} max={Math.round(Math.min(l.width, l.height) / 2)} value={Math.round(l.radius)} onChange={(v) => onChange({ radius: v } as Partial<ShapeLayer>, true)} />
          )}
        </>
      )}

      {l.type === "image" && onCutout && (
        <button className="btn small" onClick={onCutout} style={{ alignSelf: "flex-start" }}>
          ✂️ Quitar fondo
        </button>
      )}
      {l.type === "image" && (
        <Slider label="Esquinas redondeadas" min={0} max={Math.round(Math.min(l.width, l.height) / 2)} value={Math.round(l.radius)} onChange={(v) => onChange({ radius: v } as Partial<ImageLayer>, true)} />
      )}

      <Slider label="Opacidad" min={5} max={100} value={Math.round(l.opacity * 100)} onChange={(v) => onChange({ opacity: v / 100 }, true)} />
      <div className="actions">
        <button className="btn ghost small" onClick={() => onCenter("h")}>
          ↔ Centrar
        </button>
        <button className="btn ghost small" onClick={() => onCenter("v")}>
          ↕ Centrar
        </button>
        <button className="btn ghost small" onClick={() => onMove("top")}>
          ⬆ Al frente
        </button>
        <button className="btn ghost small" onClick={() => onMove("bottom")}>
          ⬇ Al fondo
        </button>
        <button className="btn ghost small" onClick={onDuplicate}>
          ⧉ Duplicar
        </button>
        <button className="btn ghost small" onClick={onDelete}>
          🗑️ Eliminar
        </button>
      </div>
    </div>
  );
}

// ---------- Controles pequeños ----------

function Slider({
  label,
  min,
  max,
  value,
  onChange,
  disabled,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <button type="button" className="slider-val" onClick={() => onChange(min < 0 ? 0 : min)} title="Restablecer" disabled={disabled}>
          {value}
        </button>
      </div>
      <input type="range" min={min} max={max} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {SWATCHES.map((c) => (
        <button
          key={c}
          className={value.toLowerCase() === c ? "active" : ""}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
        />
      ))}
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} aria-label="Otro color" />
    </div>
  );
}

function SavedLogo({ onUse }: { onUse: (src: string) => void }) {
  const [logo, setLogo] = useState("");
  useEffect(() => {
    try {
      setLogo(localStorage.getItem("its-logo") || "");
    } catch {
      /* nada */
    }
  }, []);
  if (!logo) return null;
  return (
    <button className="btn ghost small" onClick={() => onUse(logo)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <img src={logo} alt="" style={{ height: 22 }} /> Usar mi logo guardado
    </button>
  );
}

function hexA(hex: string, a: number) {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
