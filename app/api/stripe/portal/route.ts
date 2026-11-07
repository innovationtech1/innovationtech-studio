import { errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { abrirPortal } from "@/lib/stripe-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// «Administrar suscripción» / «Pagar para reactivar»: → { url } del portal de Stripe.
export async function POST(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const r = await abrirPortal(s.uid, new URL(req.url).origin);
  return r.ok ? json({ url: r.url }) : errorJson(r);
}
