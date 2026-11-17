// Secuencia de fotos: la IA propone de 3 a 8 fotos DISTINTAS que cuentan una historia en orden,
// y NOVA escribe la voz en off para el video. Funciones puras (sin pantalla ni red) para poder probarlas.
// Las usa /api/text (modos «secuencia» y «guion_secuencia»).

import { PERSONA_NOVA } from "./nova";

export type IdeaFoto = { momento: string; prompt: string };

export const MIN_FOTOS = 3;
export const MAX_FOTOS = 8;
export const DURACIONES_SECUENCIA = [10, 15, 20, 30] as const;
export const MAX_MOMENTO = 80; // largo máximo de cada momento (etiqueta corta en español)
const MAX_PALABRAS_PROMPT = 60;

export type EstiloFoto = { id: "realista" | "estudio" | "calido" | "colorido"; nombre: string; sufijo: string };

// El mismo sufijo va al final de todas las fotos, para que parezcan de la misma sesión de fotos.
export const ESTILOS_FOTO: EstiloFoto[] = [
  { id: "realista", nombre: "Realista", sufijo: "realistic photo, natural light, same photo session, consistent colors, high detail" },
  { id: "estudio", nombre: "De estudio", sufijo: "professional studio photography, softbox lighting, clean background, same photo session, sharp focus" },
  { id: "calido", nombre: "Cálido", sufijo: "warm golden light, cozy atmosphere, soft tones, same photo session, consistent colors" },
  { id: "colorido", nombre: "Colorido", sufijo: "vibrant saturated colors, bright cheerful lighting, same photo session, bold look" },
];

const estiloDe = (id: string): EstiloFoto => ESTILOS_FOTO.find((e) => e.id === id) ?? ESTILOS_FOTO[0];

// ---------- Ideas de la secuencia ----------

export function promptSecuencia(o: { tema: string; n: number; estilo: string; marca?: string; english: boolean }): string {
  const estilo = estiloDe(o.estilo);
  return [
    "Eres director de fotografía publicitaria para pequeños negocios. Planeas una secuencia de fotos que cuenta una historia.",
    `Historia: ${o.tema}`,
    "Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:",
    `{"titulo": "texto", "fotos": [${o.n} objetos {"momento": "texto", "prompt": "texto"}]}`,
    `- Exactamente ${o.n} fotos, cada una un momento distinto de la MISMA historia, en orden cronológico (inicio, desarrollo y final).`,
    "- No repitas el mismo sujeto, la misma escena ni el mismo ángulo: cada foto debe verse claramente distinta de las demás.",
    '- "titulo": nombre corto de la historia, máximo 6 palabras.',
    `- "momento": etiqueta corta del momento, de 2 a 5 palabras (máximo ${MAX_MOMENTO} caracteres), sin numerar.`,
    `- "prompt": descripción EN INGLÉS de la foto de ese momento, una sola línea de máximo ${MAX_PALABRAS_PROMPT} palabras: sujeto, acción, lugar y encuadre.`,
    `- El estilo de todas las fotos es «${estilo.nombre}» y la app lo agrega sola: no describas el estilo ni la iluminación general en el prompt.`,
    "- Fotos sin texto, letras, logotipos ni marcas dentro de la imagen. No uses nombres de personas reales ni de marcas.",
    o.english
      ? 'Write "titulo" and "momento" in English (keep the JSON keys exactly as specified).'
      : 'Escribe "titulo" y "momento" en español.',
    o.marca ? `\nContexto de la marca:\n${o.marca}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Sin acentos, signos ni mayúsculas, para comparar
const normal = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const palabras = (t: string) => new Set(normal(t).split(" ").filter((w) => w.length >= 3));

// Cuánto se parecen dos prompts: palabras en común sobre las del más largo (1 = las mismas palabras).
function parecido(a: string, b: string): number {
  const A = palabras(a);
  const B = palabras(b);
  const mayor = Math.max(A.size, B.size);
  if (!mayor) return 1;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / mayor;
}

// Extrae el JSON aunque venga con ```json o texto alrededor (objeto, o la lista de fotos sola).
function extraerJson(texto: string): unknown {
  const t = texto.replace(/```(?:json)?/gi, "");
  for (const [abre, cierra] of [["{", "}"], ["[", "]"]]) {
    const ini = t.indexOf(abre);
    const fin = t.lastIndexOf(cierra);
    if (ini < 0 || fin <= ini) continue;
    try {
      return JSON.parse(t.slice(ini, fin + 1));
    } catch {
      /* se prueba la otra forma */
    }
  }
  return null;
}

const linea = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "");

export function leerSecuencia(texto: string, n: number, estilo: string): { titulo: string; fotos: IdeaFoto[] } {
  const error = () => new Error("La IA no pudo armar la secuencia. Intenta de nuevo.");
  const json = extraerJson(texto);
  const obj = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  const lista = Array.isArray(json) ? json : obj?.fotos;
  if (!Array.isArray(lista)) throw error();
  const sufijo = estiloDe(estilo).sufijo;

  // Primero se quitan las vacías y las repetidas; luego se toma hasta n (así una repetida la reemplaza la que sigue).
  const fotos: IdeaFoto[] = [];
  for (const item of lista) {
    if (fotos.length >= n) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const momento = linea(r.momento).replace(/^\d+[.)-]\s*/, "").slice(0, MAX_MOMENTO).trim();
    const prompt = linea(r.prompt).split(" ").slice(0, MAX_PALABRAS_PROMPT).join(" ").replace(/[\s,.;]+$/, "");
    if (!momento || !prompt) continue;
    const repetida = fotos.some((f) => normal(f.momento) === normal(momento) || parecido(f.prompt, prompt) >= 0.8);
    if (repetida) continue;
    fotos.push({ momento, prompt });
  }
  if (fotos.length < MIN_FOTOS) throw error();
  return {
    titulo: linea(obj?.titulo).slice(0, MAX_MOMENTO),
    fotos: fotos.map((f) => ({ momento: f.momento, prompt: `${f.prompt}, ${sufijo}` })),
  };
}

// ---------- Guion de NOVA ----------

export const palabrasGuion = (segundos: number): number => Math.round(segundos * 2.4);

export function promptGuion(o: { tema: string; momentos: string[]; segundos: number; marca?: string; english: boolean }): string {
  const palabras = palabrasGuion(o.segundos);
  return [
    PERSONA_NOVA,
    `Escribe el guion de voz en off de un video de ${o.segundos} segundos hecho con una secuencia de fotos.`,
    `Historia: ${o.tema}`,
    `Fotos del video, en orden:\n${o.momentos.map((m, i) => `${i + 1}. ${m}`).join("\n")}`,
    "- Cuenta la historia siguiendo los momentos en orden, como si narraras lo que se ve en cada foto.",
    `- Unas ${palabras} palabras (entre ${Math.round(palabras * 0.85)} y ${Math.round(palabras * 1.15)}), para que se lea en ${o.segundos} segundos.`,
    "- Tono cálido y profesional, natural para leerse en voz alta.",
    "- Termina con una llamada a la acción corta.",
    "- Solo el texto que se lee: sin título, sin comillas, sin emojis, sin hashtags y sin indicaciones de escena ni de música.",
    "- No inventes precios, cifras ni testimonios.",
    o.english ? "Write the voice-over in English." : "Escribe el guion en español.",
    o.marca ? `\nContexto de la marca:\n${o.marca}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const ETIQUETA = /^\s*(voz en off|guion|guión|locución|locucion|narración|narracion|voice[- ]?over|script|narration)\s*:\s*/i;

export function limpiarGuion(texto: string): string {
  let t = texto
    .replace(/```[a-z]*/gi, " ")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ") // indicaciones de escena: [Música suave], (pausa)
    .replace(/#[\p{L}\p{N}_]+/gu, " ") // hashtags
    .replace(/\p{Extended_Pictographic}️?/gu, " ") // emojis
    .replace(/^\s*#+\s*/gm, "") // títulos de Markdown
    .replace(/\*\*|__|\*|_/g, "");
  // Etiquetas al inicio de cada línea y líneas vacías
  t = t
    .split("\n")
    .map((l) => l.replace(ETIQUETA, "").trim())
    .filter(Boolean)
    .join(" ");
  t = t.replace(ETIQUETA, "").replace(/\s+/g, " ").trim();
  // Comillas que envuelven todo el guion
  for (;;) {
    const m = t.match(/^(["“”«'‘])([\s\S]*)(["“”»'’])$/);
    if (!m) break;
    t = m[2].trim();
  }
  return t.replace(/\s+([.,;:!?])/g, "$1");
}
