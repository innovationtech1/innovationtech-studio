import { esCorreoAdmin } from "@/lib/account-api";
import { errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { activarVision } from "@/lib/ver-fotos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// «Activar NOVA ve tus fotos»: acepta la licencia del modelo de visión en la cuenta de Cloudflare de la
// plataforma. Solo el administrador, y solo cuando toca el botón del panel.
export async function POST(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  if (!esCorreoAdmin(s.email, s.emailVerified)) return errorJson({ status: 403, error: "No tienes permiso para el panel de administrador." });
  const r = await activarVision({ accountId: process.env.CF_ACCOUNT_ID ?? "", token: process.env.CF_API_TOKEN ?? "" });
  return r.ok ? json({ ok: true }) : errorJson({ status: 502, error: r.error });
}
