// Línea de tiempo del Creador de Reels: la lista de clips del video y lo que se puede hacer con ella.
// Módulo puro (sin React ni DOM) para poder probarlo. Ninguna función modifica la lista que recibe.

import { SEGUNDOS_TRANSICION, esDuracionTransicion, esTransicion, repartirAlAzar, type DuracionTransicion, type Transicion } from "./reel-transicion";

export const MAX_VIDEO = 120; // segundos, contando el cierre
export const CIERRE = 3; // segundos del cierre con la marca
export const MIN_FOTO = 1.5;
export const MAX_FOTO = 15;
export const FOTO_DEFECTO = 8; // un clip nuevo: pocas imágenes, bien aprovechadas (7 a 10 s cada una)
const FOTO_ANTES = 3; // lo que duraba cada escena antes del editor (para borradores viejos)
export const SEGUNDOS_TOMA = 5;
export const MAX_TOMAS = 8; // tomas con IA distintas por video
export type Reproduccion = "normal" | "lenta" | "repetir2" | "repetir3";
const REPRODUCCIONES: Reproduccion[] = ["normal", "lenta", "repetir2", "repetir3"];
// Cuántas veces dura una toma estirada: cámara lenta ×2, repetir ×2 o ×3
const FACTOR: Record<Reproduccion, number> = { normal: 1, lenta: 2, repetir2: 2, repetir3: 3 };
export const MIN_TRAMO = 1; // segundos mínimos del recorte de un video
export const VELOCIDADES = [0.5, 1, 1.5, 2] as const;

export type TextoPos = "arriba" | "centro" | "abajo";
export type TextoTam = "chico" | "normal" | "grande";
const POSICIONES: TextoPos[] = ["arriba", "centro", "abajo"];
const TAMANOS: TextoTam[] = ["chico", "normal", "grande"];

export type Clip = {
  id: string;
  tipo: "foto" | "toma" | "video"; // toma = foto animada con IA (5 s); video = video propio
  image: string; // data URL o enlace de la foto (en un video, su cuadro de portada)
  imageId?: string; // la foto guardada en el dispositivo
  loading?: boolean;
  caption: string; // texto en pantalla
  prompt: string; // con qué se pide la imagen a la IA
  segundos: number; // foto: 1.5 a 15; en una toma no se usa
  movimiento?: string; // lo que se le pide a la IA en una toma
  trabajoId?: string; // la toma con IA ya pedida para este clip (lib/video-ia.ts)
  anteriorTrabajoId?: string; // la toma previa, para «Volver a la anterior»
  variacion?: number; // sube con cada «Rehacer»: misma foto y movimiento, clip nuevo
  reproduccion?: Reproduccion; // estirar la toma: cámara lenta o repetir
  textoPos?: TextoPos;
  textoTam?: TextoTam;
  transicion?: Transicion; // cómo se pasa de este clip al siguiente (por defecto, fundido)
  transicionDur?: DuracionTransicion; // rápida, normal (por defecto) o lenta
  efecto?: string; // efecto de sonido que suena al empezar este clip (id de lib/sfx.ts)
  // Solo video propio
  archivoId?: string; // dónde está el archivo en el dispositivo (lib/video-propio.ts)
  duracionOriginal?: number; // segundos del archivo
  inicio?: number; // recorte, en segundos del original
  fin?: number;
  velocidad?: number; // 0.5, 1, 1.5 o 2 (por defecto 1)
  sinSonido?: boolean; // true = no se oye en el video final
};

// El tramo de video que reproduce una escena
export type VideoRender = { src: string; inicio: number; fin: number; velocidad: number; sonido: boolean; repetir?: number };

// Lo que recibe el motor (lib/reel.ts): una escena por clip con foto, con su duración ya resuelta.
export type EscenaRender = {
  imagen: string;
  texto: string;
  textoPos: TextoPos;
  textoTam: TextoTam;
  segundos: number;
  transicion: Transicion; // hacia la escena siguiente
  transicionSeg: number; // cuánto dura esa transición
  video?: VideoRender; // toma con IA o video propio; si falta, la imagen se anima con zoom
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
export function normalizarClips(guardado: unknown, segundosViejos: number = FOTO_ANTES): Clip[] {
  const lista = Array.isArray(guardado) ? guardado.filter((x) => x && typeof x === "object") : [];
  if (lista.length === 0) return Array.from({ length: 4 }, () => nuevoClip());
  return lista.map((x) => {
    const v = x as Record<string, unknown>;
    const dur = typeof v.duracionOriginal === "number" && Number.isFinite(v.duracionOriginal) ? v.duracionOriginal : 0;
    // Un «video» sin archivo o sin duración no sirve: vuelve a ser un clip de foto
    const esVideo = v.tipo === "video" && typeof v.archivoId === "string" && !!v.archivoId && dur > 0;
    const clip: Clip = {
      id: texto(v.id) || nuevoId(),
      tipo: esVideo ? "video" : v.tipo === "toma" || (v.tipo === undefined && v.ia === true) ? "toma" : "foto",
      image: texto(v.image),
      caption: texto(v.caption),
      prompt: texto(v.prompt),
      segundos: acotar(v.segundos, acotar(segundosViejos)),
    };
    if (typeof v.imageId === "string" && v.imageId) clip.imageId = v.imageId;
    if (typeof v.movimiento === "string" && v.movimiento) clip.movimiento = v.movimiento;
    if (clip.tipo === "toma") {
      if (typeof v.trabajoId === "string" && v.trabajoId) clip.trabajoId = v.trabajoId;
      if (typeof v.anteriorTrabajoId === "string" && v.anteriorTrabajoId) clip.anteriorTrabajoId = v.anteriorTrabajoId;
      if (typeof v.variacion === "number" && Number.isInteger(v.variacion) && v.variacion > 0 && v.variacion < 100) clip.variacion = v.variacion;
      if (REPRODUCCIONES.includes(v.reproduccion as Reproduccion) && v.reproduccion !== "normal") clip.reproduccion = v.reproduccion as Reproduccion;
    }
    if (POSICIONES.includes(v.textoPos as TextoPos)) clip.textoPos = v.textoPos as TextoPos;
    if (TAMANOS.includes(v.textoTam as TextoTam)) clip.textoTam = v.textoTam as TextoTam;
    if (esTransicion(v.transicion)) clip.transicion = v.transicion;
    if (esDuracionTransicion(v.transicionDur)) clip.transicionDur = v.transicionDur;
    if (typeof v.efecto === "string" && v.efecto && v.efecto.length <= 30) clip.efecto = v.efecto;
    if (esVideo) {
      clip.archivoId = v.archivoId as string;
      clip.duracionOriginal = dur;
      const ini = typeof v.inicio === "number" ? v.inicio : 0;
      const fin = typeof v.fin === "number" ? v.fin : dur;
      const t = tramo({ ...clip, inicio: ini, fin });
      clip.inicio = t.inicio;
      clip.fin = t.fin;
      clip.velocidad = velocidadValida(v.velocidad);
      if (v.sinSonido === true) clip.sinSonido = true;
    }
    return clip;
  });
}

const velocidadValida = (v: unknown): number => ((VELOCIDADES as readonly number[]).includes(v as number) ? (v as number) : 1);

// Un clip de video recién agregado: recorte completo, velocidad normal y con sonido
export function clipDeVideo(datos: { archivoId: string; duracion: number; portada: string }): Clip {
  return nuevoClip({ tipo: "video", image: datos.portada, archivoId: datos.archivoId, duracionOriginal: datos.duracion, inicio: 0, fin: datos.duracion, velocidad: 1 });
}

// El recorte de un video, siempre dentro del original. Un recorte al revés se toma como el video completo.
export function tramo(c: Clip): { inicio: number; fin: number } {
  const dur = Math.max(0, c.duracionOriginal ?? 0);
  const ini = Math.min(dur, Math.max(0, c.inicio ?? 0));
  const fin = Math.min(dur, Math.max(0, c.fin ?? dur));
  return fin > ini ? { inicio: ini, fin } : { inicio: 0, fin: dur };
}

// ¿El clip aparece en el video? Una foto o toma necesita su imagen; un video, su archivo con duración.
export function presente(c: Clip): boolean {
  return c.tipo === "video" ? (c.duracionOriginal ?? 0) > 0 : !!c.image;
}

// Lo que dura un clip en el video. Un clip vacío no cuenta.
export function duracionClip(c: Clip): number {
  if (!presente(c)) return 0;
  if (c.tipo === "video") {
    const t = tramo(c);
    return (t.fin - t.inicio) / velocidadValida(c.velocidad);
  }
  return c.tipo === "toma" ? SEGUNDOS_TOMA * FACTOR[c.reproduccion ?? "normal"] : acotar(c.segundos);
}

// Cuántas tomas con IA distintas lleva el video. Los clips que comparten toma (duplicados) o que
// pedirían la misma (misma foto, movimiento y variación) cuentan como una.
export function tomasDistintas(clips: Clip[]): number {
  const llaves = new Set<string>();
  for (const c of clips) {
    if (c.tipo !== "toma" || !c.image) continue;
    llaves.add(c.trabajoId ? `t:${c.trabajoId}` : `f:${c.image}\n${(c.movimiento ?? "").trim().toLowerCase()}\n${c.variacion ?? 0}`);
  }
  return llaves.size;
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
  const conFoto = clips.filter(presente);
  if (conFoto.length === 0) return "Agrega al menos una imagen a las escenas.";
  if (tomasDistintas(clips) > MAX_TOMAS) return `Puedes animar con IA máximo ${MAX_TOMAS} fotos distintas por video.`;
  if (conFoto.some((c) => c.tipo === "video" && tramo(c).fin - tramo(c).inicio < MIN_TRAMO)) return "Un video quedó de menos de 1 segundo: alarga su recorte.";
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
  if ("velocidad" in c) c.velocidad = velocidadValida(c.velocidad);
  delete c.id;
  const antes = clips[i];
  const nuevo: Clip = { ...antes, ...c };
  // La toma con IA es de esa foto y ese movimiento: si cambian (o deja de ser toma), ya no sirve
  const mov = (m?: string) => (m ?? "").trim();
  if (antes.tipo === "toma" && (nuevo.tipo !== "toma" || nuevo.image !== antes.image || mov(nuevo.movimiento) !== mov(antes.movimiento))) {
    delete nuevo.trabajoId;
    delete nuevo.anteriorTrabajoId;
    delete nuevo.variacion;
  }
  return clips.map((x, j) => (j === i ? nuevo : x));
}

// Guarda en el clip la toma con IA que se acaba de pedir. La que tenía queda como «anterior».
export function ponerToma(clips: Clip[], i: number, trabajoId: string): Clip[] {
  if (!dentro(clips, i) || clips[i].tipo !== "toma") return clips;
  return clips.map((x, j) => {
    if (j !== i) return x;
    const n: Clip = { ...x, trabajoId };
    if (x.trabajoId && x.trabajoId !== trabajoId) n.anteriorTrabajoId = x.trabajoId;
    return n;
  });
}

// «Rehacer»: misma foto y movimiento, pero pide un clip nuevo (sube la variación). La toma actual
// sigue puesta hasta que llegue la nueva.
export function rehacerToma(clips: Clip[], i: number): Clip[] {
  if (!dentro(clips, i) || clips[i].tipo !== "toma") return clips;
  return clips.map((x, j) => (j === i ? { ...x, variacion: (x.variacion ?? 0) + 1 } : x));
}

// «Volver a la anterior»: intercambia la toma actual con la previa. No cuesta.
export function volverAnterior(clips: Clip[], i: number): Clip[] {
  if (!dentro(clips, i) || !clips[i].anteriorTrabajoId) return clips;
  return clips.map((x, j) => (j === i ? { ...x, trabajoId: x.anteriorTrabajoId, anteriorTrabajoId: x.trabajoId } : x));
}

// Quita la toma de un clip (falló o el servidor ya no la reconoce): vuelve a la anterior si la había.
export function quitarToma(clips: Clip[], trabajoId: string): Clip[] {
  if (!clips.some((c) => c.trabajoId === trabajoId)) return clips;
  return clips.map((x) => {
    if (x.trabajoId !== trabajoId) return x;
    const n: Clip = { ...x };
    delete n.trabajoId;
    if (x.anteriorTrabajoId) {
      n.trabajoId = x.anteriorTrabajoId;
      delete n.anteriorTrabajoId;
      if (n.variacion) n.variacion -= 1;
    }
    return n;
  });
}

// Cambia el recorte de un video (en segundos del original). Nunca deja menos de 1 s.
export function recortar(clips: Clip[], i: number, inicio: number, fin: number): Clip[] {
  if (!dentro(clips, i) || clips[i].tipo !== "video") return clips;
  const dur = Math.max(0, clips[i].duracionOriginal ?? 0);
  let ini = Math.min(dur, Math.max(0, inicio));
  let f = Math.min(dur, Math.max(ini, fin));
  if (f - ini < MIN_TRAMO) f = Math.min(dur, ini + MIN_TRAMO);
  if (f - ini < MIN_TRAMO) ini = Math.max(0, f - MIN_TRAMO);
  return clips.map((x, j) => (j === i ? { ...x, inicio: ini, fin: f } : x));
}

// Parte un video en dos clips seguidos en `segundo` (tiempo del original). El archivo es el mismo.
export function dividir(clips: Clip[], i: number, segundo: number): Clip[] {
  if (!dentro(clips, i) || clips[i].tipo !== "video") return clips;
  const c = clips[i];
  const t = tramo(c);
  if (segundo - t.inicio < MIN_TRAMO || t.fin - segundo < MIN_TRAMO) return clips;
  const primera: Clip = { ...c, inicio: t.inicio, fin: segundo };
  const segunda: Clip = { ...c, id: nuevoId(), inicio: segundo, fin: t.fin, caption: "", loading: false };
  delete segunda.imageId; // su portada se guarda aparte
  return [...clips.slice(0, i), primera, segunda, ...clips.slice(i + 1)];
}

// Pone otro clip en ese lugar. Conserva el id, el texto y su estilo.
export function sustituir(clips: Clip[], i: number, nuevo: Clip): Clip[] {
  if (!dentro(clips, i)) return clips;
  const v = clips[i];
  const r: Clip = { ...nuevo, id: v.id, caption: v.caption };
  if (v.textoPos) r.textoPos = v.textoPos;
  if (v.textoTam) r.textoTam = v.textoTam;
  return clips.map((x, j) => (j === i ? r : x));
}

// Las escenas que se graban. fuentes.tomas: id del clip → enlace de su toma con IA;
// fuentes.videos: archivoId → enlace local del video propio.
export function aEscenas(
  clips: Clip[],
  fuentes: { tomas?: Record<string, string | null | undefined>; videos?: Record<string, string | null | undefined> } = {},
): EscenaRender[] {
  return clips.filter(presente).map((c) => {
    const e: EscenaRender = {
      imagen: c.image,
      texto: c.caption,
      textoPos: c.textoPos ?? "abajo",
      textoTam: c.textoTam ?? "normal",
      segundos: duracionClip(c),
      transicion: c.transicion ?? "fundido",
      transicionSeg: SEGUNDOS_TRANSICION[c.transicionDur ?? "normal"],
    };
    if (c.tipo === "toma") {
      const src = fuentes.tomas?.[c.id];
      const modo = c.reproduccion ?? "normal";
      if (src) {
        e.video = { src, inicio: 0, fin: SEGUNDOS_TOMA, velocidad: modo === "lenta" ? 0.5 : 1, sonido: false };
        if (modo === "repetir2" || modo === "repetir3") e.video.repetir = FACTOR[modo];
      }
    } else if (c.tipo === "video") {
      const src = c.archivoId ? fuentes.videos?.[c.archivoId] : null;
      if (src) e.video = { src, ...tramo(c), velocidad: velocidadValida(c.velocidad), sonido: !c.sinSonido };
    }
    return e;
  });
}

// «Aplicar a todos»: la transición y la duración del clip `i` pasan a todos los clips
export function transicionATodos(clips: Clip[], i: number): Clip[] {
  if (!dentro(clips, i)) return clips;
  const { transicion = "fundido", transicionDur } = clips[i];
  return clips.map((c) => {
    const n: Clip = { ...c, transicion };
    if (transicionDur) n.transicionDur = transicionDur;
    else delete n.transicionDur;
    return n;
  });
}

// «Sorpréndeme»: una transición distinta en cada clip (cada uno conserva su duración)
export function transicionesAlAzar(clips: Clip[], azar?: () => number): Clip[] {
  const elegidas = repartirAlAzar(clips.length, azar);
  return clips.map((c, i) => ({ ...c, transicion: elegidas[i] }));
}

// Los efectos de sonido del video: cada uno suena en el segundo en que empieza su clip
export function efectosDe(clips: Clip[]): { kind: string; at: number }[] {
  const lista: { kind: string; at: number }[] = [];
  let t = 0;
  for (const c of clips) {
    if (!presente(c)) continue;
    if (c.efecto) lista.push({ kind: c.efecto, at: Math.round(t * 100) / 100 });
    t += duracionClip(c);
  }
  return lista;
}

// Si la voz dura más que el video, reparte el tiempo que falta entre las fotos (todas iguales).
// Las tomas con IA no se tocan. Deja medio segundo de aire después de la voz.
export function ajustarAVoz(clips: Clip[], segundosVoz: number): Clip[] {
  if (!(segundosVoz > 0) || suma(clips) >= segundosVoz) return clips;
  const esFoto = (c: Clip) => !!c.image && c.tipo === "foto";
  const n = clips.filter(esFoto).length;
  if (n === 0) return clips;
  // Lo que no se reparte: tomas con IA y videos propios
  const fijo = clips.filter((c) => c.tipo !== "foto").reduce((a, c) => a + duracionClip(c), 0);
  const cada = acotar((segundosVoz + 0.5 - fijo) / n);
  return clips.map((c) => (esFoto(c) ? { ...c, segundos: cada } : c));
}

// Pone una imagen que llega de otra sección en el primer clip libre (o en uno nuevo al final).
// Un clip con foto guardada (imageId) no está libre aunque su imagen todavía no se haya recuperado.
export function ponerEnLibre(clips: Clip[], image: string): Clip[] {
  const libre = clips.findIndex((c) => !c.image && !c.imageId && !c.archivoId && c.tipo !== "video");
  if (libre < 0) return [...clips, nuevoClip({ image })];
  return clips.map((c, j) => (j === libre ? { ...c, image, loading: false } : c));
}

// Antes de grabar: ¿qué clips saldrían como imagen fija sin que nadie lo pidiera?
// videos = clips de video cuyo archivo no está; tomas = tomas ya generadas que no se pudieron traer.
// Devuelve el número de clip (desde 1) contando solo los que entran al video.
export function sinFuente(
  clips: Clip[],
  fuentes: { tomas?: Record<string, string | null | undefined>; videos?: Record<string, string | null | undefined> },
): { videos: number[]; tomas: number[] } {
  const r = { videos: [] as number[], tomas: [] as number[] };
  clips.filter(presente).forEach((c, i) => {
    if (c.tipo === "video" && !(c.archivoId && fuentes.videos?.[c.archivoId])) r.videos.push(i + 1);
    if (c.tipo === "toma" && c.trabajoId && !fuentes.tomas?.[c.id]) r.tomas.push(i + 1);
  });
  return r;
}
