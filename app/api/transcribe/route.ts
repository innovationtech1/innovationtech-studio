import { jsonError } from "@/lib/replicate";
import { getCreds, refund } from "@/lib/cf-auth";

export const maxDuration = 60;

type W = { w: string; start: number; end: number };

// Subtítulos automáticos: reconoce lo que se dice en un audio (WAV en base64, máx. ~90 s)
// con Whisper de Cloudflare Workers AI (gratis) y devuelve cada palabra con su tiempo.
export async function POST(req: Request) {
  const { audio, language } = await req.json().catch(() => ({}));
  if (!audio || typeof audio !== "string") return jsonError("Falta el audio.");
  if (audio.length > 4_000_000) return jsonError("El audio es muy largo. Usa fragmentos de menos de 90 segundos.", 413);
  const c = getCreds(req, "voice");
  if ("error" in c) return jsonError(c.error, c.status);

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(c.accountId)}/ai/run/@cf/openai/whisper-large-v3-turbo`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ audio, task: "transcribe", vad_filter: true, ...(language ? { language } : {}) }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    if (c.demo) refund(req, "voice");
    return jsonError(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`, 502);
  }
  const r = data?.result ?? data ?? {};
  const words: W[] = [];
  const segs: { start?: number; end?: number; text?: string; words?: { word?: string; start?: number; end?: number }[] }[] = Array.isArray(r.segments)
    ? r.segments
    : [];
  for (const s of segs) {
    if (Array.isArray(s.words) && s.words.length) {
      for (const w of s.words) {
        const t = String(w.word ?? "").trim();
        if (t && typeof w.start === "number" && typeof w.end === "number") words.push({ w: t, start: w.start, end: w.end });
      }
    } else if (s.text && typeof s.start === "number" && typeof s.end === "number") {
      // Sin tiempos por palabra: se reparten dentro del segmento
      const parts = s.text.trim().split(/\s+/);
      const d = (s.end - s.start) / Math.max(1, parts.length);
      parts.forEach((p, i) => words.push({ w: p, start: s.start! + i * d, end: s.start! + (i + 1) * d }));
    }
  }
  return Response.json({ words, text: typeof r.text === "string" ? r.text : words.map((w) => w.w).join(" ") });
}
