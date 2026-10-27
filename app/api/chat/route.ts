import { jsonError } from "@/lib/replicate";
import { getCreds, refund } from "@/lib/cf-auth";

export const maxDuration = 60;

type Msg = { role: "user" | "assistant"; content: string };
type Ev = { response?: unknown; choices?: { delta?: { content?: string } }[]; type?: string; delta?: { text?: unknown } };

// Asistente de marketing en modo conversación: recuerda lo que ya se habló y responde
// en tiempo real (se envía el texto a medida que la IA lo escribe).
export async function POST(req: Request) {
  const { messages, brand, provider, model } = await req.json().catch(() => ({}));
  const english = req.headers.get("x-lang") === "en";
  const history: Msg[] = (Array.isArray(messages) ? messages : [])
    .filter((m: Msg) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m: Msg) => ({ role: m.role, content: m.content.slice(0, 8000) }))
    .slice(-20); // las últimas 20 intervenciones
  if (!history.length || history[history.length - 1].role !== "user") return jsonError("Escribe tu mensaje.");

  const system = [
    "Eres el asistente creativo de InnovationTECH Studio: un experto en marketing digital, redes sociales y redacción publicitaria que ayuda a pequeños negocios.",
    "Conversa de forma natural y cercana. Recuerda lo que ya se dijo en la conversación y, cuando te pidan cambios, ajusta tu respuesta anterior en lugar de empezar de cero.",
    "Entrega textos listos para publicar: concretos, persuasivos y adaptados a la red social. Usa formato Markdown (negritas, listas, títulos cortos) cuando ayude a leer.",
    "Si falta un dato importante (producto, público, oferta, red social), haz una sola pregunta breve antes de escribir.",
    "Cuando propongas una imagen, agrega al final una línea que empiece con 'PROMPT DE IMAGEN:' con la descripción en inglés en una sola línea.",
    "No inventes testimonios, cifras ni datos de clientes. No uses lenguaje engañoso.",
    english ? "Write in English unless the user writes in another language." : "Responde en el idioma del usuario (por defecto, español).",
    brand ? `\nContexto de la marca del usuario (úsalo siempre):\n${brand}` : "",
  ].join("\n");

  const enc = new TextEncoder();

  // ---------- Cloudflare Workers AI (gratis) ----------
  if (provider !== "anthropic") {
    const c = getCreds(req, "text");
    if ("error" in c) return jsonError(c.error, c.status);
    const m = (!c.demo && model) || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(c.accountId)}/ai/run/${m}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: system }, ...history], max_tokens: 1800, temperature: 0.75, stream: true }),
    });
    if (!res.ok || !res.body) {
      if (c.demo) refund(req, "text");
      const data = await res.json().catch(() => ({}));
      return jsonError(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`, 502);
    }
    return new Response(sseToText(res.body, (j) => (typeof j?.response === "string" ? j.response : j?.choices?.[0]?.delta?.content || "")), {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // ---------- Claude de Anthropic (de pago) ----------
  const key = req.headers.get("x-anthropic-key");
  if (!key) return jsonError("Falta tu clave de Anthropic. Agrégala en Configuración.", 401);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: model || "claude-sonnet-5-5", max_tokens: 2000, system, messages: history, stream: true }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    return jsonError(data?.error?.message || `Anthropic respondió ${res.status}`, res.status === 401 ? 401 : 502);
  }
  return new Response(
    sseToText(res.body, (j) => (j?.type === "content_block_delta" && typeof j?.delta?.text === "string" ? j.delta.text : "")),
    { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }
  );

  // Convierte eventos SSE ("data: {...}") en texto simple
  function sseToText(body: ReadableStream<Uint8Array>, pick: (j: Ev) => string) {
    const dec = new TextDecoder();
    let buf = "";
    return body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, ctrl) {
          buf += dec.decode(chunk, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const piece = pick(JSON.parse(payload));
              if (piece) ctrl.enqueue(enc.encode(piece));
            } catch {
              /* línea incompleta */
            }
          }
        },
      })
    );
  }
}
