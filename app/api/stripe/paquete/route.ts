import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { comprarPaquete } from "@/lib/stripe-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// «Comprar paquete»: { paquete } → { url } (pago único de Stripe).
export async function POST(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const { paquete } = await cuerpoJson(req);
  const r = await comprarPaquete(s.uid, s.email, paquete, new URL(req.url).origin);
  return r.ok ? json({ url: r.url }) : errorJson(r);
}
