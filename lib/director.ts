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
  duracionClip,
  mover,
  nuevoClip,
  presente,
  tomasDistintas,
  transicionesAlAzar,
  type Clip,
  type TextoPos,
  type TextoTam,
} from "./linea-tiempo";
import { TRANSICIONES, esDuracionTransicion, esTransicion, nombreTransicion, type DuracionTransicion, type Transicion } from "./reel-transicion";

export const MAX_ACCIONES = 20;
export const MAX_ORDEN = 500; // caracteres de la orden
// Al armar un video cada foto dura de 7 a 10 s: pocas imágenes, bien aprovechadas (se gasta menos)
export const FOTO_DIRECTOR = 8;
export const MIN_FOTO_DIRECTOR = 7;
export const MAX_FOTO_DIRECTOR = 10;
export const CLIPS_DEFECTO = 4;
const MIN_CLIPS = 2;
const MAX_CLIPS = 12;
export const TOPE_CLIPS = 40; // lo más que una orden puede dejar en el video (más que eso vuelve lento al teléfono)
const MAX_TEXTO = 120;
const MAX_GUION = 1500;
const MAX_TOMAS_AL_ARMAR = 4; // al armar un video «con IA» se animan hasta 4 fotos (decisión de Hector)

export type Formato = "9:16" | "1:1" | "16:9";
export type RefClip = number | "todos"; // número desde 1, como en pantalla

export type Accion =
  | { tipo: "armar"; tema: string; clips: number; segundosPorFoto: number; textos: string[]; imagenes: string[]; cta: string; guion: string; conIa: boolean; musica?: string }
  | { tipo: "agregar_clip"; cantidad: number }
  | { tipo: "borrar_clip"; clip: number }
  | { tipo: "mover_clip"; clip: number; a: number }
  | { tipo: "duplicar_clip"; clip: number }
  | { tipo: "duracion"; clip: RefClip; segundos: number }
  | { tipo: "duracion_total"; segundos: number }
  | { tipo: "texto"; clip: number; texto: string }
  | { tipo: "estilo_texto"; clip: RefClip; posicion?: TextoPos; tamano?: TextoTam }
  | { tipo: "transicion"; clip: RefClip; valor?: Transicion | "sorpresa"; duracion?: DuracionTransicion }
  | { tipo: "imagen"; clip: number; descripcion: string }
  | { tipo: "animar"; clip: number; activar: boolean; movimiento?: string }
  | { tipo: "formato"; valor: Formato }
  | { tipo: "cierre"; negocio?: string; cta?: string }
  | { tipo: "guion"; texto: string }
  | { tipo: "voz"; genero?: "mujer" | "hombre"; voz?: string; generar?: boolean; quitar?: boolean }
  | { tipo: "subtitulos"; activar: boolean }
  | { tipo: "musica"; activar?: boolean; estilo?: string; volumen?: number | "subir" | "bajar" }
  | { tipo: "vista_previa" }
  | { tipo: "crear_video" }
  | { tipo: "generar_ia" }; // genera las tomas con IA de las fotos marcadas y graba el video

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
  "transicion",
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
  "generar_ia",
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
        conIa: bool(a.con_ia ?? a.conIa) === true,
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
    case "transicion": {
      const clip = refClip(a.clip);
      if (clip === null) return null;
      const r: Extract<Accion, { tipo: "transicion" }> = { tipo: "transicion", clip };
      if (a.valor === "sorpresa") {
        if (clip !== "todos") return null; // la sorpresa reparte por todo el video
        r.valor = "sorpresa";
      } else if (a.valor !== undefined) {
        if (!esTransicion(a.valor)) return null;
        r.valor = a.valor;
      }
      if (esDuracionTransicion(a.duracion)) r.duracion = a.duracion;
      return r.valor || r.duracion ? r : null;
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
    case "generar_ia":
      return { tipo: "generar_ia" };
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

// ---------- Aplicar las acciones al video ----------

// Los ajustes del reel que una orden puede cambiar (lo demás del Creador de Reels no se toca)
export type Ajustes = {
  formato: Formato;
  tema: string; // «¿De qué trata el reel?»
  negocio: string;
  cta: string;
  guion: string;
  vozId: string;
  hayVoz: boolean; // ya hay una voz generada
  subtitulos: boolean;
  musica: boolean;
  estilo: string;
  volumen: number; // 0 a 1
};
export type Estado = { clips: Clip[]; ajustes: Ajustes };

// Lo que la orden deja por hacer después de aplicarse: lo que gasta (imágenes, voz) y lo que se ve al final.
export type Pendiente =
  | { tipo: "imagen"; clipId: string; descripcion: string }
  | { tipo: "voz"; ajustarFotos: boolean } // ajustarFotos: al generarla, repartir las fotos para cubrirla (al armar)
  | { tipo: "quitar_voz" }
  | { tipo: "vista_previa" }
  | { tipo: "crear_video" }
  | { tipo: "generar_ia"; tomas: number }; // tomas: cuántas fotos animadas se pedirán (las ya generadas no se cobran)

export type Permisos = { voz: boolean; ia: boolean }; // el plan incluye voz / hay sesión para animar con IA
export type Resultado = { estado: Estado; pendientes: Pendiente[]; hecho: string[]; avisos: string[] };

const mmss = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

export function aplicarAcciones(estado: Estado, acciones: Accion[], cat: Catalogo, permisos: Permisos): Resultado {
  let clips = estado.clips;
  const aj: Ajustes = { ...estado.ajustes };
  const hecho: string[] = [];
  const avisos: string[] = [];
  const imagenes = new Map<string, string>(); // clip → descripción de la imagen por crear
  let voz: { ajustarFotos: boolean } | null = null;
  let quitarVoz = false;
  let final: "vista_previa" | "crear_video" | null = null;
  let generarIa = false;

  const aviso = (t: string) => void (avisos.includes(t) || avisos.push(t));
  // Los números de clip son los que la persona veía al dar la orden: «borra el 2 y el 3» son esos dos,
  // aunque al borrar el 2 los demás se recorran. numeros[n-1] = id del clip que tenía el número n.
  let numeros = clips.map((c) => c.id);
  // Devuelve el índice actual del clip número n, o avisa que no existe (o que esta misma orden ya lo borró)
  const lugar = (n: number): number => {
    const id = numeros[n - 1];
    if (id === undefined) {
      aviso(`No existe el clip ${n}`);
      return -1;
    }
    const i = clips.findIndex((c) => c.id === id);
    if (i < 0) aviso(`El clip ${n} ya se borró en esta misma orden`);
    return i;
  };
  // Un clip «tendrá foto» si ya la tiene o si esta misma orden la va a crear
  const tendraFoto = (c: Clip) => presente(c) || imagenes.has(c.id);
  const pedirVoz = (ajustarFotos: boolean) => {
    if (!aj.guion.trim()) return aviso("Escribe primero el guion");
    if (!permisos.voz) return aviso("Tu plan no incluye voz");
    voz = { ajustarFotos: ajustarFotos || !!voz?.ajustarFotos };
    quitarVoz = false;
    aj.hayVoz = false;
    return true;
  };

  for (const a of acciones) {
    switch (a.tipo) {
      case "agregar_clip":
        const caben = Math.min(a.cantidad, Math.max(0, TOPE_CLIPS - clips.length));
        if (caben < a.cantidad) aviso(`Un video admite hasta ${TOPE_CLIPS} clips`);
        if (caben === 0) break;
        const nuevos = Array.from({ length: caben }, () => nuevoClip());
        clips = [...clips, ...nuevos];
        numeros = [...numeros, ...nuevos.map((c) => c.id)]; // toman los números que siguen
        hecho.push(caben === 1 ? "Agregué 1 clip" : `Agregué ${caben} clips`);
        break;
      case "borrar_clip": {
        const i = lugar(a.clip);
        if (i < 0) break;
        imagenes.delete(clips[i].id);
        clips = borrar(clips, i);
        hecho.push(`Borré el clip ${a.clip}`);
        break;
      }
      case "mover_clip": {
        const i = lugar(a.clip);
        if (i < 0) break;
        const destino = Math.min(clips.length, a.a) - 1;
        clips = mover(clips, i, destino);
        hecho.push(`Moví el clip ${a.clip} al lugar ${destino + 1}`);
        break;
      }
      case "duplicar_clip": {
        const i = lugar(a.clip);
        if (i < 0) break;
        if (clips.length >= TOPE_CLIPS) {
          aviso(`Un video admite hasta ${TOPE_CLIPS} clips`);
          break;
        }
        clips = duplicar(clips, i);
        hecho.push(`Dupliqué el clip ${a.clip}`);
        break;
      }
      case "duracion": {
        if (a.clip === "todos") {
          clips = clips.map((c) => (c.tipo === "foto" ? { ...c, segundos: a.segundos } : c));
          hecho.push(`Puse todas las fotos en ${a.segundos} s`);
          break;
        }
        const i = lugar(a.clip);
        if (i < 0) break;
        if (clips[i].tipo === "toma") {
          aviso(`El clip ${a.clip} está animado con IA y siempre dura ${SEGUNDOS_TOMA} s`);
          break;
        }
        if (clips[i].tipo === "video") {
          aviso(`El clip ${a.clip} es un video: su duración se cambia recortándolo`);
          break;
        }
        clips = cambiar(clips, i, { segundos: a.segundos });
        hecho.push(`Puse el clip ${a.clip} en ${a.segundos} s`);
        break;
      }
      case "duracion_total": {
        const cuentan = clips.filter(tendraFoto);
        const fotos = cuentan.filter((c) => c.tipo === "foto");
        if (fotos.length === 0) {
          aviso("Agrega fotos antes de fijar la duración del video");
          break;
        }
        // Lo que no se reparte: tomas con IA, videos propios y el cierre
        const fijo = cuentan.reduce((s, c) => s + (c.tipo === "toma" ? SEGUNDOS_TOMA : c.tipo === "video" ? duracionClip(c) : 0), 0) + CIERRE;
        const cada = entre(Math.round(((a.segundos - fijo) / fotos.length) * 10) / 10, MIN_FOTO, MAX_FOTO);
        const ids = new Set(fotos.map((c) => c.id));
        clips = clips.map((c) => (ids.has(c.id) ? { ...c, segundos: cada } : c));
        hecho.push(`Ajusté el video a ${mmss(fotos.length * cada + fijo)}`);
        break;
      }
      case "texto": {
        const i = lugar(a.clip);
        if (i < 0) break;
        clips = cambiar(clips, i, { caption: a.texto });
        hecho.push(`Cambié el texto del clip ${a.clip}`);
        break;
      }
      case "estilo_texto": {
        const cambios: Partial<Clip> = { ...(a.posicion ? { textoPos: a.posicion } : {}), ...(a.tamano ? { textoTam: a.tamano } : {}) };
        if (a.clip === "todos") {
          clips = clips.map((c) => ({ ...c, ...cambios }));
          hecho.push("Cambié el estilo de todos los textos");
          break;
        }
        const i = lugar(a.clip);
        if (i < 0) break;
        clips = cambiar(clips, i, cambios);
        hecho.push(`Cambié el estilo del texto del clip ${a.clip}`);
        break;
      }
      case "transicion": {
        const cambios: Partial<Clip> = {};
        if (a.valor && a.valor !== "sorpresa") cambios.transicion = a.valor;
        if (a.duracion) cambios.transicionDur = a.duracion;
        const DURACION = { rapida: "rápidas", normal: "de duración normal", lenta: "lentas" } as const;
        if (a.clip === "todos") {
          if (a.valor === "sorpresa") {
            clips = transicionesAlAzar(clips).map((c) => (a.duracion ? { ...c, transicionDur: a.duracion } : c));
            hecho.push("Repartí transiciones variadas por todo el video");
            break;
          }
          clips = clips.map((c) => ({ ...c, ...cambios }));
          hecho.push(cambios.transicion ? `Puse la transición «${nombreTransicion(cambios.transicion)}» en todos los clips` : `Puse las transiciones ${DURACION[a.duracion!]} en todos los clips`);
          break;
        }
        const i = lugar(a.clip);
        if (i < 0) break;
        clips = cambiar(clips, i, cambios);
        hecho.push(cambios.transicion ? `Puse la transición «${nombreTransicion(cambios.transicion)}» después del clip ${a.clip}` : `Cambié la duración de la transición del clip ${a.clip}`);
        break;
      }
      case "imagen": {
        const i = lugar(a.clip);
        if (i < 0) break;
        clips = cambiar(clips, i, { prompt: a.descripcion });
        imagenes.set(clips[i].id, a.descripcion);
        hecho.push(`Crearé la imagen del clip ${a.clip}`);
        break;
      }
      case "animar": {
        const i = lugar(a.clip);
        if (i < 0) break;
        if (!a.activar) {
          clips = cambiar(clips, i, { tipo: "foto" });
          hecho.push(`Quité la IA del clip ${a.clip}`);
          break;
        }
        if (clips[i].tipo === "video") {
          aviso(`El clip ${a.clip} es un video: solo se animan fotos`);
          break;
        }
        if (!permisos.ia) {
          aviso("Inicia sesión para animar fotos con IA");
          break;
        }
        if (!tendraFoto(clips[i])) {
          aviso(`El clip ${a.clip} no tiene foto todavía`);
          break;
        }
        const yaEs = clips[i].tipo === "toma";
        if (!yaEs && tomasDistintas(clips) >= MAX_TOMAS) {
          aviso(`Máximo ${MAX_TOMAS} fotos con IA por video`);
          break;
        }
        clips = cambiar(clips, i, { tipo: "toma", ...(a.movimiento ? { movimiento: a.movimiento } : {}) });
        hecho.push(`Marqué el clip ${a.clip} para animar con IA (toca «Generar con IA» cuando quieras)`);
        break;
      }
      case "formato":
        aj.formato = a.valor;
        hecho.push(`Cambié el formato a ${a.valor}`);
        break;
      case "cierre":
        if (a.negocio) aj.negocio = a.negocio;
        if (a.cta) aj.cta = a.cta;
        hecho.push("Cambié el cierre");
        break;
      case "guion":
        aj.guion = a.texto;
        hecho.push("Cambié el guion de la voz");
        if (aj.hayVoz) {
          aj.hayVoz = false;
          quitarVoz = true;
          aviso("Cambió el guion: genera la voz de nuevo");
        }
        break;
      case "voz": {
        if (a.quitar) {
          aj.hayVoz = false;
          voz = null;
          quitarVoz = true;
          hecho.push("Quité la voz");
          break;
        }
        const antes = aj.vozId;
        const elegida = a.voz ?? (a.genero ? cat.voces.find((v) => v.genero === a.genero)?.id : undefined);
        // Si ya suena una voz de ese género, no se cambia
        const yaEsDeEseGenero = !a.voz && !!a.genero && cat.voces.find((v) => v.id === antes)?.genero === a.genero;
        if (elegida && !yaEsDeEseGenero) aj.vozId = elegida;
        const cambio = aj.vozId !== antes;
        if (cambio) hecho.push("Elegí otra voz");
        // Con una voz ya generada, cambiarla la vuelve a generar (igual que el selector de voces)
        if (a.generar || (cambio && aj.hayVoz)) {
          if (pedirVoz(false)) hecho.push("Generaré la voz");
        }
        break;
      }
      case "subtitulos":
        aj.subtitulos = a.activar;
        hecho.push(a.activar ? "Activé los subtítulos" : "Quité los subtítulos");
        break;
      case "musica": {
        if (a.estilo) {
          aj.estilo = a.estilo;
          aj.musica = true;
        }
        if (a.activar !== undefined) aj.musica = a.activar;
        if (a.volumen !== undefined) {
          const v = a.volumen === "subir" ? aj.volumen + 0.15 : a.volumen === "bajar" ? aj.volumen - 0.15 : a.volumen / 100;
          aj.volumen = Math.round(entre(v, 0, 1) * 100) / 100;
        }
        hecho.push(a.activar === false ? "Quité la música" : "Cambié la música");
        break;
      }
      case "armar": {
        // Nunca se borra una foto: se conservan los clips con foto y, de los vacíos, solo los necesarios
        let lista = clips.slice();
        for (let i = lista.length - 1; i >= 0 && lista.length > a.clips; i--) {
          if (!tendraFoto(lista[i])) lista.splice(i, 1);
        }
        while (lista.length < a.clips) lista.push(nuevoClip());
        lista = lista.map((c, i) => {
          if (i >= a.clips) return c;
          const n: Clip = { ...c, prompt: a.imagenes[i] || c.prompt };
          if (a.textos[i]) n.caption = a.textos[i];
          if (n.tipo === "foto") n.segundos = a.segundosPorFoto;
          if (!tendraFoto(c)) imagenes.set(c.id, a.imagenes[i]);
          return n;
        });
        clips = lista;
        numeros = lista.map((c) => c.id); // video nuevo: los números son los de esta lista
        aj.tema = a.tema; // queda escrito en «¿De qué trata el reel?»
        if (a.cta) aj.cta = a.cta;
        if (a.musica) {
          aj.estilo = a.musica;
          aj.musica = true;
        }
        hecho.push(`Armé ${a.clips} clips con sus textos`);
        if (a.conIa) {
          if (!permisos.ia) aviso("Inicia sesión para animar fotos con IA");
          else {
            // Anima las fotos del video, en orden, hasta el máximo por video
            let marcadas = clips.filter((c) => c.tipo === "toma" && tendraFoto(c)).length;
            clips = clips.map((c, i) => {
              if (i >= a.clips || c.tipo !== "foto" || marcadas >= MAX_TOMAS_AL_ARMAR) return c;
              marcadas++;
              return { ...c, tipo: "toma" as const };
            });
            generarIa = true;
          }
        }
        if (a.guion) {
          aj.guion = a.guion;
          if (pedirVoz(true)) hecho.push("Escribí el guion y generaré la voz");
          else hecho.push("Escribí el guion");
        }
        break;
      }
      case "vista_previa":
        if (final !== "crear_video") final = "vista_previa";
        break;
      case "crear_video":
        final = "crear_video";
        break;
      case "generar_ia":
        if (!permisos.ia) aviso("Inicia sesión para animar fotos con IA");
        else generarIa = true;
        break;
    }
  }

  const pendientes: Pendiente[] = [];
  // Solo las imágenes de clips que siguen en la lista
  for (const c of clips) if (imagenes.has(c.id)) pendientes.push({ tipo: "imagen", clipId: c.id, descripcion: imagenes.get(c.id)! });
  if (voz) pendientes.push({ tipo: "voz", ajustarFotos: (voz as { ajustarFotos: boolean }).ajustarFotos });
  else if (quitarVoz) pendientes.push({ tipo: "quitar_voz" });
  // Generar las tomas ya graba el video al terminar: manda sobre la vista previa y «crear video»
  const tomas = clips.filter((c) => c.tipo === "toma" && tendraFoto(c)).length;
  if (generarIa && tomas === 0) aviso("Marca primero qué fotos animar con IA");
  if (generarIa && tomas > 0) {
    pendientes.push({ tipo: "generar_ia", tomas });
    hecho.push(tomas === 1 ? "Generaré 1 toma con IA y grabaré el video" : `Generaré ${tomas} tomas con IA y grabaré el video`);
  } else if (final) pendientes.push({ tipo: final });
  return { estado: { clips, ajustes: aj }, pendientes, hecho, avisos };
}

export type Costo = { imagenes: number; voces: number; tomas: number };

export function costoDe(pendientes: Pendiente[]): Costo {
  return {
    imagenes: pendientes.filter((p) => p.tipo === "imagen").length,
    voces: pendientes.filter((p) => p.tipo === "voz").length,
    tomas: pendientes.reduce((n, p) => n + (p.tipo === "generar_ia" ? p.tomas : 0), 0),
  };
}

// El texto de la confirmación antes de gastar. null = la orden no gasta nada.
// Las tomas van con «hasta» porque las que ya se generaron antes no se vuelven a cobrar.
export function textoCosto(c: Costo): string | null {
  const partes: string[] = [];
  if (c.imagenes > 0) partes.push(c.imagenes === 1 ? "1 imagen" : `${c.imagenes} imágenes`);
  if (c.voces > 0) partes.push(c.voces === 1 ? "1 voz" : `${c.voces} voces`);
  if (c.tomas > 0) partes.push(c.tomas === 1 ? "hasta 1 toma con IA" : `hasta ${c.tomas} tomas con IA`);
  if (partes.length === 0) return null;
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  return `Esta orden usa ${lista}.`;
}

// Lo que se le cuenta a la IA del video: textos y números. Nunca las fotos.
export function resumenProyecto(estado: Estado): Record<string, unknown> {
  const a = estado.ajustes;
  return {
    formato: a.formato,
    tema: a.tema,
    clips: estado.clips.map((c, i) => ({
      n: i + 1,
      tipo: c.tipo === "toma" ? "con_ia" : c.tipo,
      segundos: c.tipo === "toma" ? SEGUNDOS_TOMA : c.tipo === "video" ? Math.round(duracionClip(c) * 10) / 10 : c.segundos,
      foto: presente(c),
      texto: c.caption,
    })),
    negocio: a.negocio,
    cta: a.cta,
    guion: a.guion,
    voz: a.vozId,
    voz_generada: a.hayVoz,
    subtitulos: a.subtitulos,
    musica: { activa: a.musica, estilo: a.estilo, volumen: Math.round(a.volumen * 100) },
  };
}

// ---------- Instrucciones para la IA ----------

// Lo que se le dice a la IA: quién es, el catálogo de acciones, las reglas de costo y calidad, y ejemplos.
export function instruccionesDirector(o: {
  resumen: Record<string, unknown>;
  estilos: { id: string; nombre: string }[];
  voces: { id: string; nombre: string; genero: string }[];
  marca?: string;
  ingles?: boolean;
}): { system: string; user: (orden: string) => string } {
  const system = [
    "Eres el director de video de InnovationTECH Studio. La persona te da una orden (escrita o dictada) sobre su reel publicitario y tú la conviertes en acciones.",
    'Responde SOLO con un objeto JSON válido, sin texto adicional ni explicaciones, con esta forma exacta: {"acciones": [ ... ], "mensaje": "una frase corta para la persona"}',
    "",
    "ACCIONES PERMITIDAS (usa solo estas; nunca inventes acciones ni campos). Los clips se numeran desde 1:",
    '- {"tipo": "armar", "tema": "...", "clips": N, "segundos_por_foto": S, "textos": [N frases], "imagenes": [N descripciones], "cta": "...", "guion": "...", "musica": "estilo", "con_ia": true | false}: arma el video completo. Úsala cuando pidan crear, hacer o armar un video. "con_ia": true SOLO si piden el video con IA, con movimiento real o con fotos animadas.',
    '- {"tipo": "agregar_clip", "cantidad": N}: agrega clips vacíos al final.',
    '- {"tipo": "borrar_clip", "clip": N}',
    '- {"tipo": "mover_clip", "clip": N, "a": N}: mueve el clip al lugar "a".',
    '- {"tipo": "duplicar_clip", "clip": N}',
    '- {"tipo": "duracion", "clip": N o "todos", "segundos": S}: cuánto dura esa foto (1.5 a 15).',
    '- {"tipo": "duracion_total", "segundos": S}: cuánto dura el video completo (hasta 120).',
    '- {"tipo": "texto", "clip": N, "texto": "..."}: el texto en pantalla de ese clip (máximo 8 palabras).',
    '- {"tipo": "estilo_texto", "clip": N o "todos", "posicion": "arriba" | "centro" | "abajo", "tamano": "chico" | "normal" | "grande"}',
`- {"tipo": "transicion", "clip": N o "todos", "valor": id, "duracion": "rapida" | "normal" | "lenta"}: cómo se pasa de ese clip al siguiente. Ids: ${TRANSICIONES.map((t) => `${t.id} (${t.nombre})`).join(", ")}. Con "clip": "todos" también vale "valor": "sorpresa", que reparte transiciones variadas. Pon solo los campos que cambien.`,
    '- {"tipo": "imagen", "clip": N, "descripcion": "..."}: crea con IA la imagen de ese clip. Úsala solo si la piden.',
    '- {"tipo": "animar", "clip": N, "activar": true | false, "movimiento": "..."}: marca la foto para animarla con IA (movimiento real, 5 s). Úsala solo si la piden.',
    '- {"tipo": "generar_ia"}: genera las tomas con IA de las fotos marcadas y graba el video. Ponla al final cuando pidan animar fotos o generar el video con IA.',
    '- {"tipo": "formato", "valor": "9:16" | "1:1" | "16:9"}: vertical, cuadrado u horizontal.',
    '- {"tipo": "cierre", "negocio": "...", "cta": "..."}: nombre del negocio y llamada a la acción del final.',
    '- {"tipo": "guion", "texto": "..."}: lo que dice la voz en off.',
    '- {"tipo": "voz", "genero": "mujer" | "hombre", "voz": "id", "generar": true, "quitar": true}: elige la voz, la genera o la quita (pon solo los campos que hagan falta).',
    '- {"tipo": "subtitulos", "activar": true | false}',
    '- {"tipo": "musica", "activar": true | false, "estilo": "id", "volumen": 0 a 100 | "subir" | "bajar"}',
    '- {"tipo": "vista_previa"}: muestra el video sin grabarlo.',
    '- {"tipo": "crear_video"}: graba el video final. Úsala solo si piden crearlo, grabarlo o exportarlo ya.',
    "",
    `ESTILOS DE MÚSICA (usa el id): ${o.estilos.map((e) => `${e.id} (${e.nombre})`).join(", ")}.`,
    `VOCES (usa el id): ${o.voces.map((v) => `${v.id} (${v.nombre}, ${v.genero})`).join(", ")}.`,
    "",
    "REGLAS PARA GASTAR POCO Y QUE QUEDE BIEN:",
    "- Pocas imágenes, bien aprovechadas: al armar, cada foto dura entre 7 y 10 segundos (8 si no dicen otra cosa).",
    '- Los números de clip son SIEMPRE los de la lista que ves arriba, aunque en la misma respuesta borres, muevas o dupliques clips. Los clips que agregues toman los números siguientes.',
    '- El número de clips de "armar" es la duración pedida dividida entre 8 (30 s → 4 clips, 60 s → 8 clips), entre 2 y 12. Si no dicen duración, usa 4 clips.',
    '- "textos": una frase corta por clip (máximo 8 palabras) que cuente una historia: gancho, beneficios y oferta. Sin hashtags ni emojis.',
    '- "imagenes": una descripción EN INGLÉS por clip, detallada: sujeto, lugar, luz, encuadre, estilo de fotografía publicitaria profesional, sin texto dentro de la imagen. Que la imagen salga bien a la primera.',
    '- "guion": natural y entusiasta, a unas 2.3 palabras por segundo de video, para que la voz quepa sin alargarlo.',
    "- Las tomas con IA cuestan: usa \"con_ia\", \"animar\" y \"generar_ia\" solo si la persona lo pide (\"con IA\", \"con movimiento real\", \"anima las fotos\", \"anima el clip 2\"). Si no lo pide, el video va con zoom, que es gratis.",
    "- No crees imágenes ni voz que no te hayan pedido. No cambies lo que no te pidan.",
    "- Si la orden no se puede hacer con estas acciones, o no se entiende, responde con la lista vacía y explica en el mensaje qué sí puedes hacer.",
    '- "mensaje": una sola frase amable, en el idioma de la orden.',
    "",
    "EJEMPLOS:",
    'Orden: "hazme un video de 30 segundos de la promo 2x1 en tortas los martes, con música alegre"',
    '{"acciones": [{"tipo": "armar", "tema": "promo 2x1 en tortas los martes", "clips": 4, "segundos_por_foto": 7, "textos": ["¿Antojo de torta?", "Martes de 2x1", "Recién hechas, bien servidas", "Solo este martes"], "imagenes": ["close-up of a Mexican torta ahogada on a rustic wooden table, warm natural light, shallow depth of field, professional food advertising photography", "two fresh Mexican tortas side by side on a colorful plate, bright daylight, top-down view, professional food advertising photography", "cook hands assembling a torta in a busy taqueria kitchen, steam rising, warm light, professional advertising photography", "happy friends sharing tortas at a street food stand at dusk, string lights, candid, professional advertising photography"], "cta": "Te esperamos este martes", "guion": "¿Se te antoja una torta? Este martes llévate dos al precio de una. Recién hechas, bien servidas y con todo el sabor de casa. No te lo pierdas, te esperamos este martes.", "musica": "pop"}], "mensaje": "Listo, armé tu video de la promo de los martes."}',
    'Orden: "quita el clip 2, pon todos los textos arriba y grandes y baja la música"',
    '{"acciones": [{"tipo": "borrar_clip", "clip": 2}, {"tipo": "estilo_texto", "clip": "todos", "posicion": "arriba", "tamano": "grande"}, {"tipo": "musica", "volumen": "bajar"}], "mensaje": "Hecho: quité el clip 2, subí los textos y bajé la música."}',
    'Orden: "anima con IA el primer clip, que la cámara se acerque despacio"',
    '{"acciones": [{"tipo": "animar", "clip": 1, "activar": true, "movimiento": "the camera slowly pushes in"}, {"tipo": "generar_ia"}], "mensaje": "Voy a animar el primer clip con IA y grabar tu video."}',
    'Orden: "publícalo en Instagram"',
    '{"acciones": [], "mensaje": "Todavía no puedo publicar por ti; puedo crear el video para que lo descargues."}',
    o.marca ? `\nContexto de la marca:\n${o.marca}` : "",
    o.ingles ? "\nIMPORTANT: Write the on-screen texts, the script, the call to action and the message in English (keep the JSON keys and action names exactly as specified)." : "",
  ].join("\n");
  const user = (orden: string) => `ESTADO ACTUAL DEL VIDEO:\n${JSON.stringify(o.resumen)}\n\nORDEN: ${orden}`;
  return { system, user };
}
