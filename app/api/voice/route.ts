import { jsonError } from "@/lib/replicate";
import { clavePropiaCF, getCreds, refund } from "@/lib/cf-auth";
import { jsonAcceso, requireAccess } from "@/lib/account";
import { DEFAULT_VOICE, findVoice } from "@/lib/voices";

export const maxDuration = 60;
const TIEMPO_MAXIMO_MS = 25_000;

// Voz en off gratis con Cloudflare Workers AI. Devuelve el audio MP3 como data URL.
// Voces naturales: Deepgram Aura-2 (español e inglés). Voz básica: MeloTTS.
export async function POST(req: Request) {
  const { text, lang, voice: voiceId } = await req.json().catch(() => ({}));
  if (!text || typeof text !== "string") return jsonError("Escribe el texto de la voz en off.");
  // Guardián: sesión, plan y límite diario, antes de llamar a Cloudflare.
  const acceso = await requireAccess(req, { herramienta: "voz", contador: "voces", clavePropia: clavePropiaCF(req), cloudflare: true });
  if (!acceso.ok) return jsonAcceso(acceso);
  const c = getCreds(req, "voice", 1, acceso.cfGuardada);
  if ("error" in c) {
    await acceso.devolver();
    return jsonError(c.error, c.status);
  }
  const { accountId, token } = c;

  const l = lang === "en" ? "en" : "es";
  // Solo voces de la lista (no se acepta cualquier modelo desde el navegador).
  const voice = findVoice(voiceId) || findVoice(DEFAULT_VOICE[l])!;
  const body = voice.speaker
    ? { text: text.slice(0, 1800), speaker: voice.speaker, encoding: "mp3" }
    : { prompt: text.slice(0, 1500), lang: voice.lang };

  // Netlify corta la función a los 30 s y entonces la voz descontada no se devolvería: se corta antes
  // (25 s), se devuelve la voz y se responde con un mensaje claro.
  let res: Response;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${voice.model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
  } catch {
    if (c.demo) refund(req, "voice");
    await acceso.devolver();
    return jsonError("La voz tardó demasiado en generarse y no se descontó. Intenta de nuevo; si se repite, usa un guion más corto.", 504);
  }

  const type = res.headers.get("content-type") || "";
  if (res.ok && type.startsWith("audio/")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return Response.json({ audio: `data:${type.split(";")[0]};base64,${buf.toString("base64")}` });
  }
  if (res.ok && !type.includes("json")) {
    // Algunas respuestas llegan como binario sin tipo de audio: es MP3.
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1000) return Response.json({ audio: `data:audio/mpeg;base64,${buf.toString("base64")}` });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    if (c.demo) refund(req, "voice");
    await acceso.devolver();
    return jsonError(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`, 502);
  }
  const audio = data?.result?.audio ?? data?.audio;
  if (!audio || typeof audio !== "string") {
    await acceso.devolver();
    return jsonError("Cloudflare no devolvió audio. Intenta de nuevo.", 502);
  }
  return Response.json({ audio: audio.startsWith("data:") ? audio : `data:audio/mpeg;base64,${audio}` });
}
