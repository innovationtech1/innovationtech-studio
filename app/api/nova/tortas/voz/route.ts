import { crearLimitador, crearTopeDiario, validarVoz } from "@/lib/nova-voz";
import { ESPACIO_VOZ_TORTAS_MS, TOPE_VOZ_TORTAS_DIA, origenPermitido } from "@/lib/nova-tortas";

export const maxDuration = 30;
const TIEMPO_MAXIMO_MS = 20_000;

// La voz de NOVA para la página de Tortas Tortuga: la misma voz de Studio (Deepgram Aura-2 en Cloudflare),
// con permiso de origen y topes propios en lugar del guardián de cuentas. Devuelve el MP3 de ≤ 400 letras.
// Si falla o se pasa del tope, la página usa la voz del aparato.
const permitir = crearLimitador(ESPACIO_VOZ_TORTAS_MS);
const topeDiario = crearTopeDiario(TOPE_VOZ_TORTAS_DIA);

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

  const pedido = validarVoz(await req.json().catch(() => null));
  if (!pedido.ok) return error(pedido.error);
  const ip = ipDe(req);
  if (!permitir(ip)) return error("NOVA está hablando muy seguido.", 429);
  if (!topeDiario(ip, pedido.text.length)) return error("NOVA ya habló mucho hoy.", 429);

  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) return error("La voz de NOVA no está disponible.", 503);

  const { voz, text } = pedido;
  try {
    // Igual que /api/nova/voz: el audio llega directo (MP3) o en JSON como base64
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${voz.model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, speaker: voz.speaker, encoding: "mp3" }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    const type = res.headers.get("content-type") || "";
    let mp3: Buffer | null = null;
    if (res.ok && !type.includes("json")) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1000) mp3 = buf;
    } else {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) return error("La voz de NOVA no respondió.", 502);
      const audio = data?.result?.audio ?? data?.audio;
      if (audio && typeof audio === "string") mp3 = Buffer.from(audio.replace(/^data:[^,]*,/, ""), "base64");
    }
    if (!mp3) return error("La voz de NOVA no respondió.", 502);
    return new Response(new Uint8Array(mp3), { headers: { ...headers, "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch {
    return error("La voz de NOVA tardó demasiado.", 504);
  }
}
