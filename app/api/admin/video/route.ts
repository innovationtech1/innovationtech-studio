import { errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { resumenVideo } from "@/lib/video-ia";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Resumen del video con IA (solo administrador): gasto de hoy, fila y últimos fallos con su motivo.
export async function GET(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const r = await resumenVideo(s.email, s.emailVerified);
  if (!r.ok) return errorJson(r);
  const { ok: _ok, ...datos } = r;
  void _ok;
  return json(datos);
}
