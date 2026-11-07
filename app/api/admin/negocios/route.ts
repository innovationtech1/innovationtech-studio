import { listar } from "@/lib/admin-api";
import { errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";

export const dynamic = "force-dynamic";

// Lista de todos los negocios (solo administrador).
export async function GET(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const r = await listar(s.email, s.emailVerified);
  return r.ok ? json({ negocios: r.negocios }) : errorJson(r);
}
