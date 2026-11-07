import "server-only";
import { verifyIdToken, type SesionVerificada } from "./verify-token";

// Ayudas comunes de las rutas /api/cuenta: sesión y respuestas sin caché.
const SIN_CACHE = { "Cache-Control": "no-store" };

export function json(cuerpo: unknown, status = 200): Response {
  return Response.json(cuerpo, { status, headers: SIN_CACHE });
}

export function errorJson(r: { status: number; error: string; codigo?: string }): Response {
  return json(r.codigo ? { error: r.error, codigo: r.codigo } : { error: r.error }, r.status);
}

export async function sesionDe(req: Request): Promise<SesionVerificada | null> {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  try {
    return await verifyIdToken(m[1]);
  } catch {
    return null;
  }
}

export const sinSesion = () => json({ error: "Inicia sesión para continuar.", codigo: "SESION" }, 401);

export async function cuerpoJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
