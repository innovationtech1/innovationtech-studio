// Plantillas listas por giro de negocio. Cada una arma un diseño editable del editor
// con los colores, la letra, el nombre y el contacto de «Mi marca».

import { Brand, brandAccent, brandDark, luminance, textOn } from "./brand";
import {
  BadgeLayer,
  brandContactLayer,
  brandFont,
  brandNameLayer,
  Doc,
  emptyDoc,
  FORMATS,
  FormatId,
  Layer,
  newBadge,
  newShape,
  newText,
  ShapeLayer,
  TextLayer,
} from "./editor-model";

export type Giro = "comida" | "belleza" | "inmuebles" | "tienda" | "eventos" | "servicios";

export const GIROS: { id: Giro; label: string }[] = [
  { id: "comida", label: "Restaurantes y comida" },
  { id: "belleza", label: "Barbería y belleza" },
  { id: "inmuebles", label: "Bienes raíces" },
  { id: "tienda", label: "Tiendas y ropa" },
  { id: "eventos", label: "Eventos" },
  { id: "servicios", label: "Servicios" },
];

type Ctx = {
  W: number;
  H: number;
  u: number; // unidad = lado corto
  A: string; // acento
  D: string; // oscuro
  L: string; // claro
  Y: string; // segundo acento
  F: string; // letra de títulos
  doc: Doc;
  b: Brand;
};

export type Template = { id: string; giro: Giro; name: string; build: (c: Ctx) => { background: string; layers: Layer[]; overlay?: boolean; frame?: string } };

// Atajos para escribir plantillas con medidas relativas
const text = (c: Ctx, t: string, o: { y: number; size: number; x?: number; w?: number } & Partial<TextLayer>): TextLayer => {
  const { y, size, x = 0.08, w = 0.84, ...rest } = o;
  return newText(c.doc, { text: t, x: c.W * x, y: c.H * y, width: c.W * w, fontSize: c.u * size, align: "center", fontFamily: c.F, fill: "#ffffff", ...rest });
};
const rect = (c: Ctx, o: { x: number; y: number; w: number; h: number; fill: string; r?: number; rot?: number; opacity?: number }): ShapeLayer => ({
  ...newShape(c.doc, "rect"),
  x: c.W * o.x,
  y: c.H * o.y,
  width: c.W * o.w,
  height: c.H * o.h,
  fill: o.fill,
  radius: (o.r || 0) * c.u,
  rotation: o.rot || 0,
  opacity: o.opacity ?? 1,
  locked: true,
});
const circle = (c: Ctx, o: { cx: number; cy: number; d: number; fill: string; opacity?: number; stroke?: string; sw?: number }): ShapeLayer => ({
  ...newShape(c.doc, "circle"),
  x: c.W * o.cx - (c.u * o.d) / 2,
  y: c.H * o.cy - (c.u * o.d) / 2,
  width: c.u * o.d,
  height: c.u * o.d,
  fill: o.fill,
  stroke: o.stroke || "",
  strokeWidth: (o.sw || 0) * c.u,
  opacity: o.opacity ?? 1,
  locked: true,
});
const badge = (c: Ctx, t: string, o: { x: number; y: number; d: number; shape: BadgeLayer["shape"]; fill: string; color?: string; rot?: number }): BadgeLayer =>
  newBadge(c.doc, { text: t, x: c.W * o.x, y: c.H * o.y, size: c.u * o.d, shape: o.shape, fill: o.fill, color: o.color || textOn(o.fill), rotation: o.rot ?? -10, fontFamily: c.F });
const footer = (c: Ctx, light = false): Layer[] => {
  const n = brandNameLayer(c.doc, c.b);
  const ct = brandContactLayer(c.doc, c.b);
  return [n, light ? { ...ct, fill: c.D, shadow: false } : ct];
};

export const TEMPLATES: Template[] = [
  // ---------- Restaurantes y comida ----------
  {
    id: "comida-2x1",
    giro: "comida",
    name: "Promo 2x1",
    build: (c) => ({
      background: c.A,
      layers: [
        circle(c, { cx: 0.92, cy: 0.1, d: 0.62, fill: c.D, opacity: 0.35 }),
        circle(c, { cx: 0.05, cy: 0.95, d: 0.48, fill: c.Y, opacity: 0.9 }),
        text(c, "2x1", { y: 0.14, size: 0.34, fill: textOn(c.A), shadow: true }),
        text(c, "en todas las tortas", { y: 0.5, size: 0.075, fontFamily: "Montserrat", bold: true, fill: textOn(c.A) }),
        text(c, "SOLO LOS MARTES", { y: 0.62, size: 0.05, x: 0.25, w: 0.5, fontFamily: "Montserrat", bold: true, fill: textOn(c.Y), bg: c.Y, padding: c.u * 0.02, bgRadius: c.u * 0.04, letterSpacing: 2 }),
        ...footer(c),
      ],
    }),
  },
  {
    id: "comida-nuevo",
    giro: "comida",
    name: "Nuevo en el menú",
    build: (c) => ({
      background: c.D,
      overlay: true,
      layers: [
        rect(c, { x: -0.1, y: 0.1, w: 1.2, h: 0.17, fill: c.A, rot: -5 }),
        text(c, "¡NUEVO EN EL MENÚ!", { y: 0.135, size: 0.085, uppercase: true, fill: textOn(c.A) }),
        text(c, "Prueba nuestra torta especial de la casa", { y: 0.4, size: 0.065, fontFamily: "Montserrat", bold: true, shadow: true }),
        badge(c, "$9.99", { x: 0.64, y: 0.53, d: 0.27, shape: "star", fill: c.Y }),
        ...footer(c),
      ],
    }),
  },
  {
    id: "comida-abierto",
    giro: "comida",
    name: "Abierto hoy",
    build: (c) => ({
      background: "#f5e6c8",
      layers: [
        text(c, "¡ABIERTO HOY!", { y: 0.18, size: 0.13, fill: c.A }),
        text(c, "Lunes a sábado", { y: 0.42, size: 0.06, fontFamily: "Montserrat", bold: true, fill: c.D }),
        text(c, "10:00 am – 9:00 pm", { y: 0.51, size: 0.075, fontFamily: "Montserrat", bold: true, fill: c.D }),
        ...footer(c, true),
      ],
      frame: c.A,
    }),
  },

  // ---------- Barbería y belleza ----------
  {
    id: "belleza-cita",
    giro: "belleza",
    name: "Agenda tu cita",
    build: (c) => ({
      background: c.D,
      overlay: true,
      layers: [
        rect(c, { x: 0.08, y: 0.2, w: 0.12, h: 0.008, fill: c.A }),
        text(c, "AGENDA TU CITA", { y: 0.24, size: 0.11, uppercase: true, shadow: true }),
        text(c, "Corte + barba", { y: 0.47, size: 0.06, fontFamily: "Montserrat" }),
        text(c, "$25", { y: 0.55, size: 0.14, fill: c.A, shadow: true }),
        ...footer(c),
      ],
      frame: c.A,
    }),
  },
  {
    id: "belleza-descuento",
    giro: "belleza",
    name: "Descuento primera visita",
    build: (c) => ({
      background: c.A,
      layers: [
        circle(c, { cx: 0.5, cy: 0.33, d: 0.52, fill: "", stroke: textOn(c.A), sw: 0.012 }),
        text(c, "-20%", { y: 0.22, size: 0.19, fill: textOn(c.A) }),
        text(c, "en tu primera visita", { y: 0.66, size: 0.06, fontFamily: "Montserrat", bold: true, fill: textOn(c.A), x: 0.08 }),
        ...footer(c).map((l) => (l.type === "text" && l.tag === "brand-name" ? { ...l, bg: c.D, fill: textOn(c.D) } : l)),
      ],
    }),
  },

  // ---------- Bienes raíces ----------
  {
    id: "inmuebles-venta",
    giro: "inmuebles",
    name: "Casa en venta",
    build: (c) => ({
      background: "#ffffff",
      overlay: false,
      layers: [
        rect(c, { x: 0, y: 0.62, w: 1, h: 0.38, fill: c.D }),
        text(c, "SE VENDE", { y: 0.1, size: 0.16, fill: c.D }),
        text(c, "3 recámaras · 2 baños · 1,800 ft²", { y: 0.33, size: 0.05, fontFamily: "Montserrat", bold: true, fill: c.D }),
        text(c, "$285,000", { y: 0.44, size: 0.075, x: 0.25, w: 0.5, fontFamily: "Montserrat", bold: true, fill: textOn(c.A), bg: c.A, padding: c.u * 0.02, bgRadius: c.u * 0.03 }),
        ...footer(c),
      ],
    }),
  },
  {
    id: "inmuebles-open",
    giro: "inmuebles",
    name: "Open house",
    build: (c) => ({
      background: c.D,
      overlay: true,
      layers: [
        text(c, "OPEN HOUSE", { y: 0.14, size: 0.14, shadow: true }),
        rect(c, { x: 0.38, y: 0.33, w: 0.24, h: 0.008, fill: c.A }),
        text(c, "Sábado de 10 am a 2 pm", { y: 0.38, size: 0.06, fontFamily: "Montserrat", bold: true }),
        text(c, "123 Calle Principal, San Antonio", { y: 0.47, size: 0.045, fontFamily: "Montserrat" }),
        ...footer(c),
      ],
    }),
  },

  // ---------- Tiendas y ropa ----------
  {
    id: "tienda-coleccion",
    giro: "tienda",
    name: "Nueva colección",
    build: (c) => ({
      background: "#f5e6c8",
      layers: [
        rect(c, { x: 0.62, y: 0, w: 0.38, h: 1, fill: c.A, opacity: 0.9 }),
        text(c, "Nueva\ncolección", { y: 0.28, size: 0.12, x: 0.06, w: 0.6, align: "left", fontFamily: "Playfair Display", fill: c.D }),
        text(c, "Ya disponible en tienda y en línea", { y: 0.6, size: 0.045, x: 0.06, w: 0.52, align: "left", fontFamily: "Montserrat", fill: c.D }),
        ...footer(c, true),
      ],
    }),
  },
  {
    id: "tienda-liquidacion",
    giro: "tienda",
    name: "Liquidación",
    build: (c) => ({
      background: c.D,
      overlay: true,
      layers: [
        text(c, "LIQUIDACIÓN", { y: 0.14, size: 0.13, fill: c.A, shadow: true }),
        text(c, "hasta", { y: 0.33, size: 0.06, fontFamily: "Montserrat" }),
        text(c, "50%", { y: 0.39, size: 0.22, shadow: true }),
        badge(c, "¡HOY!", { x: 0.68, y: 0.4, d: 0.26, shape: "ribbon", fill: c.Y, rot: 12 }),
        ...footer(c),
      ],
    }),
  },

  // ---------- Eventos ----------
  {
    id: "eventos-inauguracion",
    giro: "eventos",
    name: "Gran inauguración",
    build: (c) => ({
      background: c.D,
      layers: [
        circle(c, { cx: 0.12, cy: 0.12, d: 0.3, fill: c.A, opacity: 0.85 }),
        circle(c, { cx: 0.9, cy: 0.22, d: 0.16, fill: c.Y, opacity: 0.85 }),
        circle(c, { cx: 0.85, cy: 0.88, d: 0.4, fill: c.A, opacity: 0.35 }),
        text(c, "GRAN\nINAUGURACIÓN", { y: 0.24, size: 0.12, shadow: true }),
        text(c, "Sábado 15 · 6:00 pm", { y: 0.53, size: 0.065, fontFamily: "Montserrat", bold: true, fill: c.Y }),
        text(c, "Música, comida y sorpresas", { y: 0.61, size: 0.045, fontFamily: "Montserrat" }),
        ...footer(c),
      ],
    }),
  },
  {
    id: "eventos-invitacion",
    giro: "eventos",
    name: "Te invitamos",
    build: (c) => ({
      background: c.A,
      layers: [
        rect(c, { x: 0.07, y: 0.07, w: 0.86, h: 0.86, fill: c.D, r: 0.05 }),
        text(c, "Te invitamos", { y: 0.17, size: 0.1, fontFamily: "Pacifico", fill: c.Y }),
        text(c, "a nuestro taller gratuito", { y: 0.34, size: 0.06, fontFamily: "Montserrat", bold: true }),
        text(c, "Jueves 7 pm · Cupo limitado", { y: 0.47, size: 0.045, fontFamily: "Montserrat" }),
        ...footer(c),
      ],
    }),
  },

  // ---------- Servicios ----------
  {
    id: "servicios-contratanos",
    giro: "servicios",
    name: "Contrátanos",
    build: (c) => ({
      background: c.D,
      layers: [
        rect(c, { x: 0, y: 0, w: 0.035, h: 1, fill: c.A }),
        text(c, "¿Necesitas ayuda\ncon tu negocio?", { y: 0.1, size: 0.085, x: 0.1, w: 0.82, align: "left", shadow: false }),
        text(c, "✅ Diseño de logo\n✅ Redes sociales\n✅ Páginas web", { y: 0.38, size: 0.055, x: 0.1, w: 0.82, align: "left", fontFamily: "Montserrat", bold: true }),
        text(c, "Escríbenos hoy", { y: 0.6, size: 0.05, x: 0.1, w: 0.55, align: "left", fontFamily: "Montserrat", bold: true, fill: textOn(c.A), bg: c.A, padding: c.u * 0.02, bgRadius: c.u * 0.02 }),
        ...footer(c),
      ],
    }),
  },
  {
    id: "servicios-aviso",
    giro: "servicios",
    name: "Aviso importante",
    build: (c) => ({
      background: c.Y,
      layers: [
        rect(c, { x: 0, y: 0, w: 1, h: 0.16, fill: c.D }),
        text(c, "AVISO IMPORTANTE", { y: 0.045, size: 0.065, fontFamily: "Montserrat", bold: true, letterSpacing: 3 }),
        text(c, "Este lunes cerramos\npor día festivo", { y: 0.3, size: 0.085, fill: textOn(c.Y) }),
        text(c, "Te esperamos el martes en horario normal", { y: 0.57, size: 0.045, fontFamily: "Montserrat", fill: textOn(c.Y) }),
        ...footer(c, luminance(c.Y) > 0.5),
      ],
    }),
  },
  {
    id: "servicios-gracias",
    giro: "servicios",
    name: "Gracias",
    build: (c) => ({
      background: c.A,
      layers: [
        circle(c, { cx: 0.5, cy: 0.36, d: 0.5, fill: c.D, opacity: 0.25 }),
        text(c, "¡Gracias!", { y: 0.24, size: 0.16, fontFamily: "Pacifico", fill: textOn(c.A) }),
        text(c, "por elegirnos todos los días", { y: 0.55, size: 0.06, fontFamily: "Montserrat", bold: true, fill: textOn(c.A) }),
        ...footer(c).map((l) => (l.type === "text" && l.tag === "brand-name" ? { ...l, bg: c.D, fill: textOn(c.D) } : l)),
      ],
    }),
  },
];

// Arma el diseño de una plantilla en el formato pedido.
export function buildTemplate(t: Template, b: Brand, format: FormatId = "1:1"): Doc {
  const size = FORMATS.find((f) => f.id === format)?.size || [1080, 1080];
  const [W, H] = size;
  const base: Doc = { ...emptyDoc(), format: format === "original" ? "1:1" : format, width: W, height: H };
  const palette = b.palette;
  const A = brandAccent(b);
  const D = brandDark(b);
  const Y = palette.find((c) => c !== A && c !== D && luminance(c) > 0.3) || "#ffd23f";
  const c: Ctx = { W, H, u: Math.min(W, H), A, D, L: "#ffffff", Y, F: b.font ? brandFont(b) : "Anton", doc: base, b };
  const r = t.build(c);
  // Sin nombre ni contacto en Mi marca, se quitan esos textos de ejemplo… salvo el nombre (para que se vea dónde va).
  const layers = fitTexts(r.layers.filter((l) => !(l.tag === "brand-contact" && !b.contact)), c.u);
  return {
    ...base,
    background: r.background,
    overlay: { on: !!r.overlay, color: "#000000", strength: 55 },
    frame: r.frame ? { on: true, color: r.frame, width: Math.round(c.u * 0.022), radius: 0 } : base.frame,
    layers,
    template: t.id,
  };
}

// Achica los textos hasta que quepan en su caja sin partir palabras ni crecer de líneas:
// los títulos (grandes) en las líneas que ya traen; los demás en máximo 2 líneas.
let measureCtx: CanvasRenderingContext2D | null = null;
function fitTexts(layers: Layer[], u: number): Layer[] {
  if (typeof document === "undefined") return layers;
  measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
  const ctx = measureCtx;
  if (!ctx) return layers;
  return layers.map((l) => {
    if (l.type !== "text" || !l.width) return l;
    const lines = (l.uppercase ? l.text.toUpperCase() : l.text).split("\n");
    const maxLines = l.fontSize >= u * 0.08 ? lines.length : Math.max(lines.length, 2);
    const inner = l.width - (l.bg ? l.padding * 2 : 0);
    let size = l.fontSize;
    for (let i = 0; i < 30; i++) {
      ctx.font = `${l.bold ? "bold " : ""}${size}px "${l.fontFamily}", Arial, sans-serif`;
      const sp = (l.letterSpacing || 0) * 1;
      const w = (t: string) => ctx.measureText(t).width + sp * t.length;
      let used = 0;
      let wordTooWide = false;
      for (const line of lines) {
        const words = line.split(" ");
        let cur = "";
        let n = 1;
        for (const word of words) {
          if (w(word) > inner) wordTooWide = true;
          const t = cur ? `${cur} ${word}` : word;
          if (w(t) > inner && cur) {
            n++;
            cur = word;
          } else cur = t;
        }
        used += n;
      }
      if (!wordTooWide && used <= maxLines) break;
      size *= 0.93;
    }
    return size === l.fontSize ? l : { ...l, fontSize: size, padding: l.bg ? l.padding * (size / l.fontSize) : l.padding };
  });
}

// Fuentes que usa una plantilla (para cargarlas antes de medir)
export async function loadTemplateFonts(fonts: string[]) {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.race([
    Promise.all(fonts.flatMap((f) => [document.fonts.load(`40px "${f}"`), document.fonts.load(`bold 40px "${f}"`)])).catch(() => {}),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
}
export const TEMPLATE_FONTS = ["Anton", "Montserrat", "Playfair Display", "Pacifico"];
