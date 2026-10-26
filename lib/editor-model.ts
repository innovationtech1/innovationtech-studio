import type { Brand } from "./brand";
import { brandAccent, textOn } from "./brand";

// Modelo del editor de imágenes: todo el diseño se describe con datos simples
// (así se puede deshacer/rehacer y guardar el borrador en el navegador).

export type FormatId = "original" | "1:1" | "4:5" | "9:16" | "16:9";

export const FORMATS: { id: FormatId; label: string; size?: [number, number] }[] = [
  { id: "original", label: "Original de la foto" },
  { id: "1:1", label: "Cuadrado 1:1 · post", size: [1080, 1080] },
  { id: "4:5", label: "Vertical 4:5 · feed", size: [1080, 1350] },
  { id: "9:16", label: "Historia / Reel 9:16", size: [1080, 1920] },
  { id: "16:9", label: "Horizontal 16:9 · YouTube, web", size: [1920, 1080] },
];

export type Adjust = {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  warmth: number; // -100..100 (frío ↔ cálido)
  tint: number; // -100..100 (verde ↔ magenta)
  highlights: number; // -100..100
  shadows: number; // -100..100
  vignette: number; // 0..100
  grain: number; // 0..100
  blur: number; // 0..20
  mode: "none" | "gray" | "sepia";
};

export const NEUTRAL: Adjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  vignette: 0,
  grain: 0,
  blur: 0,
  mode: "none",
};

export const PRESETS: { name: string; adjust: Partial<Adjust> }[] = [
  { name: "Original", adjust: {} },
  { name: "Vívido", adjust: { saturation: 35, contrast: 15, brightness: 4 } },
  { name: "Apetitoso", adjust: { saturation: 25, warmth: 22, contrast: 12, shadows: 10 } },
  { name: "Cálido", adjust: { warmth: 35, saturation: 8 } },
  { name: "Frío", adjust: { warmth: -32, tint: -5 } },
  { name: "Dramático", adjust: { contrast: 45, saturation: -12, shadows: -15, vignette: 55 } },
  { name: "Mate", adjust: { contrast: -22, brightness: 8, shadows: 25, saturation: -10 } },
  { name: "Vintage", adjust: { warmth: 25, saturation: -30, contrast: -8, grain: 30, vignette: 40, mode: "none" } },
  { name: "Noche", adjust: { brightness: -15, warmth: -25, saturation: -10, vignette: 45, contrast: 15 } },
  { name: "B/N", adjust: { mode: "gray", contrast: 20 } },
  { name: "B/N suave", adjust: { mode: "gray", contrast: -10, brightness: 6, grain: 15 } },
  { name: "Sepia", adjust: { mode: "sepia", contrast: 5, vignette: 25 } },
];

type Base = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  hidden?: boolean;
  locked?: boolean;
  tag?: "logo" | "brand-name" | "brand-contact"; // capas que agrega «Mi marca»
};

export type TextLayer = Base & {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  stroke: string;
  strokeWidth: number;
  shadow: boolean;
  bg: string; // "" = sin fondo
  bgRadius: number;
  padding: number;
  letterSpacing: number;
  uppercase: boolean;
  width?: number; // ancho de la caja de texto (el texto se acomoda en varias líneas)
};

export type BadgeShape = "circle" | "star" | "pill" | "ribbon";
export type BadgeLayer = Base & {
  type: "badge";
  text: string;
  shape: BadgeShape;
  size: number;
  fill: string;
  color: string;
  fontFamily: string;
};

export type ShapeKind = "rect" | "circle" | "line" | "arrow" | "star";
export type ShapeLayer = Base & {
  type: "shape";
  kind: ShapeKind;
  width: number;
  height: number;
  fill: string; // "" = sin relleno
  stroke: string;
  strokeWidth: number;
  radius: number;
};

export type ImageLayer = Base & {
  type: "image";
  src: string;
  width: number;
  height: number;
  radius: number;
};

export type Layer = TextLayer | BadgeLayer | ShapeLayer | ImageLayer;

export type Photo = {
  src: string;
  naturalW: number;
  naturalH: number;
  cx: number;
  cy: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

export type Doc = {
  format: FormatId;
  width: number;
  height: number;
  background: string;
  transparent?: boolean; // fondo transparente (logos sin fondo, se descarga en PNG)
  photo: Photo | null;
  adjust: Adjust;
  overlay: { on: boolean; color: string; strength: number }; // degradado inferior para leer textos
  frame: { on: boolean; color: string; width: number; radius: number };
  layers: Layer[];
};

export const emptyDoc = (): Doc => ({
  format: "1:1",
  width: 1080,
  height: 1080,
  background: "#0d1630",
  photo: null,
  adjust: { ...NEUTRAL },
  overlay: { on: false, color: "#000000", strength: 60 },
  frame: { on: false, color: "#e5243b", width: 24, radius: 0 },
  layers: [],
});

export const uid = () => Math.random().toString(36).slice(2, 10);

// Tamaño del lienzo para un formato (en «original» se usa la proporción de la foto).
export function sizeFor(format: FormatId, photo: Photo | null): [number, number] {
  const f = FORMATS.find((x) => x.id === format);
  if (f?.size) return f.size;
  if (!photo) return [1080, 1080];
  const max = 2048;
  const r = Math.min(1, max / Math.max(photo.naturalW, photo.naturalH));
  return [Math.round(photo.naturalW * r), Math.round(photo.naturalH * r)];
}

// Coloca la foto cubriendo todo el lienzo y centrada.
export function coverPhoto(p: Photo, W: number, H: number): Photo {
  const swap = Math.abs(p.rotation % 180) === 90;
  const iw = swap ? p.naturalH : p.naturalW;
  const ih = swap ? p.naturalW : p.naturalH;
  return { ...p, cx: W / 2, cy: H / 2, scale: Math.max(W / iw, H / ih) };
}

// Cambia de formato manteniendo las capas en posiciones proporcionales.
export function changeFormat(doc: Doc, format: FormatId): Doc {
  const [W, H] = sizeFor(format, doc.photo);
  const sx = W / doc.width;
  const sy = H / doc.height;
  const k = Math.min(sx, sy);
  return {
    ...doc,
    format,
    width: W,
    height: H,
    photo: doc.photo ? coverPhoto(doc.photo, W, H) : null,
    layers: doc.layers.map((l) => ({ ...l, x: l.x * sx, y: l.y * sy, scaleX: l.scaleX * k, scaleY: l.scaleY * k })),
  };
}

// ---------- Filtro de color: una sola pasada por los píxeles (rápido también en celulares) ----------

export function isNeutral(a: Adjust) {
  return (
    a.mode === "none" &&
    !a.brightness &&
    !a.contrast &&
    !a.saturation &&
    !a.warmth &&
    !a.tint &&
    !a.highlights &&
    !a.shadows &&
    !a.vignette &&
    !a.grain
  );
}

export function makeColorFilter(a: Adjust) {
  const bright = 1 + a.brightness / 100;
  const C = a.contrast * 2.2;
  const cf = (259 * (C + 255)) / (255 * (259 - C));
  const sat = 1 + a.saturation / 100;
  const warm = (a.warmth / 100) * 28;
  const tint = (a.tint / 100) * 20;
  const hi = a.highlights / 100;
  const sh = a.shadows / 100;
  const vig = a.vignette / 100;
  const grain = (a.grain / 100) * 40;

  return function colorFilter(imageData: ImageData) {
    const d = imageData.data;
    const W = imageData.width;
    const H = imageData.height;
    const cx = W / 2;
    const cy = H / 2;
    const maxD = cx * cx + cy * cy;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];

        if (a.mode === "gray") {
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          r = g = b = l;
        } else if (a.mode === "sepia") {
          const nr = 0.393 * r + 0.769 * g + 0.189 * b;
          const ng = 0.349 * r + 0.686 * g + 0.168 * b;
          const nb = 0.272 * r + 0.534 * g + 0.131 * b;
          r = nr;
          g = ng;
          b = nb;
        }

        r *= bright;
        g *= bright;
        b *= bright;

        // Luces y sombras
        if (hi || sh) {
          const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const adj = (hi * Math.max(0, l - 0.5) * 2 + sh * Math.max(0, 0.5 - l) * 2) * 60;
          r += adj;
          g += adj;
          b += adj;
        }

        r = cf * (r - 128) + 128;
        g = cf * (g - 128) + 128;
        b = cf * (b - 128) + 128;

        if (sat !== 1) {
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          r = l + (r - l) * sat;
          g = l + (g - l) * sat;
          b = l + (b - l) * sat;
        }

        r += warm;
        b -= warm;
        g -= tint;
        r += tint * 0.5;
        b += tint * 0.5;

        if (vig) {
          const dx = x - cx;
          const dy = y - cy;
          const f = 1 - vig * Math.pow((dx * dx + dy * dy) / maxD, 1.4) * 1.1;
          r *= f;
          g *= f;
          b *= f;
        }
        if (grain) {
          const n = (Math.random() - 0.5) * grain;
          r += n;
          g += n;
          b += n;
        }

        d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
  };
}

// ---------- Plantillas para agregar capas ----------

const base = (doc: Doc): Omit<Base, "id"> => ({
  x: doc.width * 0.1,
  y: doc.height * 0.4,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
});

export const FONTS = [
  "Montserrat",
  "Poppins",
  "Anton",
  "Bebas Neue",
  "Oswald",
  "Playfair Display",
  "Lobster",
  "Pacifico",
  "Permanent Marker",
  "Roboto Slab",
];

export type TextPreset = { name: string; make: (doc: Doc) => Partial<TextLayer> };

export const TEXT_PRESETS: TextPreset[] = [
  {
    name: "Título",
    make: (d) => ({ text: "TÍTULO", fontFamily: "Anton", fontSize: d.width * 0.12, fill: "#ffffff", stroke: "#000000", strokeWidth: 0, shadow: true, uppercase: true }),
  },
  {
    name: "Subtítulo",
    make: (d) => ({ text: "Subtítulo de tu publicación", fontFamily: "Montserrat", bold: true, fontSize: d.width * 0.05, fill: "#ffffff", shadow: true }),
  },
  {
    name: "Precio",
    make: (d) => ({ text: "$99", fontFamily: "Bebas Neue", fontSize: d.width * 0.14, fill: "#ffffff", bg: "#e5243b", padding: d.width * 0.02, bgRadius: d.width * 0.02 }),
  },
  {
    name: "Etiqueta",
    make: (d) => ({ text: "SOLO HOY", fontFamily: "Montserrat", bold: true, fontSize: d.width * 0.045, fill: "#0d1630", bg: "#ffd23f", padding: d.width * 0.018, bgRadius: d.width * 0.05, letterSpacing: 2 }),
  },
  {
    name: "Texto",
    make: (d) => ({ text: "Escribe tu mensaje aquí", fontFamily: "Poppins", fontSize: d.width * 0.042, fill: "#ffffff" }),
  },
  {
    name: "Manuscrito",
    make: (d) => ({ text: "¡Delicioso!", fontFamily: "Pacifico", fontSize: d.width * 0.08, fill: "#ffffff", shadow: true }),
  },
];

export function newText(doc: Doc, p: Partial<TextLayer> = {}): TextLayer {
  return {
    id: uid(),
    type: "text",
    ...base(doc),
    text: "Texto",
    fontFamily: "Montserrat",
    fontSize: doc.width * 0.06,
    fill: "#ffffff",
    bold: false,
    italic: false,
    align: "center",
    stroke: "#000000",
    strokeWidth: 0,
    shadow: false,
    bg: "",
    bgRadius: 0,
    padding: 0,
    letterSpacing: 0,
    uppercase: false,
    ...p,
  };
}

export const BADGES: { text: string; shape: BadgeShape; fill: string; color: string }[] = [
  { text: "2x1", shape: "star", fill: "#e5243b", color: "#ffffff" },
  { text: "OFERTA", shape: "circle", fill: "#ffd23f", color: "#0d1630" },
  { text: "NUEVO", shape: "pill", fill: "#e5243b", color: "#ffffff" },
  { text: "-50%", shape: "star", fill: "#ffd23f", color: "#e5243b" },
  { text: "¡HOY!", shape: "ribbon", fill: "#e5243b", color: "#ffffff" },
  { text: "GRATIS", shape: "circle", fill: "#32c48d", color: "#ffffff" },
  { text: "TOP", shape: "star", fill: "#0d1630", color: "#ffd23f" },
  { text: "PROMO", shape: "ribbon", fill: "#0d1630", color: "#ffffff" },
];

export function newBadge(doc: Doc, p: Partial<BadgeLayer>): BadgeLayer {
  return {
    id: uid(),
    type: "badge",
    ...base(doc),
    x: doc.width * 0.62,
    y: doc.height * 0.08,
    rotation: -12,
    text: "2x1",
    shape: "star",
    size: doc.width * 0.26,
    fill: "#e5243b",
    color: "#ffffff",
    fontFamily: "Anton",
    ...p,
  };
}

export const EMOJIS = ["🔥", "⭐", "❤️", "🎉", "✨", "👉", "✅", "📍", "🆕", "💥", "🌮", "🍔", "🥤", "☕", "🍕", "🎁", "📞", "🛵"];

export function newShape(doc: Doc, kind: ShapeKind): ShapeLayer {
  const w = doc.width * 0.4;
  const h = kind === "line" || kind === "arrow" ? 0 : kind === "circle" || kind === "star" ? w : doc.width * 0.18;
  return {
    id: uid(),
    type: "shape",
    ...base(doc),
    x: doc.width * 0.3,
    kind,
    width: w,
    height: h,
    fill: kind === "line" || kind === "arrow" ? "" : "#e5243b",
    stroke: kind === "line" || kind === "arrow" ? "#ffffff" : "",
    strokeWidth: kind === "line" || kind === "arrow" ? doc.width * 0.012 : 0,
    radius: kind === "rect" ? doc.width * 0.02 : 0,
  };
}

export function newImage(doc: Doc, src: string, w: number, h: number): ImageLayer {
  const target = doc.width * 0.28;
  const r = target / Math.max(w, h);
  return {
    id: uid(),
    type: "image",
    ...base(doc),
    x: doc.width - w * r - doc.width * 0.05,
    y: doc.width * 0.05,
    src,
    width: w * r,
    height: h * r,
    radius: 0,
  };
}

export const SWATCHES = ["#ffffff", "#000000", "#0d1630", "#e5243b", "#ffd23f", "#32c48d", "#2f80ed", "#ff7a00", "#8e44ad", "#f5e6c8"];

// ---------- Mi marca en el editor ----------


export const brandFont = (b: Brand) => (b.font && FONTS.includes(b.font) ? b.font : "Montserrat");

// Texto enviado desde «Textos»: caja centrada que se acomoda en varias líneas.
export function textFromCopy(doc: Doc, text: string, b: Brand): TextLayer {
  const clean = text.trim();
  const short = clean.length <= 40;
  const fontSize = doc.width * (short ? 0.085 : clean.length <= 90 ? 0.06 : 0.045);
  return newText(doc, {
    text: clean,
    fontFamily: short ? brandFont(b) : "Montserrat",
    bold: !short,
    fontSize,
    width: doc.width * 0.84,
    x: doc.width * 0.08,
    y: doc.height * 0.38,
    align: "center",
    shadow: true,
  });
}

export function logoLayer(doc: Doc, src: string, w: number, h: number): ImageLayer {
  const target = Math.min(doc.width, doc.height) * 0.2;
  const r = target / Math.max(w, h);
  const m = Math.min(doc.width, doc.height) * 0.045;
  return { ...newImage(doc, src, w, h), x: doc.width - w * r - m, y: m, width: w * r, height: h * r, tag: "logo" };
}

export function brandNameLayer(doc: Doc, b: Brand): TextLayer {
  const accent = brandAccent(b);
  const fs = Math.min(doc.width, doc.height) * 0.05;
  return newText(doc, {
    tag: "brand-name",
    text: b.name || "Mi negocio",
    fontFamily: brandFont(b),
    bold: true,
    fontSize: fs,
    fill: textOn(accent),
    bg: accent,
    padding: fs * 0.45,
    bgRadius: fs * 0.35,
    align: "center",
    width: doc.width * 0.6,
    x: doc.width * 0.2,
    y: doc.height - fs * 2.2 - Math.min(doc.width, doc.height) * 0.05 - (b.contact ? fs * 1.4 : 0),
  });
}

export function brandContactLayer(doc: Doc, b: Brand): TextLayer {
  const fs = Math.min(doc.width, doc.height) * 0.032;
  return newText(doc, {
    tag: "brand-contact",
    text: b.contact || "tu teléfono o web",
    fontFamily: "Montserrat",
    bold: true,
    fontSize: fs,
    fill: "#ffffff",
    shadow: true,
    align: "center",
    width: doc.width * 0.84,
    x: doc.width * 0.08,
    y: doc.height - fs * 1.4 - Math.min(doc.width, doc.height) * 0.05,
  });
}

// «Aplicar mi marca»: pasa los colores y la letra de la marca a lo que ya hay en el diseño
// y agrega (o actualiza) el nombre y el contacto. El logo se agrega aparte porque hay que cargarlo.
export function applyBrandToDoc(doc: Doc, b: Brand): Doc {
  const accent = brandAccent(b);
  const second = b.palette[1] || accent;
  const font = brandFont(b);
  let layers = doc.layers.map((l): Layer => {
    if (l.tag) return l;
    if (l.type === "badge") return { ...l, fill: accent, color: textOn(accent) };
    if (l.type === "shape") return l.fill ? { ...l, fill: accent } : { ...l, stroke: accent };
    if (l.type === "text") {
      const isEmoji = /^\p{Extended_Pictographic}+$/u.test(l.text.trim());
      if (isEmoji) return l;
      const big = l.fontSize >= Math.min(doc.width, doc.height) * 0.07;
      return {
        ...l,
        fontFamily: big ? font : l.fontFamily,
        ...(l.bg ? { bg: accent, fill: textOn(accent) } : {}),
      };
    }
    return l;
  });
  const has = (t: string) => layers.some((l) => l.tag === t);
  if (b.name) {
    layers = has("brand-name")
      ? layers.map((l) => (l.tag === "brand-name" && l.type === "text" ? { ...l, text: b.name, fontFamily: font, bg: accent, fill: textOn(accent) } : l))
      : [...layers, brandNameLayer(doc, b)];
  }
  if (b.contact) {
    layers = has("brand-contact")
      ? layers.map((l) => (l.tag === "brand-contact" && l.type === "text" ? { ...l, text: b.contact } : l))
      : [...layers, brandContactLayer(doc, b)];
  }
  return {
    ...doc,
    background: doc.photo ? doc.background : b.palette.find((c) => c !== accent) || doc.background,
    frame: { ...doc.frame, color: doc.frame.on ? second : accent },
    overlay: doc.overlay,
    layers,
  };
}
