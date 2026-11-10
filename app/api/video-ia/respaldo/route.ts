import { createHash, timingSafeEqual } from "node:crypto";
import { baseDeEntorno, despachar } from "@/lib/video-ia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Respaldo de la fila de video: lo llama la función programada de Netlify cada 5 minutos
// (netlify/functions/video-ia-respaldo.mts). La contraseña sale de FAL_KEY: no hay que configurar nada más.
export async function POST(req: Request) {
  const clave = (process.env.FAL_KEY ?? "").trim();
  const esperado = Buffer.from(createHash("sha256").update(`respaldo:${clave}`).digest("hex"));
  const recibido = Buffer.from(req.headers.get("x-respaldo") ?? "");
  if (!clave || recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return new Response(null, { status: 404 });
  }
  const r = await despachar({ base: baseDeEntorno() ?? new URL(req.url).origin });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
