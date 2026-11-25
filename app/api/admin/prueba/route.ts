import { esCorreoAdmin } from "@/lib/account-api";
import { firestoreStore } from "@/lib/account-store";
import { cuerpoJson, errorJson, json, sesionDe, sinSesion } from "@/lib/cuenta-ruta";
import { ajustarPrueba, diasDePrueba } from "@/lib/prueba-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ¿Cuánto dura hoy la prueba gratis? (solo administrador). `dias` es null si no es 7, 15 ni 30.
export async function GET(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  if (!esCorreoAdmin(s.email, s.emailVerified)) return errorJson({ status: 403, error: "No tienes permiso para el panel de administrador." });
  const minutos = (await firestoreStore().getConfig()).pruebaMinutos;
  return json({ dias: diasDePrueba(minutos), minutos });
}

// Cambia la duración de la prueba gratis de las cuentas nuevas (solo administrador).
export async function PUT(req: Request) {
  const s = await sesionDe(req);
  if (!s) return sinSesion();
  const r = await ajustarPrueba(s.email, s.emailVerified, await cuerpoJson(req));
  return r.ok ? json({ dias: r.dias }) : errorJson(r);
}
