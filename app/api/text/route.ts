import { jsonError } from "@/lib/replicate";

// Genera textos de marketing con Claude usando la clave del usuario.
export async function POST(req: Request) {
  const key = req.headers.get("x-anthropic-key");
  if (!key) return jsonError("Falta tu clave de Anthropic. Agrégala en Configuración.", 401);

  const { prompt, platform, brand, model } = await req.json().catch(() => ({}));
  if (!prompt || typeof prompt !== "string") return jsonError("Escribe qué quieres crear.");

  const system = [
    "Eres el estratega creativo de InnovationTECH Studio, experto en marketing digital y redes sociales.",
    "Escribe en el idioma del usuario. Entrega textos listos para publicar, concretos y persuasivos.",
    "Incluye: 1) Copy principal, 2) 3 variantes de gancho, 3) hashtags relevantes, 4) llamada a la acción.",
    "Al final añade una sección 'PROMPT DE IMAGEN:' con una descripción visual en inglés (una sola línea) para generar la imagen del post,",
    "y una sección 'PROMPT DE VIDEO:' con una descripción en inglés (una sola línea) de un clip corto para reel.",
    brand ? `\nContexto de la marca:\n${brand}` : "",
  ].join("\n");

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
      messages: [{ role: "user", content: `Plataforma: ${platform || "Instagram"}\n\nPedido: ${prompt}` }],
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
