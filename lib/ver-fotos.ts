// «NOVA ve tus fotos»: la IA describe en una frase lo que hay en cada foto. Solo reglas, sin red ni
// pantalla: qué fotos se aceptan, qué se le pide al modelo, cómo se limpia lo que contesta y cómo se
// reparte un lote. Lo usan la ruta /api/ver y sus pruebas.

export const MODELO_VISION = "@cf/meta/llama-3.2-11b-vision-instruct";
export const MAX_FOTOS_VER = 8;
export const MAX_BYTES_FOTO_VER = 600 * 1024; // ya reducida en el teléfono (768 px de lado mayor)
export const MAX_DESCRIPCION = 80; // lo mismo que una línea del creador guiado
export const LADO_VER = 768;
const A_LA_VEZ = 3;

const FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function validarFotos(cuerpo: unknown): { ok: true; fotos: string[] } | { ok: false; error: string } {
  const fotos = (cuerpo as { fotos?: unknown } | null)?.fotos;
  if (!Array.isArray(fotos) || fotos.length === 0) return { ok: false, error: "Falta la foto." };
  if (fotos.length > MAX_FOTOS_VER) return { ok: false, error: `Son demasiadas fotos: el máximo es ${MAX_FOTOS_VER}.` };
  for (const f of fotos) {
    if (typeof f !== "string" || !FOTO.test(f)) return { ok: false, error: "Una de las fotos no se puede leer." };
    // base64: cada 4 letras son 3 bytes
    if ((f.length - f.indexOf(",") - 1) * 0.75 > MAX_BYTES_FOTO_VER) return { ok: false, error: "Una de las fotos pesa demasiado." };
  }
  return { ok: true, fotos: fotos as string[] };
}

// Se describe la escena, nunca a la persona
export function instruccionesVer(): string {
  return [
    "Describe en español, en una sola frase de máximo 15 palabras, lo que se ve en la foto: el producto, el lugar o la acción.",
    "Escribe solo la frase, sin comillas y sin empezar con «En la imagen».",
    "Si aparecen personas, no identifiques a nadie ni adivines su nombre, edad, origen, salud u otros datos: di solo lo que hacen (por ejemplo «dos personas comiendo»).",
    "No copies nombres de personas que aparezcan escritos en la foto.",
    "No inventes texto, marcas ni precios que no se lean con claridad.",
  ].join(" ");
}

export function cuerpoVision(foto: string) {
  return {
    messages: [
      { role: "system", content: instruccionesVer() },
      { role: "user", content: "¿Qué se ve en esta foto?" },
    ],
    image: foto,
    max_tokens: 60,
    temperature: 0.2,
  };
}

// Según el modelo, el texto llega en "response" o con formato tipo OpenAI
export function leerVision(datos: unknown): string {
  const r = (datos as { result?: { response?: unknown; choices?: { message?: { content?: unknown } }[] } } | null)?.result;
  if (typeof r?.response === "string") return r.response;
  const c = r?.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : "";
}

const MULETILLA = /^(?:(?:en\s+)?(?:la|esta)\s+(?:imagen|foto|fotograf[ií]a)\s+(?:se\s+(?:ve|observa|muestra|aprecia)n?|muestra|hay|aparecen?|contiene)|se\s+(?:ve|observa|muestra|aprecia)n?)\s*:?\s*/i;
const NEGATIVA = /^(?:lo siento|no puedo|no es posible|i can(?:'|’)?t|i cannot|i'm sorry|sorry|i am unable|as an ai)/i;

const CORTES = [", ", "; ", " y ", " que ", " donde "];
const SUELTAS = /[\s,;:]+(?:y|o|e|u|de|del|la|las|el|los|un|una|unos|unas|con|en|para|por|a|al|que|su|sus|se)$/i;

// Una frase que no cabe se corta donde termina una idea (coma, «y», «que»), no a media frase;
// si no hay dónde, se le quitan las palabras sueltas del final («…de la», «…y una»).
function acortar(t: string): string {
  let corto = t.slice(0, MAX_DESCRIPCION + 1).replace(/\s+\S*$/, "");
  const corte = Math.max(...CORTES.map((c) => corto.lastIndexOf(c)));
  if (corte >= MAX_DESCRIPCION / 2) corto = corto.slice(0, corte);
  for (let antes = ""; antes !== corto; ) {
    antes = corto;
    corto = corto.replace(SUELTAS, "").replace(/[\s,;:.]+$/, "");
  }
  return corto;
}

// Una línea lista para usarse; cadena vacía si el modelo se negó o no dijo nada útil
export function limpiarDescripcion(texto: unknown): string {
  if (typeof texto !== "string") return "";
  let t = texto.replace(/\s+/g, " ").trim().replace(/^["'«“”]+|["'»“”]+$/g, "").trim();
  if (!t || NEGATIVA.test(t)) return "";
  t = t.replace(MULETILLA, "").replace(/[.\s]+$/, "").trim();
  if (!t) return "";
  t = t[0].toUpperCase() + t.slice(1);
  return t.length > MAX_DESCRIPCION ? acortar(t) : t;
}

// Ve un lote: hasta 3 fotos a la vez, un reintento por foto, y la que no se pudo queda en null
// (una foto que falla no tumba a las demás). `ver` hace la llamada real y devuelve el texto crudo.
export async function verLote(fotos: string[], ver: (foto: string) => Promise<string>): Promise<(string | null)[]> {
  const salida: (string | null)[] = fotos.map(() => null);
  let siguiente = 0;
  async function trabajador() {
    for (;;) {
      const i = siguiente++;
      if (i >= fotos.length) return;
      for (let intento = 0; intento < 2 && salida[i] === null; intento++) {
        try {
          salida[i] = limpiarDescripcion(await ver(fotos[i])) || null;
        } catch {
          // se reintenta una vez; después queda sin ver
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, fotos.length) }, trabajador));
  return salida;
}

export const urlVision = (accountId: string) => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODELO_VISION}`;

// Cloudflare pide aceptar una vez la licencia de Meta antes de usar el modelo
export const esFaltaDeLicencia = (mensaje: unknown) => typeof mensaje === "string" && /agree|licen[sc]e|agreement/i.test(mensaje);

// Acepta la licencia del modelo de visión en esa cuenta. Solo se llama cuando el dueño de la cuenta
// toca el botón del panel de administrador: la app no acepta nada por su cuenta.
export async function activarVision(c: { accountId: string; token: string }, f: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!c.accountId || !c.token) return { ok: false, error: "Faltan las claves de Cloudflare de la plataforma." };
  let res: Response;
  try {
    res = await f(urlVision(c.accountId), {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "agree" }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, error: "No se pudo conectar con Cloudflare. Intenta de nuevo." };
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || datos?.success === false) {
    const mensaje = String(datos?.errors?.[0]?.message || "");
    // Cloudflare confirma la aceptación con forma de error: «Thank you for agreeing… You may now use the model.»
    if (/thank you for agreeing|you may now use the model/i.test(mensaje)) return { ok: true };
    return { ok: false, error: mensaje || `Cloudflare respondió ${res.status}` };
  }
  return { ok: true };
}
