// Línea de tiempo del Creador de Reels: la lista de clips del video y lo que se puede hacer con ella.
// Módulo puro (sin React ni DOM) para poder probarlo. Ninguna función modifica la lista que recibe.

export const MAX_VIDEO = 120; // segundos, contando el cierre
export const CIERRE = 3; // segundos del cierre con la marca
export const MIN_FOTO = 1.5;
export const MAX_FOTO = 15;
export const FOTO_DEFECTO = 3;
export const SEGUNDOS_TOMA = 5;
export const MAX_TOMAS = 4;

export type TextoPos = "arriba" | "centro" | "abajo";
export type TextoTam = "chico" | "normal" | "grande";
const POSICIONES: TextoPos[] = ["arriba", "centro", "abajo"];
const TAMANOS: TextoTam[] = ["chico", "normal", "grande"];

export type Clip = {
  id: string;
  tipo: "foto" | "toma"; // toma = foto animada con IA (5 s)
  image: string; // data URL o enlace de la foto
  imageId?: string; // la foto guardada en el dispositivo
  loading?: boolean;
  caption: string; // texto en pantalla
  prompt: string; // con qué se pide la imagen a la IA
  segundos: number; // foto: 1.5 a 15; en una toma no se usa
  movimiento?: string; // lo que se le pide a la IA en una toma
  textoPos?: TextoPos;
  textoTam?: TextoTam;
};

// Lo que recibe el motor (lib/reel.ts): una escena por clip con foto, con su duración ya resuelta.
export type EscenaRender = {
  imagen: string;
  texto: string;
  textoPos: TextoPos;
  textoTam: TextoTam;
  segundos: number;
  video?: string | null; // clip de IA; si falta, la foto se anima con zoom
};

function nuevoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function acotar(segundos: unknown, defecto: number = FOTO_DEFECTO): number {
  const n = typeof segundos === "number" && Number.isFinite(segundos) ? segundos : defecto;
  return Math.min(MAX_FOTO, Math.max(MIN_FOTO, n));
}

export function nuevoClip(extra: Partial<Clip> = {}): Clip {
  return { tipo: "foto", image: "", caption: "", prompt: "", segundos: FOTO_DEFECTO, ...extra, id: extra.id || nuevoId() };
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");

// Lee lo guardado en el dispositivo: clips nuevos o las escenas de antes (sin id ni duración, con `ia`).
export function normalizarClips(guardado: unknown, segundosViejos: number = FOTO_DEFECTO): Clip[] {
  const lista = Array.isArray(guardado) ? guardado.filter((x) => x && typeof x === "object") : [];
  if (lista.length === 0) return Array.from({ length: 4 }, () => nuevoClip());
  return lista.map((x) => {
    const v = x as Record<string, unknown>;
    const clip: Clip = {
      id: texto(v.id) || nuevoId(),
      tipo: v.tipo === "toma" || (v.tipo === undefined && v.ia === true) ? "toma" : "foto",
      image: texto(v.image),
      caption: texto(v.caption),
      prompt: texto(v.prompt),
      segundos: acotar(v.segundos, acotar(segundosViejos)),
    };
    if (typeof v.imageId === "string" && v.imageId) clip.imageId = v.imageId;
    if (typeof v.movimiento === "string" && v.movimiento) clip.movimiento = v.movimiento;
    if (POSICIONES.includes(v.textoPos as TextoPos)) clip.textoPos = v.textoPos as TextoPos;
    if (TAMANOS.includes(v.textoTam as TextoTam)) clip.textoTam = v.textoTam as TextoTam;
    return clip;
  });
}

// Lo que dura un clip en el video. Un clip sin foto no cuenta.
export function duracionClip(c: Clip): number {
  if (!c.image) return 0;
  return c.tipo === "toma" ? SEGUNDOS_TOMA : acotar(c.segundos);
}

const suma = (clips: Clip[]) => clips.reduce((a, c) => a + duracionClip(c), 0);

// El cierre con la marca entra solo si cabe dentro de los 2 minutos.
export function cierreDe(clips: Clip[]): number {
  const s = suma(clips);
  return s > 0 && s + CIERRE <= MAX_VIDEO ? CIERRE : 0;
}

export function duracionTotal(clips: Clip[]): number {
  return suma(clips) + cierreDe(clips);
}

export function formatoTiempo(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// null = el video se puede crear. Si no, el mensaje para el cliente.
export function validar(clips: Clip[]): string | null {
  const conFoto = clips.filter((c) => c.image);
  if (conFoto.length === 0) return "Agrega al menos una imagen a las escenas.";
  if (conFoto.filter((c) => c.tipo === "toma").length > MAX_TOMAS) return `Puedes marcar máximo ${MAX_TOMAS} fotos con IA por video.`;
  const total = duracionTotal(clips);
  if (total > MAX_VIDEO) return `Tu video dura ${formatoTiempo(total)}. El máximo es ${formatoTiempo(MAX_VIDEO)}: quita o acorta algún clip.`;
  return null;
}

const dentro = (clips: Clip[], i: number) => Number.isInteger(i) && i >= 0 && i < clips.length;

export function mover(clips: Clip[], de: number, a: number): Clip[] {
  if (!dentro(clips, de) || !dentro(clips, a) || de === a) return clips;
  const r = clips.slice();
  const [c] = r.splice(de, 1);
  r.splice(a, 0, c);
  return r;
}

// La copia va justo después. No comparte la foto guardada: se guarda la suya aparte.
export function duplicar(clips: Clip[], i: number): Clip[] {
  if (!dentro(clips, i)) return clips;
  const copia: Clip = { ...clips[i], id: nuevoId(), loading: false };
  delete copia.imageId;
  return [...clips.slice(0, i + 1), copia, ...clips.slice(i + 1)];
}

export function borrar(clips: Clip[], i: number): Clip[] {
  if (!dentro(clips, i)) return clips;
  const r = clips.filter((_, j) => j !== i);
  return r.length ? r : [nuevoClip()];
}

export function cambiar(clips: Clip[], i: number, cambios: Partial<Clip>): Clip[] {
  if (!dentro(clips, i)) return clips;
  const c = { ...cambios };
  if ("segundos" in c) c.segundos = acotar(c.segundos, clips[i].segundos);
  delete c.id;
  return clips.map((x, j) => (j === i ? { ...x, ...c } : x));
}

// Las escenas que se graban. clipsIa: id del clip → enlace de su toma con IA ya generada.
export function aEscenas(clips: Clip[], clipsIa: Record<string, string | null | undefined> = {}): EscenaRender[] {
  return clips
    .filter((c) => c.image)
    .map((c) => {
      const e: EscenaRender = {
        imagen: c.image,
        texto: c.caption,
        textoPos: c.textoPos ?? "abajo",
        textoTam: c.textoTam ?? "normal",
        segundos: duracionClip(c),
      };
      const video = c.tipo === "toma" ? clipsIa[c.id] : null;
      if (video) e.video = video;
      return e;
    });
}

// Si la voz dura más que el video, reparte el tiempo que falta entre las fotos (todas iguales).
// Las tomas con IA no se tocan. Deja medio segundo de aire después de la voz.
export function ajustarAVoz(clips: Clip[], segundosVoz: number): Clip[] {
  if (!(segundosVoz > 0) || suma(clips) >= segundosVoz) return clips;
  const esFoto = (c: Clip) => !!c.image && c.tipo === "foto";
  const n = clips.filter(esFoto).length;
  if (n === 0) return clips;
  const fijo = clips.filter((c) => c.image && c.tipo === "toma").length * SEGUNDOS_TOMA;
  const cada = acotar((segundosVoz + 0.5 - fijo) / n);
  return clips.map((c) => (esFoto(c) ? { ...c, segundos: cada } : c));
}
