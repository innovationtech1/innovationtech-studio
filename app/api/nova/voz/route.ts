import { jsonError } from "@/lib/replicate";
import { clavePropiaCF, getCreds } from "@/lib/cf-auth";
import { jsonAcceso, requireAccess } from "@/lib/account";
import { ESPACIO_VOZ_MS, crearLimitador, validarVoz } from "@/lib/nova-voz";

export const maxDuration = 30;
const TIEMPO_MAXIMO_MS = 20_000;

// La voz de NOVA (Deepgram Aura-2 en Cloudflare Workers AI). Devuelve el MP3 de un trozo de ≤ 400 letras.
// No gasta el contador «voces» del plan (ni el del modo demo): lo cuida un tope de 1 pedido cada 3 s
// por persona en la memoria del servidor y el tope de letras.
const permitir = crearLimitador(ESPACIO_VOZ_MS);

// Quién pide: su sesión (los últimos caracteres del token, que son su firma) o su dirección IP.
// Se revisa ANTES del guardián, para que los pedidos seguidos no lleguen ni a leer la cuenta.
function quien(req: Request): string {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  if (m) return `t:${m[1].slice(-48)}`;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "anon";
  return `ip:${ip}`;
}

export async function POST(req: Request) {
  const pedido = validarVoz(await req.json().catch(() => null));
  if (!pedido.ok) return jsonError(pedido.error);
  if (!permitir(quien(req))) return jsonError("NOVA está hablando muy seguido. Espera un momento.", 429);

  // Guardián: sesión y plan (sin contador), antes de llamar a Cloudflare.
  const acceso = await requireAccess(req, { herramienta: "asistente", clavePropia: clavePropiaCF(req), cloudflare: true });
  if (!acceso.ok) return jsonAcceso(acceso);
  // 0 unidades: en el modo demo no se gastan las voces del día de la persona
  const c = getCreds(req, "voice", 0, acceso.cfGuardada);
  if ("error" in c) return jsonError(c.error, c.status);

  const { voz, text } = pedido;
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(c.accountId)}/ai/run/${voz.model}`;
  try {
    // Igual que /api/voice: el audio llega directo (MP3) o en JSON como base64
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
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
      if (!res.ok || data?.success === false) return jsonError(data?.errors?.[0]?.message || `Cloudflare respondió ${res.status}`, 502);
      const audio = data?.result?.audio ?? data?.audio;
      if (audio && typeof audio === "string") mp3 = Buffer.from(audio.replace(/^data:[^,]*,/, ""), "base64");
    }
    if (!mp3) return jsonError("Cloudflare no devolvió audio. Intenta de nuevo.", 502);
    return new Response(new Uint8Array(mp3), { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch {
    return jsonError("La voz de NOVA tardó demasiado. Intenta de nuevo.", 504);
  }
}
