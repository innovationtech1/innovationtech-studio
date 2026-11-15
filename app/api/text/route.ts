import { MAX_TEXTO_AJUSTE, instruccionesAjuste, instruccionesImagen, validarAjuste, validarImagen } from "@/lib/director-secciones";
import { jsonError } from "@/lib/replicate";
import { clavePropiaCF, getCreds, refund } from "@/lib/cf-auth";
import { jsonAcceso, requireAccess, type Acceso } from "@/lib/account";
import { MAX_ORDEN, instruccionesDirector } from "@/lib/director";

export const maxDuration = 60;

type Gen = { system: string; user: string; maxTokens: number; temperatura?: number };

// Llama al proveedor elegido (Cloudflare gratis o Claude de pago) y devuelve el texto.
async function generate(req: Request, acceso: Extract<Acceso, { ok: true }>, provider: string, model: string | undefined, g: Gen): Promise<string> {
  if (provider === "cloudflare") {
    const c = getCreds(req, "text", 1, acceso.cfGuardada);
    if ("error" in c) {
      await acceso.devolver();
      throw Object.assign(new Error(c.error), { status: c.status });
    }
    const { accountId, token } = c;
    // En modo demo siempre se usa el modelo predeterminado
    const m = (!c.demo && model) || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    // Si la llamada ni siquiera llega (corte de red), tampoco se cobra el texto
    const sinCobro = async () => {
      if (c.demo) refund(req, "text");
      await acceso.devolver();
    };
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${m}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: g.system },
          { role: "user", content: g.user },
        ],
        max_tokens: g.maxTokens,
        temperature: g.temperatura ?? 0.8,
      }),
    }).catch(async () => {
      await sinCobro();
      throw new Error("No se pudo conectar con la IA de texto. Intenta de nuevo.");
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      if (c.demo) refund(req, "text");
      await acceso.devolver(); // con cuentas activas devuelve el uso reservado (no hace nada si está apagado)
      throw new Error(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`);
    }
    // Según el modelo, el texto llega en "response" o con formato tipo OpenAI.
    const r = data?.result ?? {};
    const text =
      (typeof r.response === "string" && r.response) ||
      r.choices?.[0]?.message?.content ||
      (r.response && typeof r.response === "object" ? JSON.stringify(r.response) : "");
    if (!text) {
      await acceso.devolver();
      throw new Error("Cloudflare no devolvió ningún texto. Prueba otra vez.");
    }
    return text;
  }

  const key = req.headers.get("x-anthropic-key");
  if (!key) {
    await acceso.devolver();
    throw Object.assign(new Error("Falta tu clave de Anthropic. Agrégala en Configuración."), { status: 401 });
  }
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
  if (!res.ok) {
    await acceso.devolver();
    throw new Error(data?.error?.message || `Anthropic respondió ${res.status}`);
  }
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
  const { prompt, platform, brand, model, provider, mode, scenes, dates, previous, estado, catalogo, texto, actual } = await req.json().catch(() => ({}));
  if (!prompt || typeof prompt !== "string") return jsonError("Escribe qué quieres crear.");
  if ((mode === "director" || mode === "ajustar" || mode === "director_imagen") && prompt.length > MAX_ORDEN) return jsonError(`La orden es muy larga (máximo ${MAX_ORDEN} caracteres).`);
  const english = req.headers.get("x-lang") === "en";
  const brandBlock =
    (brand ? `\nContexto de la marca:\n${brand}` : "") +
    (english ? "\nIMPORTANT: Write all the content in English (keep any required labels and JSON keys exactly as specified)." : "");

  // Guardián: sesión, plan y límite diario, antes de llamar a cualquier proveedor.
  // Con Anthropic la clave propia es la de Anthropic; con Cloudflare, la de Cloudflare.
  const acceso = await requireAccess(req, {
    herramienta: "textos",
    contador: "textos",
    clavePropia: provider !== "cloudflare" ? !!req.headers.get("x-anthropic-key") : clavePropiaCF(req),
    cloudflare: provider === "cloudflare", // solo así cuenta la clave guardada del negocio
  });
  if (!acceso.ok) return jsonAcceso(acceso);

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
      const text = await generate(req, acceso, provider, model, { system, user, maxTokens: 2600 });
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

    // Modo carrusel: portada + puntos + cierre, y el texto para publicar.
    if (mode === "carousel") {
      const n = Math.min(Math.max(Number(scenes) || 6, 3), 10);
      const system = [
        "Eres el estratega de contenido de una agencia de marketing. Escribes carruseles de Instagram que la gente guarda y comparte.",
        "Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:",
        `{"slides": [${n} objetos {"title": "texto", "body": "texto"}], "cover_image_prompt": "texto", "caption": "texto"}`,
        `- Exactamente ${n} diapositivas, en orden.`,
        '- Diapositiva 1 = PORTADA: "title" es un gancho que obligue a deslizar (máximo 8 palabras); "body" es un subtítulo de máximo 12 palabras.',
        `- Diapositivas 2 a ${n - 1} = UN punto cada una (consejo, paso, razón, beneficio o error): "title" de máximo 7 palabras, "body" de 12 a 28 palabras, concreto y útil. Sin numerar (la app pone el número).`,
        `- Diapositiva ${n} = CIERRE: "title" con la llamada a la acción (máximo 8 palabras); "body" de máximo 18 palabras (por ejemplo, invitar a escribir, visitar o guardar el post).`,
        '- "cover_image_prompt": descripción EN INGLÉS de una foto para la portada (una línea, fotografía publicitaria, sin texto dentro de la imagen).',
        '- "caption": texto para publicar con el carrusel: 2 a 4 frases + 4 a 6 hashtags.',
        "No inventes testimonios, cifras ni datos de clientes reales. Sin emojis dentro de title y body. Escribe en el idioma del pedido (por defecto, español).",
        brandBlock,
      ].join("\n");
      const user = [`Tema del carrusel: ${prompt}`, platform ? `Red social: ${platform}` : ""].filter(Boolean).join("\n");
      const text = await generate(req, acceso, provider, model, { system, user, maxTokens: 500 + n * 160 });
      const json = parseJson(text);
      const raw = Array.isArray(json?.slides) ? (json!.slides as Record<string, unknown>[]) : [];
      if (raw.length < 2) return jsonError("La IA no devolvió el carrusel en el formato esperado. Intenta de nuevo.", 502);
      const clean = (v: unknown) => String(v ?? "").replace(/^\s*\d+[.)-]\s*/, "").trim();
      const slides = raw.slice(0, n).map((r) => ({ title: clean(r?.title), body: String(r?.body ?? "").trim() }));
      return Response.json({
        slides,
        coverImagePrompt: typeof json?.cover_image_prompt === "string" ? json.cover_image_prompt : "",
        caption: typeof json?.caption === "string" ? json.caption : "",
      });
    }

    // Modo ajustar: corrige un texto ya creado según una orden («más corto», «en inglés»…). lib/director-secciones.ts
    if (mode === "ajustar") {
      const anterior = typeof texto === "string" ? texto.slice(0, MAX_TEXTO_AJUSTE) : "";
      if (!anterior.trim()) {
        await acceso.devolver();
        return jsonError("Primero crea un texto para poder corregirlo.");
      }
      const i = instruccionesAjuste({ texto: anterior, ingles: english });
      const salida = await generate(req, acceso, provider, model, { system: i.system, user: i.user(prompt), maxTokens: 1400, temperatura: 0.5 });
      const nuevo = validarAjuste(salida, anterior);
      if (!nuevo) {
        await acceso.devolver(); // no cambió nada: no se cobra
        return jsonError("No pude aplicar ese cambio. Dilo de otra forma.", 502);
      }
      return Response.json({ text: nuevo });
    }

    // Modo director de imágenes: la orden se convierte en descripción (en inglés), formato y cantidad.
    // La app llena los campos y pregunta antes de gastar imágenes.
    if (mode === "director_imagen") {
      const a = (actual && typeof actual === "object" ? actual : {}) as Record<string, unknown>;
      const i = instruccionesImagen({
        actual: {
          descripcion: String(a.descripcion ?? "").slice(0, 1000),
          formato: String(a.formato ?? "1:1").slice(0, 5),
          cantidad: Math.min(4, Math.max(1, Number(a.cantidad) || 1)),
          marca: a.marca !== false,
          fotos: Math.min(4, Math.max(0, Number(a.fotos) || 0)),
        },
        marca: typeof brand === "string" ? brand : undefined,
        ingles: english,
      });
      const salida = await generate(req, acceso, provider, model, { system: i.system, user: i.user(prompt), maxTokens: 500, temperatura: 0.4 });
      const orden = validarImagen(parseJson(salida));
      if (!orden) {
        await acceso.devolver(); // no se entendió: no se cobra el texto
        return jsonError("No entendí la orden. Dila de otra forma.", 502);
      }
      return Response.json(orden);
    }

    // Modo director: la orden (escrita o dictada) se traduce a acciones del catálogo (lib/director.ts).
    // La app las valida y las aplica; aquí solo se le pregunta a la IA.
    if (mode === "director") {
      const corto = (v: unknown) => String(v ?? "").slice(0, 60);
      const lista = (v: unknown) => (Array.isArray(v) ? v.slice(0, 40).filter((x) => x && typeof x === "object") : []) as Record<string, unknown>[];
      const cat = (catalogo && typeof catalogo === "object" ? catalogo : {}) as Record<string, unknown>;
      const resumen = estado && typeof estado === "object" && JSON.stringify(estado).length <= 12000 ? (estado as Record<string, unknown>) : {};
      const i = instruccionesDirector({
        resumen,
        estilos: lista(cat.estilos).map((e) => ({ id: corto(e.id), nombre: corto(e.nombre) })),
        voces: lista(cat.voces).map((v) => ({ id: corto(v.id), nombre: corto(v.nombre), genero: corto(v.genero) })),
        marca: typeof brand === "string" ? brand : undefined,
        ingles: english,
      });
      const text = await generate(req, acceso, provider, model, { system: i.system, user: i.user(prompt), maxTokens: 1500, temperatura: 0.2 });
      const json = parseJson(text);
      if (!json || !Array.isArray(json.acciones)) {
        await acceso.devolver(); // no se entendió: no se cobra el texto
        return jsonError("No entendí la orden. Dila de otra forma.", 502);
      }
      return Response.json({ acciones: json.acciones, mensaje: typeof json.mensaje === "string" ? json.mensaje.slice(0, 300) : "" });
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
      const text = await generate(req, acceso, provider, model, { system, user: `Tema del reel: ${prompt}`, maxTokens: 400 + n * 170 });
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
    const text = await generate(req, acceso, provider, model, {
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
