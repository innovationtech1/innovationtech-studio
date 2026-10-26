// Kit de marca: se guarda en el navegador de cada usuario. Se usa en cada pedido a la IA
// y se aplica con un toque en el editor de imágenes y en los reels (logo, colores y letra).

export type Brand = {
  name: string;
  industry: string;
  audience: string;
  tone: string;
  colors: string; // descripción en palabras (para la IA)
  extra: string;
  logo: string; // data URL (PNG, máx. 512 px)
  palette: string[]; // colores en hex; el primero es el principal
  font: string; // tipografía de títulos
  contact: string; // teléfono, web o redes
};

export const DEFAULT_PALETTE = ["#e5243b", "#0d1630", "#ffffff"];

export const emptyBrand: Brand = {
  name: "",
  industry: "",
  audience: "",
  tone: "",
  colors: "",
  extra: "",
  logo: "",
  palette: [],
  font: "",
  contact: "",
};

// Acepta marcas guardadas con versiones anteriores de la app.
export function normalizeBrand(raw: Partial<Brand> | null | undefined, legacy?: { logo?: string; accent?: string }): Brand {
  const b = { ...emptyBrand, ...(raw || {}) };
  if (!Array.isArray(b.palette)) b.palette = [];
  b.palette = b.palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5);
  if (!b.logo && legacy?.logo?.startsWith("data:")) b.logo = legacy.logo;
  if (b.palette.length === 0 && legacy?.accent && /^#[0-9a-f]{6}$/i.test(legacy.accent)) b.palette = [legacy.accent];
  return b;
}

export const hasVisualBrand = (b: Brand) => !!(b.logo || b.palette.length || b.font || b.name);

export const brandAccent = (b: Brand) => b.palette[0] || DEFAULT_PALETTE[0];
export const brandDark = (b: Brand) => {
  // El color más oscuro que no sea el principal (para fondos y franjas)
  const others = b.palette.slice(1).filter((c) => luminance(c) < 0.12).sort((x, y) => luminance(x) - luminance(y));
  return others[0] || DEFAULT_PALETTE[1];
};

// Texto legible (blanco o casi negro) sobre un color de fondo.
export function textOn(bg: string) {
  return luminance(bg) > 0.55 ? "#0d1630" : "#ffffff";
}

export function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function colorWords(b: Brand) {
  return b.colors || (b.palette.length ? b.palette.join(", ") : "");
}

export function brandContext(b: Brand): string {
  const parts = [
    b.name && `Marca: ${b.name}`,
    b.industry && `Giro: ${b.industry}`,
    b.audience && `Público objetivo: ${b.audience}`,
    b.tone && `Tono de voz: ${b.tone}`,
    colorWords(b) && `Colores de marca: ${colorWords(b)}`,
    b.contact && `Contacto: ${b.contact}`,
    b.extra && `Notas: ${b.extra}`,
  ].filter(Boolean);
  return parts.join("\n");
}

// Versión corta para prompts de imagen y video.
export function brandVisual(b: Brand): string {
  const c = colorWords(b);
  const parts = [c && `color palette: ${c}`, b.industry && `for a ${b.industry} business`].filter(Boolean);
  return parts.length ? `, ${parts.join(", ")}` : "";
}
