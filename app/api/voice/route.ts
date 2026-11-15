import { jsonError } from "@/lib/replicate";
import { clavePropiaCF, getCreds, refund } from "@/lib/cf-auth";
import { jsonAcceso, requireAccess } from "@/lib/account";
import { DEFAULT_VOICE, findVoice } from "@/lib/voices";
import { trozosDeGuion, unirMp3 } from "@/lib/voz-trozos";

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
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${voice.model}`;
  // Netlify corta la función a los 30 s y entonces la voz descontada no se devolvería: se corta antes
  // (25 s), se devuelve la voz y se responde con un mensaje claro. El mismo reloj cuenta para leer el audio.
  const reloj = AbortSignal.timeout(TIEMPO_MAXIMO_MS);

  // Pide un audio a Cloudflare y lo devuelve como MP3. Lanza un error con el motivo si no llega.
  async function pedir(cuerpo: Record<string, unknown>): Promise<Buffer> {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: reloj,
    });
    const type = res.headers.get("content-type") || "";
    if (res.ok && !type.includes("json")) {
      // Audio directo (a veces llega como binario sin tipo de audio: es MP3)
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1000) return buf;
      throw new Motivo("Cloudflare no devolvió audio. Intenta de nuevo.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) throw new Motivo(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`);
    const audio = data?.result?.audio ?? data?.audio;
    if (!audio || typeof audio !== "string") throw new Motivo("Cloudflare no devolvió audio. Intenta de nuevo.");
    return Buffer.from(audio.replace(/^data:[^,]*,/, ""), "base64");
  }

  try {
    let mp3: Buffer;
    if (voice.speaker) {
      // Voces naturales: un guion largo se parte por oraciones y los trozos se piden a la vez (tarda mucho menos)
      const trozos = trozosDeGuion(text.slice(0, 1800));
      if (trozos.length === 0) throw new Motivo("Escribe el texto de la voz en off.");
      const partes = await Promise.all(trozos.map((t) => pedir({ text: t, speaker: voice.speaker, encoding: "mp3" })));
      mp3 = unirMp3(partes);
    } else {
      mp3 = await pedir({ prompt: text.slice(0, 1500), lang: voice.lang });
    }
    return Response.json({ audio: `data:audio/mpeg;base64,${mp3.toString("base64")}` });
  } catch (e) {
    // Falló o tardó demasiado: la voz no se cobra
    if (c.demo) refund(req, "voice");
    await acceso.devolver();
    if (e instanceof Motivo) return jsonError(e.message, 502);
    return jsonError("La voz tardó demasiado en generarse y no se descontó. Intenta de nuevo; si se repite, usa un guion más corto.", 504);
  }
}

// Un fallo con mensaje para la persona (lo demás se trata como «tardó demasiado»)
class Motivo extends Error {}
