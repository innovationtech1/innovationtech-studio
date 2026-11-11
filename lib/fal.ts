import "server-only";
import { createHash, createPublicKey, verify } from "node:crypto";

// Cliente mínimo de fal.ai (cola REST + avisos por webhook). Sin dependencias.
// La clave (FAL_KEY) nunca se registra ni sale del servidor.

export const falConfigurado = () => !!(process.env.FAL_KEY ?? "").trim();
const claveDeEntorno = () => (process.env.FAL_KEY ?? "").trim();

export type EntradaFal = {
  image_url: string;
  prompt: string;
  duration?: string | number;
  resolution?: string;
  prompt_expansion_mode?: string;
};

const MOVIMIENTO_BASE = "Subtle natural motion, slow cinematic camera move";

// Lo que se le manda al modelo. Cada familia acepta parámetros distintos:
// - MiniMax (H3): duración en número, resolución ("480P", "768P") y expansión del texto.
// - Kling: duración como texto ("5"), sin resolución.
// - Los demás (Wan…): duración como texto y resolución si la configuración la trae.
export function entradaDeModelo(
  modelo: { id: string; resolucion?: string },
  imagenUrl: string,
  movimiento: string,
  segundos: number,
): EntradaFal {
  const base = { image_url: imagenUrl, prompt: movimiento.trim() || MOVIMIENTO_BASE };
  const resolucion = modelo.resolucion ? { resolution: modelo.resolucion } : {};
  if (/^minimax\//i.test(modelo.id)) return { ...base, duration: segundos, ...resolucion, prompt_expansion_mode: "balanced" };
  if (/kling/i.test(modelo.id)) return { ...base, duration: String(segundos) };
  return { ...base, duration: String(segundos), ...resolucion };
}

// Solo ids con forma de modelo (letras, números, guiones, puntos y diagonales): nunca una URL armada por otro.
const MODELO_VALIDO = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/i;

export async function enviarAFal(
  modelo: string,
  input: EntradaFal,
  webhook: string,
  f: typeof fetch = fetch,
  clave: string = claveDeEntorno(),
): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
  if (!clave) throw new Error("Falta FAL_KEY");
  if (!MODELO_VALIDO.test(modelo) || modelo.includes("..")) throw new Error("Id de modelo de fal no válido");
  const res = await f(`https://queue.fal.run/${modelo}?fal_webhook=${encodeURIComponent(webhook)}`, {
    method: "POST",
    headers: { Authorization: `Key ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`fal.ai no aceptó el trabajo (${res.status})`);
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof d.request_id !== "string" || typeof d.status_url !== "string" || typeof d.response_url !== "string") {
    throw new Error("fal.ai respondió sin los datos del trabajo");
  }
  return { requestId: d.request_id, statusUrl: d.status_url, responseUrl: d.response_url };
}

// Las URL de estado y resultado vienen de fal; aun así solo se consulta (con la clave) a fal.run.
function urlDeFal(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(u.hostname === "fal.run" || u.hostname.endsWith(".fal.run"))) throw new Error("URL de fal no válida");
  return u.toString();
}

export async function estadoFal(statusUrl: string, f: typeof fetch = fetch, clave: string = claveDeEntorno()): Promise<string> {
  const res = await f(urlDeFal(statusUrl), { headers: { Authorization: `Key ${clave}` } });
  if (!res.ok) throw new Error(`No se pudo consultar fal.ai (${res.status})`);
  const d = (await res.json().catch(() => ({}))) as { status?: unknown };
  return typeof d.status === "string" ? d.status : "";
}

// El video de un resultado de fal (del aviso o de la consulta), o null si no trae.
export function videoDe(payload: unknown): { videoUrl: string } | null {
  const url = (payload as { video?: { url?: unknown } } | null)?.video?.url;
  return typeof url === "string" && /^https:\/\//i.test(url) ? { videoUrl: url } : null;
}

export async function resultadoFal(
  responseUrl: string,
  f: typeof fetch = fetch,
  clave: string = claveDeEntorno(),
): Promise<{ videoUrl: string } | null> {
  const res = await f(urlDeFal(responseUrl), { headers: { Authorization: `Key ${clave}` } });
  if (!res.ok) return null;
  return videoDe(await res.json().catch(() => null));
}

// Llaves públicas de fal para revisar la firma de los avisos (en memoria hasta 24 h).
const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
const JWKS_DURA = 24 * 60 * 60 * 1000;
let jwksCache: { hasta: number; llaves: { x: string }[] } | null = null;
async function jwksDeFal(): Promise<{ x: string }[]> {
  if (jwksCache && Date.now() < jwksCache.hasta) return jwksCache.llaves;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`No se pudieron leer las llaves de fal (${res.status})`);
  const d = (await res.json()) as { keys?: { x?: unknown }[] };
  const llaves = (d.keys ?? []).filter((k): k is { x: string } => typeof k.x === "string");
  if (llaves.length === 0) throw new Error("fal no publicó llaves");
  jwksCache = { hasta: Date.now() + JWKS_DURA, llaves };
  return llaves;
}

const TOLERANCIA_S = 300;

// ¿El aviso viene de fal? Firma ED25519 sobre «requestId\nuserId\ntimestamp\nsha256(cuerpo)».
export async function verificarFirmaFal(
  headers: Headers,
  cuerpo: string,
  ahora: number = Date.now(),
  jwks: () => Promise<{ x: string }[]> = jwksDeFal,
): Promise<boolean> {
  const requestId = headers.get("x-fal-webhook-request-id");
  const userId = headers.get("x-fal-webhook-user-id");
  const ts = headers.get("x-fal-webhook-timestamp");
  const firmaHex = headers.get("x-fal-webhook-signature");
  if (!requestId || !userId || !ts || !firmaHex) return false;
  if (!/^\d+$/.test(ts) || Math.abs(Math.floor(ahora / 1000) - Number(ts)) > TOLERANCIA_S) return false;
  if (!/^([0-9a-f]{2})+$/i.test(firmaHex)) return false;
  const firma = Buffer.from(firmaHex, "hex");
  const hash = createHash("sha256").update(cuerpo, "utf8").digest("hex");
  const mensaje = Buffer.from([requestId, userId, ts, hash].join("\n"), "utf8");
  let llaves: { x: string }[];
  try {
    llaves = await jwks();
  } catch {
    return false;
  }
  for (const { x } of llaves) {
    try {
      const llave = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x }, format: "jwk" });
      if (verify(null, mensaje, llave, firma)) return true;
    } catch {
      // llave mal formada: se prueba la siguiente
    }
  }
  return false;
}
