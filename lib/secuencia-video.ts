// «Hacer el video con NOVA»: lo que llega de «Secuencia de fotos» al Creador de Reels. Funciones puras
// (se prueban en Node): qué duración usar, los clips de foto en orden, si el video abierto ya tiene algo
// (para preguntar antes de reemplazarlo) y el aviso antes de gastar la voz en off.

import { MAX_FOTO, MIN_FOTO, nuevoClip, type Clip } from "./linea-tiempo";
import { DURACIONES_SECUENCIA, MAX_FOTOS, MAX_MOMENTO } from "./secuencia";
import type { ReelFormat } from "./reel";

export type DuracionSecuencia = (typeof DURACIONES_SECUENCIA)[number];
export type SecuenciaEntrante = { tema: string; momentos: string[]; fotos: string[]; formato: ReelFormat; n: number };

export const DURACION_DEFECTO: DuracionSecuencia = 15;
export const MIN_POR_FOTO = 2; // segundos: menos que eso no se alcanza a ver la foto
const FORMATOS: ReelFormat[] = ["9:16", "1:1", "16:9"];

// 15 s si cada foto dura al menos 2 s; si no, la duración más cercana a 15 en la que sí (empate: la más larga)
export function duracionParaFotos(n: number): DuracionSecuencia {
  const caben = DURACIONES_SECUENCIA.filter((d) => n > 0 && d / n >= MIN_POR_FOTO && d / n <= MAX_FOTO);
  const lista = caben.length ? caben : [...DURACIONES_SECUENCIA];
  return lista.reduce((mejor, d) => {
    const a = Math.abs(d - DURACION_DEFECTO);
    const b = Math.abs(mejor - DURACION_DEFECTO);
    return a < b || (a === b && d > mejor) ? d : mejor;
  });
}

// Segundos de cada foto (con un decimal), dentro de lo que acepta un clip (1.5 a 15)
export function segundosPorFoto(total: number, n: number): number {
  if (!(n > 0)) return MAX_FOTO;
  return Math.min(MAX_FOTO, Math.max(MIN_FOTO, Math.round((total / n) * 10) / 10));
}

// Un clip de foto por foto, en orden. El momento queda como descripción (sirve para «Crear con IA»).
export function clipsDeSecuencia(fotos: string[], momentos: string[], total: number): Clip[] {
  const segundos = segundosPorFoto(total, fotos.length);
  return fotos.map((image, i) => nuevoClip({ image, prompt: momentos[i] ?? "", segundos }));
}

// Otra duración: se reparte entre las fotos (las tomas con IA y los videos no cambian)
export function repartirEnFotos(clips: Clip[], total: number): Clip[] {
  const esFoto = (c: Clip) => c.tipo === "foto" && !!c.image;
  const segundos = segundosPorFoto(total, clips.filter(esFoto).length);
  return clips.map((c) => (esFoto(c) && c.segundos !== segundos ? { ...c, segundos } : c));
}

// ¿El video abierto ya tiene algo que se perdería? (lo guardado: la foto puede estar solo en el aparato)
export function tieneContenido(clips: unknown, guion: unknown): boolean {
  if (typeof guion === "string" && guion.trim()) return true;
  if (!Array.isArray(clips)) return false;
  return clips.some((c) => !!c && typeof c === "object" && !!((c as Clip).image || (c as Clip).imageId || (c as Clip).archivoId));
}

// Qué hacer al llegar una secuencia: cargarla directo, o preguntar (y si se puede crear un video nuevo)
export function decidirEntrada(o: { hayContenido: boolean; proyectos: number; max: number }): { preguntar: false } | { preguntar: true; puedeNuevo: boolean } {
  if (!o.hayContenido) return { preguntar: false };
  return { preguntar: true, puedeNuevo: o.proyectos > 0 && o.proyectos < o.max };
}

// Revisa lo que llega: de 2 a 8 fotos, un momento corto por foto («Foto N» si falta) y un formato válido
export function limpiarEntrante(x: unknown): SecuenciaEntrante | null {
  if (!x || typeof x !== "object") return null;
  const s = x as Record<string, unknown>;
  const fotos = (Array.isArray(s.fotos) ? s.fotos : []).filter((f): f is string => typeof f === "string" && !!f).slice(0, MAX_FOTOS);
  if (fotos.length < 2) return null;
  const momentos = Array.isArray(s.momentos) ? s.momentos : [];
  return {
    tema: typeof s.tema === "string" ? s.tema.trim() : "",
    momentos: fotos.map((_, i) => {
      const m = typeof momentos[i] === "string" ? (momentos[i] as string).replace(/\s+/g, " ").trim() : "";
      return (m || `Foto ${i + 1}`).slice(0, MAX_MOMENTO);
    }),
    fotos,
    formato: FORMATOS.includes(s.formato as ReelFormat) ? (s.formato as ReelFormat) : "9:16",
    n: typeof s.n === "number" ? s.n : 0,
  };
}

// «Generar la voz usa 1 voz en off de tu plan (te quedan N). ¿La genero?»; sin cuentas, sin «te quedan».
export function textoConfirmarVoz(quedan?: number): string {
  const resto = typeof quedan === "number" ? (quedan === 1 ? " (te queda 1)" : ` (te quedan ${quedan})`) : "";
  return `Generar la voz usa 1 voz en off de tu plan${resto}. ¿La genero?`;
}
