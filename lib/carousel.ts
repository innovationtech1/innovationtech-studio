"use client";

// Carruseles de Instagram: arma cada diapositiva como un diseño del editor (Doc),
// con la marca del usuario, texto que se acomoda solo y una barra de avance continua.

import Konva from "konva";
import { Brand, textOn } from "./brand";
import { CarouselFormat, CarouselStyle, paletteFor, SIZES } from "./carousel-estilos";

export { CAROUSEL_FORMATS, CAROUSEL_STYLES, SIZES } from "./carousel-estilos";
export type { CarouselFormat, CarouselStyle } from "./carousel-estilos";
import { brandFont, coverPhoto, Doc, emptyDoc, Layer, newImage, newShape, newText, TextLayer } from "./editor-model";
import { tr } from "./i18n";

export type Slide = {
  id: string;
  title: string;
  body: string;
  photo?: string; // foto de fondo (data URL o enlace)
  photoSize?: [number, number];
  edited?: string; // imagen terminada en el editor (reemplaza al diseño automático)
};

// Mide la altura de un texto con el mismo motor que lo dibuja.
function measure(l: Pick<TextLayer, "text" | "fontFamily" | "fontSize" | "bold" | "italic" | "width" | "letterSpacing" | "uppercase">) {
  const t = new Konva.Text({
    text: l.uppercase ? l.text.toUpperCase() : l.text,
    fontFamily: `${l.fontFamily}, Arial, sans-serif`,
    fontSize: l.fontSize,
    fontStyle: [l.italic ? "italic" : "", l.bold ? "bold" : ""].filter(Boolean).join(" ") || "normal",
    letterSpacing: l.letterSpacing,
    lineHeight: 1.12,
    width: l.width,
  });
  const h = t.height();
  t.destroy();
  return h;
}

// Texto que se achica solo hasta caber en la altura disponible.
function fitText(doc: Doc, p: Partial<TextLayer> & { text: string; fontSize: number; width: number }, maxH: number, min = 0.5): TextLayer {
  const start = p.fontSize;
  let l = newText(doc, { bold: false, align: "left", ...p });
  while (measure(l) > maxH && l.fontSize > start * min) l = { ...l, fontSize: l.fontSize * 0.94 };
  return l;
}

const heightOf = (l: TextLayer) => (l.text.trim() ? measure(l) : 0);

export type BuildOpts = {
  style: CarouselStyle;
  format: CarouselFormat;
  brand: Brand;
  logo?: { src: string; w: number; h: number } | null;
};

// Arma el diseño de la diapositiva i (de n).
export function buildSlideDoc(slide: Slide, i: number, n: number, o: BuildOpts): Doc {
  const [W, H] = SIZES[o.format];
  // Unidad de diseño. En vertical y cuadrado es el ancho (igual que siempre); en horizontal se
  // limita según el alto, para que letras y márgenes no salgan gigantes.
  const U = Math.min(W, H * 1.25);
  const photo = !!(slide.photo && slide.photoSize);
  const c = paletteFor(o.style, o.brand, photo);
  const doc: Doc = { ...emptyDoc(), format: o.format, width: W, height: H, background: c.bg };
  if (photo) {
    const [pw, ph] = slide.photoSize!;
    doc.photo = coverPhoto({ src: slide.photo!, naturalW: pw, naturalH: ph, cx: 0, cy: 0, scale: 1, rotation: 0, flipX: false, flipY: false }, W, H);
    doc.overlay = { on: true, color: "#000000", strength: 88 };
  }
  const m = U * 0.08;
  const font = brandFont(o.brand);
  const isCover = i === 0;
  const isLast = i === n - 1 && n > 1;
  const layers: Layer[] = [];

  // --- Encabezado: nombre de la marca y logo ---
  let top = m;
  if (o.logo) {
    const img = newImage(doc, o.logo.src, o.logo.w, o.logo.h);
    const r = (U * 0.11) / Math.max(o.logo.w, o.logo.h);
    layers.push({ ...img, width: o.logo.w * r, height: o.logo.h * r, x: W - m - o.logo.w * r, y: m * 0.8, tag: "logo" });
    top = Math.max(top, m * 0.8 + o.logo.h * r + U * 0.02);
  }
  if (o.brand.name) {
    const name = newText(doc, {
      tag: "brand-name",
      text: o.brand.name,
      fontFamily: "Montserrat",
      bold: true,
      uppercase: true,
      letterSpacing: U * 0.004,
      fontSize: U * 0.028,
      fill: c.muted,
      align: "left",
      width: U * 0.6,
      x: m,
      y: m,
    });
    layers.push(name);
    top = Math.max(top, m + heightOf(name) + U * 0.03);
  }

  // --- Pie: «Desliza», contador y barra de avance continua ---
  const barH = U * 0.009;
  const barY = H - m * 0.85;
  const footFs = U * 0.03;
  const footY = barY - footFs * 1.9;
  if (n > 1) {
    layers.push({ ...newShape(doc, "rect"), x: m, y: barY, width: W - 2 * m, height: barH, fill: c.track, radius: barH / 2, locked: true });
    layers.push({ ...newShape(doc, "rect"), x: m, y: barY, width: ((W - 2 * m) * (i + 1)) / n, height: barH, fill: c.accent, radius: barH / 2, locked: true });
    layers.push(
      newText(doc, { text: `${i + 1}/${n}`, fontFamily: "Montserrat", bold: true, fontSize: footFs, fill: c.muted, align: "right", width: U * 0.3, x: W - m - U * 0.3, y: footY })
    );
    if (!isLast)
      layers.push(
        newText(doc, {
          text: isCover ? `${tr("Desliza")}  →` : "→",
          fontFamily: "Montserrat",
          bold: true,
          fontSize: isCover ? footFs : footFs * 1.5,
          fill: isCover ? textOn(c.accent) : c.muted,
          bg: isCover ? c.accent : "",
          padding: footFs * 0.55,
          bgRadius: footFs,
          align: "left",
          x: m,
          y: footY - (isCover ? footFs * 0.55 : footFs * 0.3),
        })
      );
  }
  const bottom = footY - U * 0.05;
  const avail = bottom - top;
  const textW = W - 2 * m;

  if (isCover) {
    const title = fitText(doc, { text: slide.title, fontFamily: font, bold: true, fontSize: U * 0.105, width: textW, fill: c.text, x: m }, avail * 0.7, 0.45);
    const body = fitText(doc, { text: slide.body, fontFamily: "Montserrat", fontSize: U * 0.044, width: textW * 0.92, fill: c.muted, x: m }, avail * 0.25);
    const bar = U * 0.012;
    const gap1 = U * 0.04;
    const gap2 = U * 0.035;
    const th = heightOf(title);
    const bh = heightOf(body);
    const block = bar + gap1 + th + (bh ? gap2 + bh : 0);
    // Con foto, el texto va abajo (sobre el degradado); sin foto, al centro.
    const y0 = photo ? bottom - block : top + Math.max(0, (avail - block) / 2);
    layers.push({ ...newShape(doc, "rect"), x: m, y: y0, width: U * 0.14, height: bar, fill: c.accent, radius: bar / 2 });
    layers.push({ ...title, y: y0 + bar + gap1 });
    if (bh) layers.push({ ...body, y: y0 + bar + gap1 + th + gap2 });
  } else if (isLast) {
    const title = fitText(doc, { text: slide.title, fontFamily: font, bold: true, fontSize: U * 0.085, width: textW, fill: c.text, align: "center", x: m }, avail * 0.45, 0.5);
    const body = fitText(doc, { text: slide.body, fontFamily: "Montserrat", fontSize: U * 0.044, width: textW, fill: c.muted, align: "center", x: m }, avail * 0.25);
    const pills: TextLayer[] = [];
    const pfs = U * 0.042;
    if (o.brand.name)
      pills.push(
        newText(doc, {
          text: o.brand.name,
          fontFamily: font,
          bold: true,
          fontSize: pfs,
          fill: textOn(c.accent),
          bg: c.accent,
          padding: pfs * 0.5,
          bgRadius: pfs * 0.4,
          align: "center",
          width: textW,
          x: m,
        })
      );
    if (o.brand.contact)
      pills.push(newText(doc, { text: o.brand.contact, fontFamily: "Montserrat", bold: true, fontSize: U * 0.034, fill: c.text, align: "center", width: textW, x: m }));
    const gap = U * 0.045;
    const parts = [title, body, ...pills].filter((l) => l.text.trim());
    const hs = parts.map((l) => heightOf(l) + (l.bg ? l.padding * 2 : 0));
    const block = hs.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
    let y = top + Math.max(0, (avail - block) / 2);
    parts.forEach((l, k) => {
      layers.push({ ...l, y });
      y += hs[k] + gap;
    });
    // El nombre de arriba sobra en el cierre si ya va la píldora con el nombre.
    if (o.brand.name) {
      const idx = layers.findIndex((l) => l.tag === "brand-name");
      if (idx >= 0) layers.splice(idx, 1);
    }
  } else {
    const num = newText(doc, { text: String(i).padStart(2, "0"), fontFamily: font, bold: true, fontSize: U * 0.17, fill: c.number, align: "left", x: m });
    const title = fitText(doc, { text: slide.title, fontFamily: font, bold: true, fontSize: U * 0.075, width: textW, fill: c.text, x: m }, avail * 0.36, 0.5);
    const body = fitText(doc, { text: slide.body, fontFamily: "Montserrat", fontSize: U * 0.046, width: textW, fill: c.muted, x: m }, avail * 0.42, 0.55);
    const nh = heightOf(num) * 0.86;
    const th = heightOf(title);
    const bh = heightOf(body);
    const g1 = U * 0.02;
    const g2 = U * 0.04;
    const block = nh + g1 + th + (bh ? g2 + bh : 0);
    const y0 = photo ? bottom - block : top + Math.max(0, (avail - block) / 2) * 0.7;
    layers.push({ ...num, y: y0 });
    layers.push({ ...title, y: y0 + nh + g1 });
    if (bh) layers.push({ ...body, y: y0 + nh + g1 + th + g2 });
  }

  doc.layers = layers;
  return doc;
}
