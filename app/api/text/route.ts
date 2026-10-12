import { jsonError } from "@/lib/replicate";

export const maxDuration = 60;

// Genera textos de marketing con Cloudflare Workers AI (gratis) o con Claude (de pago).
export async function POST(req: Request) {
  const { prompt, platform, brand, model, provider } = await req.json().catch(() => ({}));
  if (!prompt || typeof prompt !== "string") return jsonError("Escribe qué quieres crear.");

  const system = [
    "Eres el estratega creativo de InnovationTECH Studio, experto en marketing digital y redes sociales.",
    "Responde siempre en el idioma del pedido del usuario (por defecto, español). Entrega textos listos para publicar, concretos y persuasivos.",
    "Incluye: 1) Copy principal, 2) 3 variantes de gancho, 3) hashtags relevantes, 4) llamada a la acción.",
    "Al final añade una línea que empiece con 'PROMPT DE IMAGEN:' con una descripción visual en inglés (una sola línea) para generar la imagen del post,",
    "y una línea que empiece con 'PROMPT DE VIDEO:' con una descripción en inglés (una sola línea) de un clip corto para reel.",
    brand ? `\nContexto de la marca:\n${brand}` : "",
  ].join("\n");
  const user = `Plataforma: ${platform || "Instagram"}\n\nPedido: ${prompt}`;

  if (provider === "cloudflare") {
    const accountId = req.headers.get("x-cf-account");
    const token = req.headers.get("x-cf-token");
    if (!accountId || !token) {
      return jsonError("Faltan tu Account ID o tu token de Cloudflare. Agrégalos en Configuración.", 401);
    }
    const m = model || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${m}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: 1500,
          temperature: 0.8,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      return jsonError(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`, 502);
    }
    // Según el modelo, el texto llega en "response" o con formato tipo OpenAI.
    const r = data?.result ?? {};
    const text =
      (typeof r.response === "string" && r.response) ||
      r.choices?.[0]?.message?.content ||
      (typeof r.response === "object" ? JSON.stringify(r.response) : "");
    if (!text) return jsonError("Cloudflare no devolvió ningún texto. Prueba otra vez.", 502);
    return Response.json({ text });
  }

  const key = req.headers.get("x-anthropic-key");
  if (!key) return jsonError("Falta tu clave de Anthropic. Agrégala en Configuración.", 401);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-5-5",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return jsonError(data?.error?.message || `Anthropic respondió ${res.status}`, res.status);

  const text = (data.content || [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("\n");
  return Response.json({ text });
}
