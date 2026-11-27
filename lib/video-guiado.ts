// «Crear video con NOVA»: el recorrido de 4 pasos (fotos, de qué trata, qué se ve en cada foto, armar).
// Solo reglas, sin pantalla ni navegador: las usa app/video-guiado.tsx y se prueban solas.
// Al armar, el recorrido se entrega como una secuencia de fotos (lib/secuencia-video.ts): desde ahí
// sigue el camino que ya existe (el editor carga las fotos y NOVA escribe el guion y graba la voz).

import type { ReelFormat } from "./reel";
import { MAX_FOTOS } from "./secuencia";
import { MIN_FOTOS_VIDEO } from "./secuencia-pantalla";

export type PasoGuiado = 1 | 2 | 3 | 4;
export type FotoGuiada = { id: string; src: string };
export type EstadoGuiado = {
  paso: PasoGuiado;
  fotos: FotoGuiada[]; // en el orden en que salen en el video
  tema: string;
  formato: ReelFormat;
  lineas: Record<string, string>; // qué se ve en cada foto (por id)
  animar: string[]; // fotos que se animan con IA (ids)
};

export const MAX_TEMA_GUIADO = 200;
export const MAX_LINEA_GUIADA = 80; // lo mismo que un «momento» de la secuencia
export const PASOS_GUIADO = 4;
const FORMATOS: ReelFormat[] = ["9:16", "1:1", "16:9"];

export const GUIADO_VACIO: EstadoGuiado = { paso: 1, fotos: [], tema: "", formato: "9:16", lineas: {}, animar: [] };

// Fotos nuevas al final, sin repetir y hasta el máximo; `sobraron` son las que ya no cupieron
export function agregarFotos(e: EstadoGuiado, nuevas: FotoGuiada[]): { estado: EstadoGuiado; sobraron: number } {
  const fotos = [...e.fotos];
  let sobraron = 0;
  for (const f of nuevas) {
    if (!f || !f.id || !f.src || fotos.some((x) => x.id === f.id)) continue;
    if (fotos.length >= MAX_FOTOS) sobraron++;
    else fotos.push({ id: f.id, src: f.src });
  }
  return { estado: { ...e, fotos }, sobraron };
}

export function quitarFoto(e: EstadoGuiado, id: string): EstadoGuiado {
  const lineas = { ...e.lineas };
  delete lineas[id];
  return { ...e, fotos: e.fotos.filter((f) => f.id !== id), lineas, animar: e.animar.filter((x) => x !== id) };
}

export function moverFoto(e: EstadoGuiado, id: string, dir: -1 | 1): EstadoGuiado {
  const i = e.fotos.findIndex((f) => f.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= e.fotos.length) return e;
  const fotos = [...e.fotos];
  [fotos[i], fotos[j]] = [fotos[j], fotos[i]];
  return { ...e, fotos };
}

// Lo que falta para pasar al siguiente paso (null = se puede seguir)
export function faltaPara(e: EstadoGuiado): string | null {
  if (e.paso === 1 && e.fotos.length < MIN_FOTOS_VIDEO) return `Sube al menos ${MIN_FOTOS_VIDEO} fotos.`;
  if (e.paso === 2 && !e.tema.trim()) return "Escribe de qué trata el video.";
  return null;
}

export function avanzar(e: EstadoGuiado): EstadoGuiado {
  if (e.paso >= PASOS_GUIADO || faltaPara(e)) return e;
  return { ...e, paso: (e.paso + 1) as PasoGuiado };
}

export function regresar(e: EstadoGuiado): EstadoGuiado {
  return e.paso <= 1 ? e : { ...e, paso: (e.paso - 1) as PasoGuiado };
}

// Marca o desmarca una foto para animarla con IA. `tomasQuedan`: las que le quedan hoy a su plan
// (sin dato = sin tope conocido; el servidor decide al generar).
export function alternarAnimar(e: EstadoGuiado, id: string, tomasQuedan?: number): EstadoGuiado {
  if (e.animar.includes(id)) return { ...e, animar: e.animar.filter((x) => x !== id) };
  if (!e.fotos.some((f) => f.id === id)) return e;
  if (tomasQuedan !== undefined && e.animar.length >= Math.max(0, tomasQuedan)) return e;
  return { ...e, animar: [...e.animar, id] };
}

// Lo que NOVA dice arriba de cada paso
export function mensajeNova(e: EstadoGuiado, o: { tomasQuedan?: number; sobraron?: number } = {}): string {
  if (e.paso === 1) {
    const base = "Sube las fotos de tu video, en el orden en que quieres que salgan.";
    return o.sobraron && o.sobraron > 0 ? `${base} El máximo son ${MAX_FOTOS} fotos.` : base;
  }
  if (e.paso === 2) return "Cuéntame en una frase de qué es el video.";
  if (e.paso === 3) {
    const base = "Escribe en pocas palabras qué se ve en cada foto. Con eso escribo el guion.";
    return o.tomasQuedan === 0 ? `${base} Hoy no te quedan animaciones con IA.` : base;
  }
  return "Listo. Tu video ya está en el editor.";
}

const unaLinea = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

// El recorrido, listo para el editor: una línea por foto (la vacía viaja como «Foto N»)
export function aSecuencia(e: EstadoGuiado): { tema: string; momentos: string[]; fotos: string[]; formato: ReelFormat; animar: boolean[] } {
  return {
    tema: unaLinea(e.tema).slice(0, MAX_TEMA_GUIADO),
    momentos: e.fotos.map((f, i) => (unaLinea(e.lineas[f.id]) || `Foto ${i + 1}`).slice(0, MAX_LINEA_GUIADA)),
    fotos: e.fotos.map((f) => f.src),
    formato: e.formato,
    animar: e.fotos.map((f) => e.animar.includes(f.id)),
  };
}

// Lo que se guarda en el aparato entre visitas (las fotos no: solo viven mientras la app está abierta)
export function limpiarTextoGuiado(x: unknown): { tema: string; formato: ReelFormat } {
  const s = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return {
    tema: typeof s.tema === "string" ? s.tema.slice(0, MAX_TEMA_GUIADO) : "",
    formato: FORMATOS.includes(s.formato as ReelFormat) ? (s.formato as ReelFormat) : "9:16",
  };
}
