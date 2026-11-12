// Formatos y estilos (combinaciones de color) de los carruseles. Sin pantalla, para poder probarlo.
import { Brand, brandAccent, brandDark, luminance, textOn } from "./brand";

export type CarouselStyle = "oscuro" | "claro" | "color" | "negro" | "blanco" | "suave" | "contraste";
export type CarouselFormat = "4:5" | "1:1" | "9:16" | "2:3" | "16:9";

export const CAROUSEL_STYLES: { id: CarouselStyle; label: string }[] = [
  { id: "oscuro", label: "Oscuro" },
  { id: "claro", label: "Claro" },
  { id: "color", label: "Color de mi marca" },
  { id: "negro", label: "Negro" },
  { id: "blanco", label: "Blanco" },
  { id: "suave", label: "Suave" },
  { id: "contraste", label: "Contraste" },
];

export const CAROUSEL_FORMATS: { id: CarouselFormat; label: string }[] = [
  { id: "4:5", label: "Vertical 4:5 · feed" },
  { id: "1:1", label: "Cuadrado 1:1" },
  { id: "9:16", label: "Historia 9:16" },
  { id: "2:3", label: "Pinterest 2:3" },
  { id: "16:9", label: "Horizontal 16:9" },
];

export const SIZES: Record<CarouselFormat, [number, number]> = {
  "4:5": [1080, 1350],
  "1:1": [1080, 1080],
  "9:16": [1080, 1920],
  "2:3": [1000, 1500],
  "16:9": [1920, 1080],
};

export type Palette = { bg: string; text: string; muted: string; accent: string; number: string; track: string };

// Contraste entre dos colores (1 = iguales, 21 = negro sobre blanco).
export function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Mezcla un color con blanco (cuanto = parte de blanco, de 0 a 1).
function aclarar(hex: string, cuanto: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#f3f3f3";
  const n = parseInt(m[1], 16);
  const canal = (v: number) => Math.round(v + (255 - v) * cuanto).toString(16).padStart(2, "0");
  return `#${canal((n >> 16) & 255)}${canal((n >> 8) & 255)}${canal(n & 255)}`;
}

// El color si se lee sobre ese fondo; si no, el de reserva.
const siSeLee = (color: string, fondo: string, minimo: number, reserva: string) => (contraste(color, fondo) >= minimo ? color : reserva);

const SOBRE_OSCURO = { muted: "rgba(255,255,255,0.78)", track: "rgba(255,255,255,0.18)" };
const SOBRE_CLARO = { muted: "rgba(20,22,31,0.72)", track: "rgba(20,22,31,0.12)" };
const TINTA = "#14161f";

export function paletteFor(style: CarouselStyle, b: Brand, photo: boolean): Palette {
  const accent = brandAccent(b);
  if (photo) return { bg: "#000000", text: "#ffffff", muted: "rgba(255,255,255,0.86)", accent, number: accent, track: "rgba(255,255,255,0.25)" };
  switch (style) {
    case "claro": {
      const bg = "#f6f4ef";
      const a = siSeLee(accent, bg, 1.6, TINTA);
      return { bg, text: TINTA, ...SOBRE_CLARO, accent: a, number: a };
    }
    case "blanco": {
      const bg = "#ffffff";
      const a = siSeLee(accent, bg, 1.6, "#111111");
      return { bg, text: "#111111", ...SOBRE_CLARO, accent: a, number: a };
    }
    case "suave": {
      const bg = aclarar(accent, 0.88);
      const a = siSeLee(accent, bg, 1.6, TINTA);
      return { bg, text: TINTA, ...SOBRE_CLARO, accent: a, number: a };
    }
    case "color": {
      const t = textOn(accent);
      const dark = t !== "#ffffff";
      return {
        bg: /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#e5243b",
        text: t,
        muted: dark ? "rgba(17,17,17,0.78)" : "rgba(255,255,255,0.88)",
        accent: t,
        number: dark ? "rgba(17,17,17,0.28)" : "rgba(255,255,255,0.35)",
        track: dark ? "rgba(17,17,17,0.15)" : "rgba(255,255,255,0.25)",
      };
    }
    case "negro": {
      const bg = "#000000";
      const a = siSeLee(accent, bg, 3, "#ffffff");
      return { bg, text: a, ...SOBRE_OSCURO, accent: a, number: "rgba(255,255,255,0.28)" };
    }
    case "contraste": {
      const bg = fondoOscuro(b);
      const a = siSeLee(accent, bg, 3, "#ffffff");
      return { bg, text: a, ...SOBRE_OSCURO, accent: a, number: "rgba(255,255,255,0.28)" };
    }
    default: {
      const bg = fondoOscuro(b);
      const a = siSeLee(accent, bg, 1.6, "#ffffff");
      return { bg, text: "#ffffff", ...SOBRE_OSCURO, accent: a, number: a };
    }
  }
}

// El color oscuro de la marca; si la marca no tiene uno de verdad oscuro, el azul de Studio.
function fondoOscuro(b: Brand): string {
  const d = brandDark(b);
  return /^#[0-9a-f]{6}$/i.test(d) && luminance(d) < 0.2 ? d : "#0d1630";
}
