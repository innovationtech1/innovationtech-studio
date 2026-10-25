import { jsonError } from "@/lib/replicate";
import { getCreds, refund } from "@/lib/cf-auth";

export const maxDuration = 60;

// Voz en off gratis con Cloudflare Workers AI (MeloTTS). Devuelve el audio MP3 como data URL.
export async function POST(req: Request) {
  const { text, lang, model } = await req.json().catch(() => ({}));
  if (!text || typeof text !== "string") return jsonError("Escribe el texto de la voz en off.");
  const c = getCreds(req, "voice");
  if ("error" in c) return jsonError(c.error, c.status);
  const { accountId, token } = c;

  const m = (!c.demo && model) || "@cf/myshell-ai/melotts";
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${m}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: text.slice(0, 1500), lang: lang || "es" }),
  });

  const type = res.headers.get("content-type") || "";
  if (res.ok && type.startsWith("audio/")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return Response.json({ audio: `data:${type.split(";")[0]};base64,${buf.toString("base64")}` });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    if (c.demo) refund(req, "voice");
    return jsonError(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`, 502);
  }
  const audio = data?.result?.audio ?? data?.audio;
  if (!audio || typeof audio !== "string") return jsonError("Cloudflare no devolvió audio. Intenta de nuevo.", 502);
  return Response.json({ audio: audio.startsWith("data:") ? audio : `data:audio/mpeg;base64,${audio}` });
}
