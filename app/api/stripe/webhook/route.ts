import { json } from "@/lib/cuenta-ruta";
import { procesarWebhook } from "@/lib/stripe-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Avisos de Stripe (pagos, cambios y cancelaciones). La firma se revisa con el cuerpo tal cual
// llegó, por eso se lee como texto y no como JSON.
export async function POST(req: Request) {
  const cuerpo = await req.text();
  const r = await procesarWebhook(cuerpo, req.headers.get("stripe-signature"));
  return json(r.body, r.status);
}
