import { conectarClaveIA, desconectarClaveIA } from "@/lib/account-api";
import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";

export const runtime = "nodejs"; // node:crypto para cifrar la clave
export const dynamic = "force-dynamic";

// Conecta la cuenta de Cloudflare del negocio (solo el dueño): la prueba y la guarda cifrada.
// Nunca se devuelve el token: solo los últimos 4 del Account ID, o los resultados de la prueba.
export async function POST(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { accountId, token } = await cuerpoJson(req);
  const r = await conectarClaveIA(s.uid, { accountId, token });
  if (r.ok) return json({ ok: true, cuentaFin: r.cuentaFin });
  if (r.checks) return json({ error: r.error, checks: r.checks }, r.status);
  return errorJson(r);
}

// Desconecta la cuenta de Cloudflare del negocio (solo el dueño).
export async function DELETE(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const r = await desconectarClaveIA(s.uid);
  return r.ok ? json({ ok: true }) : errorJson(r);
}
