import { createHash } from "node:crypto";

// Función programada de Netlify (solo corre en la publicación de producción): cada 5 minutos empuja
// la fila de video con IA, por si se perdió un aviso de fal y nadie está consultando.
// Solo llama a la ruta /api/video-ia/respaldo de Studio, que hace el trabajo.
export default async function respaldo(_req: Request, context?: { site?: { url?: string } }): Promise<Response> {
  const base = (process.env.STUDIO_URL || process.env.URL || context?.site?.url || "").replace(/\/+$/, "");
  const clave = (process.env.FAL_KEY ?? "").trim();
  if (!base || !clave) return new Response("sin configurar", { status: 200 });
  const res = await fetch(`${base}/api/video-ia/respaldo`, {
    method: "POST",
    headers: { "x-respaldo": createHash("sha256").update(`respaldo:${clave}`).digest("hex") },
  });
  return new Response(`respaldo ${res.status}`, { status: 200 });
}

export const config = { schedule: "*/5 * * * *" };
