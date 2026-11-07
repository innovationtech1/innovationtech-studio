import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { pagarPlan } from "@/lib/stripe-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// «Elegir Básico / Pro»: { plan } → { url } (pago de Stripe, portal o cambio de plan).
export async function POST(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { plan } = await cuerpoJson(req);
  const r = await pagarPlan(s.uid, s.email, plan, new URL(req.url).origin);
  return r.ok ? json({ url: r.url }) : errorJson(r);
}
