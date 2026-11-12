// Director con IA: la persona escribe o dicta una orden y la IA la traduce a acciones de un catálogo fijo.
// Aquí vive el catálogo, la validación de lo que devuelve la IA y cómo se aplica al video.
// Módulo puro (sin React ni DOM). Ninguna función modifica lo que recibe.

import {
  CIERRE,
  MAX_FOTO,
  MAX_TOMAS,
  MAX_VIDEO,
  MIN_FOTO,
  SEGUNDOS_TOMA,
  borrar,
  cambiar,
  duplicar,
  mover,
  nuevoClip,
  type Clip,
  type TextoPos,
  type TextoTam,
} from "./linea-tiempo";

export const MAX_ACCIONES = 20;
export const MAX_ORDEN = 500; // caracteres de la orden
// Al armar un video cada foto dura de 7 a 10 s: pocas imágenes, bien aprovechadas (se gasta menos)
export const FOTO_DIRECTOR = 8;
export const MIN_FOTO_DIRECTOR = 7;
export const MAX_FOTO_DIRECTOR = 10;
export const CLIPS_DEFECTO = 4;
const MIN_CLIPS = 2;
const MAX_CLIPS = 12;
const MAX_TEXTO = 120;
const MAX_GUION = 1500;

export type Formato = "9:16" | "1:1" | "16:9";
export type RefClip = number | "todos"; // número desde 1, como en pantalla

export type Accion =
  | { tipo: "armar"; tema: string; clips: number; segundosPorFoto: number; textos: string[]; imagenes: string[]; cta: string; guion: string; musica?: string }
  | { tipo: "agregar_clip"; cantidad: number }
  | { tipo: "borrar_clip"; clip: number }
  | { tipo: "mover_clip"; clip: number; a: number }
  | { tipo: "duplicar_clip"; clip: number }
  | { tipo: "duracion"; clip: RefClip; segundos: number }
  | { tipo: "duracion_total"; segundos: number }
  | { tipo: "texto"; clip: number; texto: string }
  | { tipo: "estilo_texto"; clip: RefClip; posicion?: TextoPos; tamano?: TextoTam }
  | { tipo: "imagen"; clip: number; descripcion: string }
  | { tipo: "animar"; clip: number; activar: boolean; movimiento?: string }
  | { tipo: "formato"; valor: Formato }
  | { tipo: "cierre"; negocio?: string; cta?: string }
  | { tipo: "guion"; texto: string }
  | { tipo: "voz"; genero?: "mujer" | "hombre"; voz?: string; generar?: boolean; quitar?: boolean }
  | { tipo: "subtitulos"; activar: boolean }
  | { tipo: "musica"; activar?: boolean; estilo?: string; volumen?: number | "subir" | "bajar" }
  | { tipo: "vista_previa" }
  | { tipo: "crear_video" };

export const TIPOS_DE_ACCION: Accion["tipo"][] = [
  "armar",
  "agregar_clip",
  "borrar_clip",
  "mover_clip",
  "duplicar_clip",
  "duracion",
  "duracion_total",
  "texto",
  "estilo_texto",
  "imagen",
  "animar",
  "formato",
  "cierre",
  "guion",
  "voz",
  "subtitulos",
  "musica",
  "vista_previa",
  "crear_video",
];

// Lo que la app tiene para elegir: estilos de música y voces
export type Catalogo = { estilos: string[]; voces: { id: string; genero: "mujer" | "hombre" }[] };

// ---------- Validación de lo que devuelve la IA ----------

type Cruda = Record<string, unknown>;
const POSICIONES: TextoPos[] = ["arriba", "centro", "abajo"];
const TAMANOS: TextoTam[] = ["chico", "normal", "grande"];
const FORMATOS: Formato[] = ["9:16", "1:1", "16:9"];

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const entre = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const txt = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : v === "true" || v === "si" || v === "sí" ? true : v === "false" || v === "no" ? false : null);
// Número de clip: entero desde 1
const nClip = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= 1 ? n : null;
};
const refClip = (v: unknown): RefClip | null => (typeof v === "string" && v.trim().toLowerCase() === "todos" ? "todos" : nClip(v));

export function clipsPara(segundos?: number): number {
  if (!segundos || !Number.isFinite(segundos)) return CLIPS_DEFECTO;
  return entre(Math.round(segundos / FOTO_DIRECTOR), MIN_CLIPS, MAX_CLIPS);
}

function validarUna(a: Cruda, cat: Catalogo): Accion | null {
  switch (a.tipo) {
    case "armar": {
      const tema = txt(a.tema, 300);
      if (!tema) return null;
      const clips = entre(Math.round(num(a.clips) ?? CLIPS_DEFECTO), MIN_CLIPS, MAX_CLIPS);
      const lista = (v: unknown, max: number, relleno: string) => {
        const l = (Array.isArray(v) ? v : []).slice(0, clips).map((x) => txt(x, max));
        while (l.length < clips) l.push(relleno);
        return l.map((x) => x || relleno);
      };
      const r: Accion = {
        tipo: "armar",
        tema,
        clips,
        segundosPorFoto: entre(num(a.segundos_por_foto ?? a.segundosPorFoto) ?? FOTO_DIRECTOR, MIN_FOTO_DIRECTOR, MAX_FOTO_DIRECTOR),
        textos: lista(a.textos, MAX_TEXTO, ""),
        imagenes: lista(a.imagenes, 400, `${tema}, advertising photography, high quality`),
        cta: txt(a.cta, MAX_TEXTO),
        guion: txt(a.guion, MAX_GUION),
      };
      if (typeof a.musica === "string" && cat.estilos.includes(a.musica)) r.musica = a.musica;
      return r;
    }
    case "agregar_clip":
      return { tipo: "agregar_clip", cantidad: entre(Math.round(num(a.cantidad) ?? 1), 1, 10) };
    case "borrar_clip":
    case "duplicar_clip": {
      const clip = nClip(a.clip);
      return clip === null ? null : { tipo: a.tipo, clip };
    }
    case "mover_clip": {
      const clip = nClip(a.clip);
      const destino = nClip(a.a);
      return clip === null || destino === null ? null : { tipo: "mover_clip", clip, a: destino };
    }
    case "duracion": {
      const clip = refClip(a.clip);
      const s = num(a.segundos);
      return clip === null || s === null ? null : { tipo: "duracion", clip, segundos: entre(s, MIN_FOTO, MAX_FOTO) };
    }
    case "duracion_total": {
      const s = num(a.segundos);
      return s === null ? null : { tipo: "duracion_total", segundos: entre(s, 5, MAX_VIDEO) };
    }
    case "texto": {
      const clip = nClip(a.clip);
      // Un texto vacío vale (quita el texto), pero tiene que venir
      return clip === null || typeof a.texto !== "string" ? null : { tipo: "texto", clip, texto: txt(a.texto, MAX_TEXTO) };
    }
    case "estilo_texto": {
      const clip = refClip(a.clip);
      const posicion = POSICIONES.includes(a.posicion as TextoPos) ? (a.posicion as TextoPos) : undefined;
      const tamano = TAMANOS.includes(a.tamano as TextoTam) ? (a.tamano as TextoTam) : undefined;
      if (clip === null || (!posicion && !tamano)) return null;
      return { tipo: "estilo_texto", clip, ...(posicion ? { posicion } : {}), ...(tamano ? { tamano } : {}) };
    }
    case "imagen": {
      const clip = nClip(a.clip);
      const descripcion = txt(a.descripcion, 400);
      return clip === null || !descripcion ? null : { tipo: "imagen", clip, descripcion };
    }
    case "animar": {
      const clip = nClip(a.clip);
      if (clip === null) return null;
      const movimiento = txt(a.movimiento, 300);
      return { tipo: "animar", clip, activar: bool(a.activar) ?? true, ...(movimiento ? { movimiento } : {}) };
    }
    case "formato":
      return FORMATOS.includes(a.valor as Formato) ? { tipo: "formato", valor: a.valor as Formato } : null;
    case "cierre": {
      const negocio = txt(a.negocio, MAX_TEXTO);
      const cta = txt(a.cta, MAX_TEXTO);
      if (!negocio && !cta) return null;
      return { tipo: "cierre", ...(negocio ? { negocio } : {}), ...(cta ? { cta } : {}) };
    }
    case "guion": {
      const texto = txt(a.texto, MAX_GUION);
      return texto ? { tipo: "guion", texto } : null;
    }
    case "voz": {
      const r: Extract<Accion, { tipo: "voz" }> = { tipo: "voz" };
      if (a.genero === "mujer" || a.genero === "hombre") r.genero = a.genero;
      if (typeof a.voz === "string") {
        if (!cat.voces.some((v) => v.id === a.voz)) return null;
        r.voz = a.voz;
      }
      if (bool(a.generar)) r.generar = true;
      if (bool(a.quitar)) r.quitar = true;
      return Object.keys(r).length > 1 ? r : null;
    }
    case "subtitulos": {
      const activar = bool(a.activar);
      return activar === null ? null : { tipo: "subtitulos", activar };
    }
    case "musica": {
      const r: Extract<Accion, { tipo: "musica" }> = { tipo: "musica" };
      const activar = bool(a.activar);
      if (activar !== null) r.activar = activar;
      if (typeof a.estilo === "string") {
        if (!cat.estilos.includes(a.estilo)) return null;
        r.estilo = a.estilo;
      }
      if (a.volumen === "subir" || a.volumen === "bajar") r.volumen = a.volumen;
      else if (num(a.volumen) !== null) r.volumen = entre(num(a.volumen)!, 0, 100);
      return Object.keys(r).length > 1 ? r : null;
    }
    case "vista_previa":
      return { tipo: "vista_previa" };
    case "crear_video":
      return { tipo: "crear_video" };
    default:
      return null;
  }
}

// Recibe lo que devolvió la IA ({acciones: [...]} o la lista) y deja solo acciones del catálogo, bien formadas.
export function validarAcciones(json: unknown, cat: Catalogo): { acciones: Accion[]; descartadas: number } {
  const lista: unknown[] | null = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as Cruda).acciones)
      ? ((json as Cruda).acciones as unknown[])
      : null;
  if (!lista) return { acciones: [], descartadas: 0 };
  const acciones: Accion[] = [];
  let descartadas = 0;
  for (const x of lista) {
    const a = x && typeof x === "object" ? validarUna(x as Cruda, cat) : null;
    if (a && acciones.length < MAX_ACCIONES) acciones.push(a);
    else descartadas++;
  }
  return { acciones, descartadas };
}
