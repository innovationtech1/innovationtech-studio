import { errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { prepararStripe } from "@/lib/stripe-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// «Preparar Stripe» (solo administrador): crea los precios si faltan y guarda sus ids.
export async function POST(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const r = await prepararStripe(s.email, s.emailVerified);
  return r.ok ? json({ precios: r.precios }) : errorJson(r);
}
