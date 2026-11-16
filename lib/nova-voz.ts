// La voz de NOVA: lo que lee en voz alta (sin Markdown ni ideas de imagen, en partes de ≤ 400 letras),
// qué voces puede usar (Aura-2 de Deepgram en Cloudflare, sin la «Básica»), la revisión del pedido y el
// tope por persona de la ruta /api/nova/voz, y el reproductor del navegador (una sola voz a la vez).
// Funciones puras o con dependencias que se pasan, para poder probarlas en Node.

import { sinIdeasDeImagen } from "./nova-sugerencias";
import { VOICES, type Voice } from "./voices";

export const MAX_VOZ_NOVA = 400; // letras por audio (y lo máximo que acepta la ruta)
export const ESPACIO_VOZ_MS = 3000; // la ruta acepta 1 pedido cada 3 s por persona

type Idioma = "es" | "en";

// Voz de NOVA por defecto: «estrella» (México) en español y «luna» en inglés
export const VOZ_NOVA_DEFECTO = { es: "es-estrella", en: "en-luna" } as const;

// La frase del botón «Probar» de Ajustes de NOVA
export const FRASE_PRUEBA = { es: "Hola, soy NOVA. ¿Qué creamos hoy?", en: "Hi, I'm NOVA. What shall we create today?" } as const;

// Las voces que puede usar NOVA en un idioma: solo Aura-2 (con speaker), nunca la Básica
export const vocesNova = (lang: Idioma): Voice[] => VOICES.filter((v) => v.lang === lang && !v.basic && !!v.speaker);

// La voz pedida si es una Aura-2 del idioma; cualquier otra cosa → la de defecto del idioma
export function vozNova(id: unknown, lang: Idioma): Voice {
  const lista = vocesNova(lang);
  return (typeof id === "string" && lista.find((v) => v.id === id)) || lista.find((v) => v.id === VOZ_NOVA_DEFECTO[lang])!;
}

// ---------- Qué se lee ----------

// Quita el Markdown de una línea para que la voz no lea asteriscos, gatos ni direcciones web
function lineaLimpia(linea: string): string {
  if (/^\s*\|?\s*:?-{3,}/.test(linea) || /^\s*([-*_]\s*){3,}$/.test(linea) || /^\s*(```|~~~)/.test(linea)) return "";
  return linea
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // imágenes → su texto
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // enlaces → su texto
    .replace(/https?:\/\/\S+/g, "") // direcciones sueltas
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+)+/, "") // título, cita o viñeta al inicio
    .replace(/^\s*(\d+)[.)]\s+/, "$1: ") // «1. Idea» → «1: Idea»
    .replace(/\|/g, ", ") // celdas de tabla
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

// El texto listo para leer: cada línea es una frase (si no termina en signo, se le pone un punto antes de la siguiente)
function textoParaLeer(texto: string): string {
  const lineas = sinIdeasDeImagen(texto).split(/\r?\n/).map(lineaLimpia).filter(Boolean);
  return lineas.map((l, i) => (i < lineas.length - 1 && !/[.!?…:;,]$/.test(l) ? `${l}.` : l)).join(" ");
}

// Junta piezas en grupos de hasta `max` letras (una pieza más larga se deja sola, para partirla después)
function juntar(piezas: string[], max: number): string[] {
  const salida: string[] = [];
  let actual = "";
  for (const p of piezas) {
    if (!actual) actual = p;
    else if (actual.length + 1 + p.length <= max) actual += ` ${p}`;
    else {
      salida.push(actual);
      actual = p;
    }
  }
  if (actual) salida.push(actual);
  return salida;
}

// Parte una oración demasiado larga: por comas y, si no alcanza, por espacios (nunca a media palabra,
// salvo una «palabra» más larga que el máximo, que se corta a la fuerza)
function partirLarga(oracion: string, max: number): string[] {
  const salida: string[] = [];
  for (const parte of juntar(oracion.split(/(?<=[,;:])\s+/), max)) {
    if (parte.length <= max) {
      salida.push(parte);
      continue;
    }
    for (const grupo of juntar(parte.split(/\s+/), max)) {
      for (let i = 0; i < grupo.length; i += max) salida.push(grupo.slice(i, i + max));
    }
  }
  return salida;
}

// Lo que NOVA lee de una respuesta, en partes de hasta `max` letras que terminan en oración completa
export function trozosDeVoz(texto: string, max: number = MAX_VOZ_NOVA): string[] {
  const limpio = textoParaLeer(texto || "");
  if (!limpio) return [];
  const oraciones = limpio.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const piezas = oraciones.flatMap((o) => (o.length > max ? partirLarga(o, max) : [o]));
  return juntar(piezas, max);
}

// ---------- Ruta /api/nova/voz ----------

export type PedidoVoz = { ok: true; text: string; lang: Idioma; voz: Voice } | { ok: false; error: string };

// Revisa el cuerpo del pedido antes de llamar a nada: texto de 1 a 400 letras, idioma y una voz permitida
export function validarVoz(cuerpo: unknown): PedidoVoz {
  const c = cuerpo && typeof cuerpo === "object" ? (cuerpo as Record<string, unknown>) : {};
  if (typeof c.text !== "string" || !c.text.trim()) return { ok: false, error: "Falta el texto que NOVA va a leer." };
  if (c.text.length > MAX_VOZ_NOVA) return { ok: false, error: "El texto es demasiado largo para leerlo de una vez." };
  const lang: Idioma = c.lang === "en" ? "en" : "es";
  return { ok: true, text: c.text.trim(), lang, voz: vozNova(c.voice, lang) };
}

// Tope en la memoria del servidor: 1 pedido cada `ms` por persona. Un pedido rechazado no alarga la espera.
// Guarda como máximo `maxClaves` personas (borra primero a quienes ya pueden volver a pedir, luego a la más vieja).
export function crearLimitador(ms: number, maxClaves = 5000) {
  const ultimo = new Map<string, number>();
  const permitir = (clave: string, ahora: number = Date.now()): boolean => {
    const u = ultimo.get(clave);
    if (u !== undefined && ahora - u < ms) return false;
    ultimo.delete(clave);
    if (ultimo.size >= maxClaves) {
      for (const [k, t] of ultimo) if (ahora - t >= ms) ultimo.delete(k);
      while (ultimo.size >= maxClaves) ultimo.delete(ultimo.keys().next().value as string);
    }
    ultimo.set(clave, ahora);
    return true;
  };
  return Object.assign(permitir, { tamano: () => ultimo.size });
}

// ---------- Reproductor del navegador ----------

export type OpcionesVozNova = {
  pedir: (t: string) => Promise<Blob>; // pide el audio de un trozo a /api/nova/voz
  reproducir: (b: Blob) => Promise<void>; // lo suena y termina cuando acaba
  respaldo: (t: string) => Promise<void>; // voz del aparato (speechSynthesis) si el audio no llega
  detener?: () => void; // corta lo que esté sonando (audio y voz del aparato)
  alCambiar?: (hablando: boolean) => void; // para el sello de NOVA
  espacioMs?: number; // espera mínima entre pedidos (la ruta acepta 1 cada 3 s)
};

class Cancelado extends Error {}
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Lee un texto por partes: pide el siguiente trozo mientras suena el actual. `decir` reemplaza lo que esté
// sonando (nunca dos voces a la vez); `callar` lo corta todo.
export function crearVozNova(o: OpcionesVozNova): { decir(texto: string): void; callar(): void; hablando(): boolean } {
  const espacio = o.espacioMs ?? ESPACIO_VOZ_MS + 100; // un poco más, por si los relojes no coinciden
  let turno = 0;
  let activo = false;
  let ultimoPedido = -Infinity;

  const poner = (h: boolean) => {
    if (activo === h) return;
    activo = h;
    o.alCambiar?.(h);
  };

  async function pedirEspaciado(t: string, mio: number): Promise<Blob> {
    const falta = ultimoPedido + espacio - Date.now();
    if (falta > 0) await dormir(falta);
    if (mio !== turno) throw new Cancelado();
    ultimoPedido = Date.now();
    return o.pedir(t);
  }

  async function correr(trozos: string[], mio: number) {
    let siguiente: Promise<Blob> | null = pedirEspaciado(trozos[0], mio);
    for (let i = 0; i < trozos.length; i++) {
      let audio: Blob | null = null;
      try {
        audio = await siguiente!;
      } catch {
        audio = null;
      }
      if (mio !== turno) return;
      siguiente = i + 1 < trozos.length ? pedirEspaciado(trozos[i + 1], mio) : null;
      siguiente?.catch(() => {}); // se revisa en la siguiente vuelta
      try {
        if (audio) await o.reproducir(audio);
        else await o.respaldo(trozos[i]);
      } catch {
        if (mio !== turno) return;
        if (audio) await o.respaldo(trozos[i]).catch(() => {});
      }
      if (mio !== turno) return;
    }
    poner(false);
  }

  return {
    decir(texto: string) {
      const mio = ++turno;
      o.detener?.();
      const trozos = trozosDeVoz(texto);
      if (!trozos.length) return poner(false);
      poner(true);
      void correr(trozos, mio);
    },
    callar() {
      turno++;
      o.detener?.();
      poner(false);
    },
    hablando: () => activo,
  };
}
