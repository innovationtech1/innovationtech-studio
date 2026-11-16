import { MODELO_CREATIVO } from "@/lib/nova";
import { crearLimitador, crearTopeDiario } from "@/lib/nova-voz";
import { ESPACIO_TORTAS_MS, TOPE_TORTAS_DIA, hoyEnSanAntonio, instruccionesTortas, origenPermitido, validarPlatica } from "@/lib/nova-tortas";

export const maxDuration = 30;
const TIEMPO_MAXIMO_MS = 25_000;

// NOVA para la página de Tortas Tortuga (otra página, sin cuenta de Studio): por eso lleva permiso de
// origen (CORS) y sus propios topes por persona, en lugar del guardián de cuentas. Paga la cuenta de
// Cloudflare de InnovationTECH (CF_ACCOUNT_ID / CF_API_TOKEN); las claves nunca salen del servidor.
const permitir = crearLimitador(ESPACIO_TORTAS_MS);
const topeDiario = crearTopeDiario(TOPE_TORTAS_DIA);

const ipDe = (req: Request) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "anon";

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  const origin = origenPermitido(req.headers.get("origin"));
  return new Response(null, { status: origin ? 204 : 403, headers: origin ? cors(origin) : {} });
}

export async function POST(req: Request) {
  const origin = origenPermitido(req.headers.get("origin"));
  if (!origin) return Response.json({ error: "Origen no permitido." }, { status: 403 });
  const headers = cors(origin);
  const error = (message: string, status = 400) => Response.json({ error: message }, { status, headers });

  const platica = validarPlatica(await req.json().catch(() => null));
  if (!platica.ok) return error(platica.error);
  const ip = ipDe(req);
  if (!permitir(ip)) return error("Vas muy rápido. Espera un momento.", 429);
  if (!topeDiario(ip, platica.letras)) return error("NOVA ya platicó mucho contigo hoy. Puedes ordenar con el menú de siempre o llamar al 210-TORTA-10.", 429);

  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) return error("NOVA no está disponible en este momento.", 503);

  const system = instruccionesTortas({ english: platica.english, hoy: hoyEnSanAntonio(), contexto: platica.contexto });
  let res: Response;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODELO_CREATIVO}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: system }, ...platica.history], max_tokens: 400, temperature: 0.3, stream: true }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
  } catch {
    return error("NOVA tardó demasiado. Intenta de nuevo.", 504);
  }
  if (!res.ok || !res.body) return error("NOVA no pudo contestar. Intenta de nuevo.", 502);

  // Eventos SSE ("data: {...}") → texto simple, a medida que la IA lo escribe
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = "";
  const texto = res.body.pipeThrough(
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
            const j = JSON.parse(payload);
            const piece = typeof j?.response === "string" ? j.response : j?.choices?.[0]?.delta?.content || "";
            if (piece) ctrl.enqueue(enc.encode(piece));
          } catch {
            /* línea incompleta */
          }
        }
      },
    })
  );
  return new Response(texto, { headers: { ...headers, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
