import { jsonError } from "@/lib/replicate";
import { getCreds, refund } from "@/lib/cf-auth";

export const maxDuration = 60;

type Gen = { system: string; user: string; maxTokens: number };

// Llama al proveedor elegido (Cloudflare gratis o Claude de pago) y devuelve el texto.
async function generate(req: Request, provider: string, model: string | undefined, g: Gen): Promise<string> {
  if (provider === "cloudflare") {
    const c = getCreds(req, "text");
    if ("error" in c) throw Object.assign(new Error(c.error), { status: c.status });
    const { accountId, token } = c;
    // En modo demo siempre se usa el modelo predeterminado
    const m = (!c.demo && model) || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${m}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: g.system },
          { role: "user", content: g.user },
        ],
        max_tokens: g.maxTokens,
        temperature: 0.8,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      if (c.demo) refund(req, "text");
      throw new Error(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`);
    }
    // Según el modelo, el texto llega en "response" o con formato tipo OpenAI.
    const r = data?.result ?? {};
    const text =
      (typeof r.response === "string" && r.response) ||
      r.choices?.[0]?.message?.content ||
      (r.response && typeof r.response === "object" ? JSON.stringify(r.response) : "");
    if (!text) throw new Error("Cloudflare no devolvió ningún texto. Prueba otra vez.");
    return text;
  }

  const key = req.headers.get("x-anthropic-key");
  if (!key) throw Object.assign(new Error("Falta tu clave de Anthropic. Agrégala en Configuración."), { status: 401 });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: model || "claude-sonnet-5-5",
      max_tokens: g.maxTokens,
      system: g.system,
      messages: [{ role: "user", content: g.user }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic respondió ${res.status}`);
  return (data.content || [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("\n");
}

// Extrae el primer objeto JSON del texto (los modelos a veces agregan texto alrededor).
function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { prompt, platform, brand, model, provider, mode, scenes, dates, previous } = await req.json().catch(() => ({}));
  if (!prompt || typeof prompt !== "string") return jsonError("Escribe qué quieres crear.");
  const english = req.headers.get("x-lang") === "en";
  const brandBlock =
    (brand ? `\nContexto de la marca:\n${brand}` : "") +
    (english ? "\nIMPORTANT: Write all the content in English (keep any required labels and JSON keys exactly as specified)." : "");

  try {
    // Modo calendario: un plan de publicaciones, una por fecha.
    if (mode === "calendar") {
      const list: string[] = Array.isArray(dates) ? dates.map(String).slice(0, 12) : [];
      if (!list.length) return jsonError("Faltan las fechas del calendario.");
      const n = list.length;
      const system = [
        "Eres el estratega de contenido de una agencia de marketing para pequeños negocios.",
        "Arma un calendario de publicaciones variado y realista para redes sociales.",
        "Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:",
        `{"items": [${n} objetos {"type": "post" | "reel" | "historia", "pillar": "texto", "title": "texto", "caption": "texto", "image_prompt": "texto"}]}`,
        `- Exactamente ${n} objetos, uno por fecha y en el mismo orden de las fechas.`,
        '- "type": alterna formatos; usa "reel" aprox. 1 de cada 3.',
        '- "pillar": el tipo de contenido en 1–3 palabras (Promoción, Producto, Detrás de cámaras, Consejo, Cliente feliz, Pregunta, Fecha especial…). Varíalos.',
        '- "title": frase corta para poner sobre la imagen, máximo 7 palabras.',
        '- "caption": texto listo para publicar de 1 a 3 frases + 3 a 5 hashtags. Si la fecha es especial (día festivo, fin de semana, quincena), aprovéchala.',
        '- "image_prompt": descripción EN INGLÉS de la foto (una línea, estilo fotografía publicitaria, sin texto dentro de la imagen).',
        "No inventes testimonios ni datos de clientes reales. Escribe en el idioma del pedido (por defecto, español).",
        brandBlock,
      ].join("\n");
      const user = [
        `Negocio y objetivo: ${prompt}`,
        platform ? `Red social principal: ${platform}` : "",
        typeof previous === "string" && previous ? `Ya se planearon estos temas (no los repitas): ${previous.slice(0, 1200)}` : "",
        `Fechas:\n${list.map((d, i) => `${i + 1}. ${d}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n");
      const text = await generate(req, provider, model, { system, user, maxTokens: 2600 });
      const json = parseJson(text);
      const raw = Array.isArray(json?.items) ? (json!.items as Record<string, unknown>[]) : [];
      if (!raw.length) return jsonError("La IA no devolvió el calendario en el formato esperado. Intenta de nuevo.", 502);
      const items = list.map((_, i) => {
        const r = raw[i] || {};
        const type = ["post", "reel", "historia"].includes(String(r.type)) ? String(r.type) : "post";
        return {
          type,
          pillar: String(r.pillar || ""),
          title: String(r.title || ""),
          caption: String(r.caption || ""),
          imagePrompt: String(r.image_prompt || ""),
        };
      });
      return Response.json({ items });
    }

    // Modo reel: textos cortos por escena + cierre + guion de voz.
    if (mode === "reel") {
      const n = Math.min(Math.max(Number(scenes) || 4, 1), 8);
      const system = [
        "Eres guionista de reels publicitarios para redes sociales.",
        "Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:",
        `{"captions": [${n} textos], "image_prompts": [${n} textos], "cta": "texto", "voiceover": "texto"}`,
        `- "captions": exactamente ${n} frases cortas (máximo 8 palabras cada una), una por escena, que cuenten una historia: gancho, beneficio(s) y oferta.`,
        `- "image_prompts": exactamente ${n} descripciones EN INGLÉS de la foto de cada escena (una línea cada una, estilo fotografía publicitaria, sin texto dentro de la imagen).`,
        '- "cta": llamada a la acción final, máximo 10 palabras.',
        `- "voiceover": guion para leer en voz alta que dure unos ${n * 3} segundos (aprox. ${n * 8} palabras), natural y entusiasta.`,
        "Escribe en el idioma del pedido (por defecto, español). Sin hashtags ni emojis.",
        brandBlock,
      ].join("\n");
      const text = await generate(req, provider, model, { system, user: `Tema del reel: ${prompt}`, maxTokens: 400 + n * 170 });
      const json = parseJson(text);
      const captions = Array.isArray(json?.captions) ? (json!.captions as unknown[]).map(String).slice(0, n) : [];
      if (!captions.length) return jsonError("La IA no devolvió los textos en el formato esperado. Intenta de nuevo.", 502);
      while (captions.length < n) captions.push("");
      const imagePrompts = Array.isArray(json?.image_prompts)
        ? (json!.image_prompts as unknown[]).map(String).slice(0, n)
        : [];
      while (imagePrompts.length < n) imagePrompts.push(`${prompt}, advertising photography, high quality`);
      return Response.json({
        captions,
        imagePrompts,
        cta: typeof json?.cta === "string" ? json.cta : "",
        voiceover: typeof json?.voiceover === "string" ? json.voiceover : "",
      });
    }

    const system = [
      "Eres el estratega creativo de InnovationTECH Studio, experto en marketing digital y redes sociales.",
      "Responde siempre en el idioma del pedido del usuario (por defecto, español). Entrega textos listos para publicar, concretos y persuasivos.",
      "Incluye: 1) Copy principal, 2) 3 variantes de gancho, 3) hashtags relevantes, 4) llamada a la acción.",
      "Al final añade una línea que empiece con 'PROMPT DE IMAGEN:' con una descripción visual en inglés (una sola línea) para generar la imagen del post,",
      "y una línea que empiece con 'PROMPT DE VIDEO:' con una descripción en inglés (una sola línea) de un clip corto para reel.",
      brandBlock,
    ].join("\n");
    const text = await generate(req, provider, model, {
      system,
      user: `Plataforma: ${platform || "Instagram"}\n\nPedido: ${prompt}`,
      maxTokens: 1500,
    });
    return Response.json({ text });
  } catch (e) {
    const err = e as Error & { status?: number };
    return jsonError(err.message, err.status || 502);
  }
}
