import { esCorreoAdmin } from "@/lib/account-api";
import { firestoreStore } from "@/lib/account-store";
import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { ajustarImpuestos, prepararStripe } from "@/lib/stripe-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// «Preparar Stripe» (solo administrador): crea los precios si faltan y guarda sus ids.
export async function POST(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const r = await prepararStripe(s.email, s.emailVerified);
  return r.ok ? json({ precios: r.precios, paquetes: r.paquetes }) : errorJson(r);
}

// ¿Está encendido el cálculo de impuestos? (solo administrador)
export async function GET(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  if (!esCorreoAdmin(s.email, s.emailVerified)) return errorJson({ status: 403, error: "No tienes permiso para el panel de administrador." });
  return json({ impuestos: (await firestoreStore().getConfig()).impuestos });
}

// Enciende o apaga el cálculo de impuestos (Stripe Tax) en los cobros nuevos (solo administrador).
export async function PUT(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const r = await ajustarImpuestos(s.email, s.emailVerified, await cuerpoJson(req));
  return r.ok ? json({ impuestos: r.activo }) : errorJson(r);
}
